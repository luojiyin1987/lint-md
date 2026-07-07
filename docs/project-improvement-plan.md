# lint-md/core 项目改进计划

生成日期：2026-07-07

## 一、项目现状评估

### 1.1 优点

| 指标 | 状态 | 说明 |
|------|------|------|
| 测试覆盖率 | 94.26% | 语句覆盖良好，核心功能测试完整 |
| TypeScript | ✅ | 类型安全，使用 strictNullChecks |
| CI/CD | ✅ | GitHub Actions 多 Node 版本测试（20/22/24） |
| 性能优化 | 🔄 | 内存优化计划已启动（issue-160） |
| 代码规范 | ✅ | ESLint + Prettier 已配置 |

### 1.2 需要改进的问题

| 问题 | 严重程度 | 影响范围 |
|------|----------|----------|
| 依赖版本过旧 | 中 | 安全性、新特性 |
| ESLint 错误 | 低 | 代码质量 |
| 测试覆盖盲区 | 中 | 4 个文件覆盖率不足 |
| 文档缺失 | 中 | 开发者体验 |
| 开发工具不足 | 低 | 开发效率 |

---

## 二、依赖更新计划

### 2.1 当前依赖版本 vs 最新版本

```json
{
  "typescript": "4.9.5 → 6.0.3",
  "eslint": "8.57.1 → 10.6.0",
  "jest": "29.7.0 → 30.4.2",
  "@types/node": "18.19.130 → 26.1.0",
  "@types/jest": "29.5.14 → 30.0.0",
  "glob": "8.1.0 → 13.0.6",
  "rimraf": "3.0.2 → 6.1.3"
}
```

### 2.2 升级优先级

**P0 - 安全相关：**
- `typescript`: 大版本升级，需要测试兼容性
- `@types/node`: 类型定义更新

**P1 - 开发体验：**
- `eslint`: 大版本升级，配置格式变化较大
- `jest`: 测试框架升级

**P2 - 工具链：**
- `glob`: API 变化较大，需要适配
- `rimraf`: 可选升级

### 2.3 升级策略

```bash
# 1. 先升级 TypeScript（影响最小）
npm install typescript@^6.0.0 --save-dev

# 2. 升级类型定义
npm install @types/node@^26.0.0 @types/jest@^30.0.0 --save-dev

# 3. 升级 Jest（需要验证配置兼容性）
npm install jest@^30.0.0 ts-jest@^30.0.0 --save-dev

# 4. 最后升级 ESLint（配置变化最大）
npm install eslint@^10.0.0 --save-dev
```

---

## 三、测试覆盖率改进

### 3.1 当前覆盖率详情

| 文件 | 覆盖率 | 问题 |
|------|--------|------|
| `src/utils/mark-text.ts` | **0%** | 完全未测试 |
| `src/utils/override-default-rules.ts` | **54.54%** | 边界条件未覆盖 |
| `src/utils/text-scanner.ts` | **88.33%** | 错误路径未覆盖 |
| `src/core/run-lint.ts` | **90.9%** | 错误处理路径未覆盖 |

### 3.2 改进方案

#### 3.2.1 mark-text.ts（优先级：高）

```typescript
// 需要测试的场景：
// 1. 空字符串输入
// 2. 单字符输入
// 3. 多行文本标记
// 4. 特殊字符处理
// 5. 边界位置（开头、结尾）

// 建议的测试文件：
// __tests__/unit/utils/mark-text.spec.ts
```

#### 3.2.2 override-default-rules.ts（优先级：中）

```typescript
// 需要测试的场景：
// 1. 用户配置覆盖默认规则
// 2. 用户禁用规则（severity: 0）
// 3. 无效规则名称处理
// 4. 规则参数合并
// 5. 边界条件：空配置、全部禁用
```

#### 3.2.3 text-scanner.ts（优先级：中）

```typescript
// 需要测试的场景：
// 1. forEachChar 错误回调
// 2. findAllMatches 空匹配
// 3. matchAt 边界位置
// 4. 大文本处理性能
```

#### 3.2.4 run-lint.ts（优先级：低）

```typescript
// 需要测试的场景：
// 1. 规则执行抛出异常
// 2. 无效 AST 输入
// 3. 空规则数组
```

### 3.3 测试覆盖率目标

| 阶段 | 目标 | 时间 |
|------|------|------|
| 短期 | 所有文件 > 80% | 1 周 |
| 中期 | 核心文件 > 95% | 2 周 |
| 长期 | 整体 > 97% | 1 个月 |

---

## 四、ESLint 错误修复

### 4.1 当前错误列表

```
19 errors, 4 warnings in 5 files

FUNDING.yml:    9 errors  (yml/no-empty-mapping-value)
package.json:   8 errors  (jsonc/sort-keys)
README.md:      3 warnings (no-console)
build.yml:      1 error   (yml/no-empty-mapping-value)
test-utils.ts:  1 warning (no-console)
```

### 4.2 修复方案

