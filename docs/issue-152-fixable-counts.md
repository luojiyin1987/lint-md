# Issue #152：暴露可修复问题计数

状态：Proposed

关联：

- Core issue：[lint-md/lint-md#152](https://github.com/lint-md/lint-md/issues/152)
- CLI 需要新建独立 issue；现有 [lint-md/cli#54](https://github.com/lint-md/cli/issues/54) 处理的是 `--fix` 写入并发，已经关闭，与本需求无关

## 结论

在 `lintMarkdown()` 返回值中新增：

```typescript
{
  fixableErrorCount: number
  fixableWarningCount: number
}
```

计数由 core 产生，CLI 只负责透传、聚合和展示。

该变更拆成两个 PR：

1. `lint-md/lint-md`：实现并发布 core 的新返回字段。
2. `lint-md/cli`：升级 core，透传计数并启用现有的 potentially fixable 提示。

删除 `@lint-md/parser`、调整 parser 构建方式，以及修改自动修复算法均不属于本需求。

## 背景

规则通过 `context.report()` 上报问题。`ReportOption.fix` 是可选函数；存在该函数表示规则为该次问题提供了候选修复。

`ruleManager.getReportData()` 保留了 `fix`，但 `lintMarkdown()` 对外映射结果时只返回 `loc`、`message`、`name`、`content` 和 `severity`。CLI 因此无法判断问题是否可修复，只能把 `fixableErrorCount` 和 `fixableWarningCount` 固定为 `0`。

结果是 CLI 已有的以下提示永远不会出现：

```text
N errors and M warnings potentially fixable with the `--fix` option.
```

## 语义决定

### “可修复”的定义

当且仅当满足以下条件时，一条报告计入可修复数量：

```typescript
typeof report.fix === 'function'
```

不调用 `fix` 函数来完成计数。计数表示“规则提供了候选修复”，不保证该修复最终一定应用成功。

多个修复可能因范围重叠而进入 `notAppliedFixes`，这不会减少 fixable count。CLI 使用的是 “potentially fixable” 文案，与该语义一致。

### 严重级别

- `RULE_SEVERITY.ERROR` 计入 `fixableErrorCount`。
- `RULE_SEVERITY.WARN` 计入 `fixableWarningCount`。
- `RULE_SEVERITY.OFF` 不执行规则，因此不会产生报告或计数。

严重级别继续以 `registeredRules[report.name].severity` 为准，保证计数与公开 `lintResult` 中的 severity 一致。

### fix 模式

当前 `lintMarkdown(..., true)` 返回的是第一次 lint 得到的 `lintResult`，即修复前的问题集合。因此新增计数也基于修复前的问题集合。

本需求不改变这一行为，也不新增“修复后剩余可修复数量”。

### 公开结果形状

只增加两个顶层计数字段，不把 `fix` 函数暴露给调用方，也不改变现有 `lintResult` 元素结构。

这样可以：

- 保持 `lintResult` 的向后兼容；
- 避免函数通过 Piscina worker 边界传输；
- 直接满足 CLI 聚合需求。

本次不新增命名的 `LintMarkdownResult` 接口；继续使用 `lintMarkdown()` 的推导返回类型和生成的声明文件。显式整理公共返回类型可以另开重构任务。

## Core 改动

仓库：`lint-md/lint-md`

### 生产代码

修改 `src/core/lint-markdown.ts`：

1. 只调用一次 `lintResult.ruleManager.getReportData()`。
2. 在生成 `reportDataWithSeverity` 的同一次遍历中：
   - 解析报告对应的 severity；
   - 判断 `fix` 是否为函数；
   - 累加 error/warning 可修复数量；
   - 生成现有公开报告结构。
3. 在返回值中加入两个计数。

不修改：

- `src/utils/rule-manager.ts`
- `ReportOption`
- `LintDiagnostic`
- 单条 `lintResult` 的字段
- fix 执行和冲突处理逻辑

### 建议实现形状

```typescript
const reportData = lintResult.ruleManager.getReportData();
let fixableErrorCount = 0;
let fixableWarningCount = 0;

const reportDataWithSeverity = reportData.map((item) => {
  const severity = registeredRules[item.name].severity;

  if (typeof item.fix === 'function') {
    if (severity === RULE_SEVERITY.ERROR) {
      fixableErrorCount++;
    }
    else if (severity === RULE_SEVERITY.WARN) {
      fixableWarningCount++;
    }
  }

  const { loc, message, name, content } = item;
  return { loc, message, name, content, severity };
});
```

不要分别遍历报告来生成公开结果和统计计数，避免重复 severity 查找以及两套逻辑出现偏差。

### Core 测试

在 `__tests__/unit/` 增加面向 `lintMarkdown()` 公共返回值的测试，覆盖：

1. 可修复 error：`fixableErrorCount === 1`。
2. 可修复 warning：`fixableWarningCount === 1`。
3. 不可修复报告：两个计数均为 `0`。
4. error、warning、不可修复报告混合时分别正确计数。
5. 没有报告时两个计数均为 `0`。
6. `isFixMode` 为 `false` 时计数正确。
7. `isFixMode` 为 `true` 时计数对应修复前返回的 `lintResult`。
8. `lintResult` 元素仍不包含 `fix` 函数，保持公开结构和 worker 可序列化性。

测试优先使用测试内定义的最小规则，避免依赖内置规则未来是否提供 fix。

### Core 验证

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## CLI 改动

仓库：`lint-md/cli`

在开始实现前，新建专门的 CLI issue，并从 core #152 关联过去。core #152 当前关联的 CLI #54 应移除或更正，因为 #54 是已经完成的写入并发任务。

### 数据流

```text
lintMarkdown()
  -> lint-worker
  -> Piscina structured clone
  -> BatchLintItem
  -> getReportData()
  -> CLI summary
```

两个字段均为 number，可以安全通过 worker 边界。

### 生产代码

1. `src/utils/lint-worker.ts`
   - 将 `result.fixableErrorCount` 和 `result.fixableWarningCount` 加入 worker 返回值。

2. `src/types.ts`
   - 在 `BatchLintItem` 中增加两个计数字段。

3. `src/utils/get-report-data.ts`
   - 删除硬编码的两个 `0`。
   - 使用每个 `BatchLintItem` 携带的计数。
   - 保留当前跨文件求和和提示文案。

4. `src/lint-md.ts`
   - stdin 路径调用 `getReportData()` 时一并传入两个计数。
   - 普通文件路径继续使用 `batchLint()` 返回的数据。

5. `package.json`
   - 将 `@lint-md/core` 的最低版本提升到包含新字段的版本。

CLI 可以使用 `?? 0` 作为运行时防御，但依赖版本仍必须提升，不能依赖 fallback 长期兼容旧 core。

### CLI 测试

覆盖：

1. 单文件可修复 error 的 summary。
2. 单文件可修复 warning 的 summary。
3. 多文件计数聚合。
4. error 和 warning 混合时的语法与数量。
5. 只有不可修复问题时不显示 potentially fixable 行。
6. stdin 模式透传并显示计数。
7. worker 返回值可以通过 Piscina 传输。

### CLI 验证

```bash
npm run build
npm test
```

建议在 CLI CI 中使用已发布的新 core 版本，或安装 core 的本地 tarball，避免只在源码联调环境中通过。

## 发布顺序

1. 合并 core PR。
2. 发布包含新字段的 core minor 版本。
3. 新建并实现 CLI issue/PR。
4. CLI 升级 core 最低版本。
5. 发布 CLI minor 版本。
6. 验证文件模式和 stdin 模式的真实终端输出。
7. core #152 在 core 变更发布后关闭；CLI 的交付状态由新建的 CLI issue 跟踪。

## 验收标准

- `lintMarkdown()` 始终返回数值类型的两个 fixable count。
- 计数与同一次调用返回的 `lintResult` 对应。
- error 和 warning 按最终 severity 分别统计。
- `lintResult` 不暴露 `fix` 函数。
- fix 模式与非 fix 模式都有明确测试。
- CLI 不再硬编码 fixable count。
- CLI 文件模式和 stdin 模式均能显示准确的 potentially fixable 提示。
- core 和 CLI 的构建、类型检查及测试全部通过。

## 非目标

- 内置或删除 `@lint-md/parser`。
- 改变 Markdown AST 或 position 契约。
- 修改规则是否提供自动修复。
- 改变修复冲突策略。
- 返回每条报告的 `fixable` 字段。
- 返回修复后剩余问题计数。
- 重构整个 lint 返回类型。

## 后续独立任务

- 将 `lintMarkdown()` 的公开返回值整理为显式导出的类型。
- 评估是否需要同时暴露 `errorCount` 和 `warningCount`，形成更完整的结果统计 API。
- 修正自定义规则配置键与 `rule.meta.name` 不一致时 severity 查找失败的问题。
- 单独规划 `@lint-md/parser` 内置迁移。