#### 4.2.1 FUNDING.yml 修复

```yaml
# 当前问题：空值字段
# 修复：添加默认值或移除空字段

# 修复前
github: [lint-md]
patreon:
open_collective:

# 修复后
github: [lint-md]
# 移除空值字段或添加占位符
```

#### 4.2.2 package.json 修复

```json
// 当前问题：字段排序不符合 jsonc/sort-keys 规则
// 修复：按字母顺序重新排列字段
```

#### 4.2.3 no-console 警告

```typescript
// README.md: 添加 eslint-disable 注释或使用自定义 logger
// test-utils.ts: 使用 debug 模块替代 console.log
```

---

## 五、文档完善计划

### 5.1 缺失文档清单

| 文档 | 优先级 | 内容 |
|------|--------|------|
| API 文档 | P0 | lintMarkdown、toALEOutput 完整 API |
| 规则开发指南 | P0 | 如何创建自定义规则 |
| 配置指南 | P1 | 规则配置详解 |
| 性能优化指南 | P1 | 内存优化最佳实践 |
| 故障排除指南 | P2 | 常见问题解决方案 |
| 贡献指南 | P2 | 如何参与项目开发 |

### 5.2 API 文档结构

```markdown
# API Reference

## lintMarkdown(markdown, rules?, isFixMode?)

核心 lint 方法。

### Parameters

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `markdown` | `string` | - | Markdown 文本 |
| `rules` | `LintMdRulesConfig` | `{}` | 规则配置 |
| `isFixMode` | `boolean` | `true` | 是否启用修复模式 |

### Returns

```typescript
interface LintResult {
  lintResult: ReportData[] | null;
  diagnostics: LintDiagnostic[];
  fixedResult: string | null;
}
```

### Examples

```typescript
// 基础用法
const result = lintMarkdown('# Hello World');

// 配置规则
const result = lintMarkdown('中文English', {
  'space-around-alphabet': 2,
  'space-around-number': 2
});

// 仅诊断不修复
const result = lintMarkdown('...', {}, false);
```

## toALEOutput(diagnostics, filePath)

转换为 ALE 格式输出。

### Parameters

| 参数 | 类型 | 说明 |
|------|------|------|
| `diagnostics` | `LintDiagnostic[]` | 诊断结果 |
| `filePath` | `string` | 文件路径 |

### Returns

`string` - ALE 格式的诊断字符串
```

### 5.3 规则开发指南结构

```markdown
# 规则开发指南

## 快速开始

### 1. 创建规则文件

```typescript
// src/rules/my-rule.ts
import type { LintMdRule } from '../types';

const myRule: LintMdRule = {
  meta: {
    name: 'my-rule'
  },
  create: (context) => {
    return {
      text: (node) => {
        // 规则逻辑
        if (shouldReport(node)) {
          context.report({
            loc: node.position,
            message: '发现违规内容',
            fix: (fixer) => {
              return fixer.replaceTextRange([...], '修复内容');
            }
          });
        }
      }
    };
  }
};

export default myRule;
```

### 2. 注册规则

在 `src/rules/index.ts` 中导出规则。

### 3. 编写测试

创建 `__tests__/unit/rules/my-rule.spec.ts`。

### 4. 更新文档

在 README.md 规则表格中添加新规则。

## 规则 API

### LintMdRule

```typescript
interface LintMdRule {
  meta: {
    name: string;
  };
  create: (context: LintMdRuleContext) => Record<string, RuleSelector>;
}
```

### LintMdRuleContext

```typescript
interface LintMdRuleContext {
  report: (option: ReportOption) => void;
  options: Record<string, any>;
  ast: PositionedMarkdownRoot;
  markdown: string;
}
```

### RuleSelector

```typescript
type RuleSelector = (node: PositionedMarkdownNode) => void;
```

## 选择器类型

| 选择器 | 触发时机 | 节点类型 |
|--------|----------|----------|
| `text` | 文本节点 | `PositionedTextNode` |
| `code` | 代码块 | `PositionedCodeNode` |
| `inlineCode` | 行内代码 | `PositionedInlineCodeNode` |
| `link` | 链接 | `PositionedLinkNode` |
| `image` | 图片 | `PositionedImageNode` |
| `listItem` | 列表项 | `PositionedListItemNode` |
| `blockquote` | 引用块 | `PositionedBlockquoteNode` |

## 修复器 API

```typescript
interface Fixer {
  replaceTextRange(range: [number, number], text: string): FixConfig;
  removeRange(range: [number, number]): FixConfig;
  insertTextAfter(node: PositionedMarkdownNode, text: string): FixConfig;
}
```
```

---

## 六、开发工具改进

### 6.1 调试工具

```typescript
// src/utils/debug.ts
import debug from 'debug';

export const lintDebug = debug('lint-md:lint');
export const ruleDebug = debug('lint-md:rule');
export const parseDebug = debug('lint-md:parse');

// 使用方式
// DEBUG=lint-md:* npm test
```

### 6.2 规则测试生成器

```bash
# scripts/generate-rule-test.mjs
node scripts/generate-rule-test.mjs my-rule

# 生成文件：
# - src/rules/my-rule.ts（模板）
# - __tests__/unit/rules/my-rule.spec.ts（测试模板）
```

### 6.3 VSCode 调试配置

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand", "--testPathPattern=${file}"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Rule",
      "program": "${workspaceFolder}/scripts/debug-rule.mjs",
      "args": ["${input:ruleName}"],
      "console": "integratedTerminal"
    }
  ],
  "inputs": [
    {
      "id": "ruleName",
      "type": "promptString",
      "description": "Rule name to debug"
    }
  ]
}
```

---

## 七、性能优化建议

### 7.1 已有优化（issue-160）

- ✅ 基准测试脚本已创建
- ✅ 内存分析工具已就位
- 🔄 text 规则优化进行中

### 7.2 建议的额外优化

#### 7.2.1 缓存机制

```typescript
// src/utils/cache.ts
const astCache = new Map<string, PositionedMarkdownRoot>();

export function getCachedAst(markdown: string): PositionedMarkdownRoot {
  const hash = computeHash(markdown);
  if (astCache.has(hash)) {
    return astCache.get(hash)!;
  }
  const ast = parseMd(markdown);
  astCache.set(hash, ast);
  return ast;
}
```

#### 7.2.2 规则并行执行

```typescript
// 对于独立的规则，可以考虑并行执行
// 需要评估线程安全性和性能收益
```

#### 7.2.3 增量解析

```typescript
// 对于大型文档，只解析修改的部分
// 需要维护文档状态和 AST 映射
```

---

## 八、功能扩展建议

### 8.1 支持更多 Markdown 扩展

| 扩展 | 优先级 | 说明 |
|------|--------|------|
| GFM Tables | P0 | GitHub 风格表格 |
| GFM Task Lists | P1 | 任务列表 |
| MDX | P2 | JSX in Markdown |
| Frontmatter | P1 | YAML 前置元数据 |
| Math | P2 | LaTeX 数学公式 |
| Footnotes | P2 | 脚注 |

### 8.2 自定义规则插件系统

```typescript
// 插件接口
interface LintMdPlugin {
  name: string;
  rules: Record<string, LintMdRule>;
  configs?: Record<string, LintMdRulesConfig>;
}

// 使用方式
import { lintMarkdown } from '@lint-md/core';
import myPlugin from 'lint-md-plugin-my';

const result = lintMarkdown('...', {
  plugins: [myPlugin],
  rules: {
    'my-plugin/my-rule': 2
  }
});
```

### 8.3 规则预设

```typescript
// 预设配置
export const presets = {
  strict: {
    'space-around-alphabet': 2,
    'space-around-number': 2,
    'no-empty-code-lang': 2,
    // ... 所有规则启用
  },
  recommended: {
    'space-around-alphabet': 1,
    'space-around-number': 1,
    'no-empty-code-lang': 2,
    // ... 推荐配置
  },
  relaxed: {
    'space-around-alphabet': 0,
    'space-around-number': 0,
    'no-empty-code-lang': 1,
    // ... 宽松配置
  }
};
```

---

## 九、实施时间表

### 第一阶段：基础改进（1-2 周）

- [ ] 修复 ESLint 错误
- [ ] 补充 mark-text.ts 测试
- [ ] 创建 API 文档初稿
- [ ] 升级 TypeScript 到 6.x

### 第二阶段：质量提升（2-4 周）

- [ ] 提升测试覆盖率到 95%
- [ ] 完善规则开发指南
- [ ] 添加调试工具
- [ ] 升级 Jest 到 30.x

### 第三阶段：功能增强（1-2 月）

- [ ] 实现缓存机制
- [ ] 支持 GFM Tables 规则
- [ ] 设计插件系统
- [ ] 升级 ESLint 到 10.x

### 第四阶段：长期规划（3-6 月）

- [ ] 实现增量解析
- [ ] 支持 MDX
- [ ] 发布 3.0 版本

---

## 十、资源需求

| 资源 | 数量 | 说明 |
|------|------|------|
| 开发时间 | 2-3 人月 | 基础改进 + 质量提升 |
| 测试环境 | CI/CD | GitHub Actions 已有 |
| 文档工具 | VitePress | 推荐用于文档站点 |
| 性能测试 | 基准测试 | 已有基础设施 |

---

## 附录：快速修复清单

### 立即可做（< 1 小时）

1. 修复 FUNDING.yml 空值
2. 修复 package.json 字段排序
3. 添加 README.md console 警告的 eslint-disable

### 短期可做（< 1 天）

1. 创建 mark-text.ts 测试文件
2. 补充 override-default-rules.ts 测试
3. 创建 API 文档初稿

### 中期可做（< 1 周）

1. 升级 TypeScript
2. 升级 @types/node
3. 完善所有测试覆盖
4. 创建规则开发指南
