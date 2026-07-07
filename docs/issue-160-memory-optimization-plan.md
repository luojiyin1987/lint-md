# Issue #160：Core 内存优化实施计划

状态：Proposed

关联：

- Core issue：[lint-md/lint-md#160](https://github.com/lint-md/lint-md/issues/160)
- CLI 背景：[lint-md/cli#73](https://github.com/lint-md/cli/issues/73)
- CLI PR：[lint-md/cli#74](https://github.com/lint-md/cli/pull/74)

## 结论

本 issue 先作为性能归因和方案验证任务，不直接实现 AST streaming、增量解析或 AST 节点瘦身。

执行顺序：

1. 建立可重复的 core 分层内存基准。
2. 区分 parser 临时分配、存活 AST、规则扫描和 fix 重跑的贡献。
3. 根据数据选择最小优化点。
4. 独立验证收益和语义兼容性。
5. 只有现有架构内的优化不足时，才为 streaming / 增量解析编写 RFC。

当前不删除或内置 `@lint-md/parser`。如果数据证明 parser 是主要瓶颈，应在 parser 仓库中优化其实现，同时保持 core 的依赖和公开 API 不变。

## 目标

- 找到大文件和多 worker 场景下峰值 RSS 的主要来源。
- 降低单个 1 MiB Markdown 文件的 core 峰值内存。
- 降低多 worker 并行处理大文件时的总进程峰值 RSS。
- 保持 lint 结果、fix 结果、位置 offset 和公开 API 不变。
- 不以明显吞吐回退换取内存下降。

## 非目标

- 删除 `@lint-md/parser`。
- 在没有 profiling 数据前重写 Markdown parser。
- 当前阶段实现 AST streaming 或增量解析。
- 删除 `LintMdRuleContext.ast`。
- 限制第三方规则只能访问 `{ type, value, position }`。
- 改变规则 selector、诊断或 fix 的公开格式。
- 顺带修复 `handleFixMode` 最大循环次数等无关问题。

## 当前认识

### 已确认的代码路径

一次 `runLint()` 执行：

1. `parseMd(markdown)` 构造完整 mdast。
2. 初始化 rule manager、emitter 和规则 selector。
3. traverser 对 AST 做一次深度优先遍历。
4. 每个节点按 `node.type` 分发给对应规则。
5. 多条 text 规则分别扫描同一个 `node.value`。

AST 遍历不是“每条规则各遍历一次”。重复工作主要可能出现在 parser 内部和 text-node 规则扫描阶段。

### 明显的规则侧分配候选

- `markText()` 使用 `text.split('').map(...).join('')`，会为长 text node 创建大型临时数组和标记字符串。
- `TextScanner.forEachChar()` 每处理一个字符都会创建一个 `{ line, column, offset }` 对象。
- `TextScanner.findAllMatches()` 为所有匹配创建结果、loc 和 range 对象。
- `TextScanner.matchAt()` 从 text node 开头重新扫描到每个匹配位置；匹配很多时可能退化为高成本重复扫描。
- 每条 text 规则独立创建 `TextScanner`，并独立遍历或正则扫描相同字符串。

这些是候选原因，不应在 profiling 前认定为主因。

### 初步本地诊断

环境：

- Node.js 24.15.0
- 当前已构建的 CommonJS 产物
- 单个约 1,000,010 字节的长段落
- 单进程、单次冷启动

| 场景 | 峰值 RSS | wall time |
|---|---:|---:|
| 仅构造输入字符串 | 44 MiB | 0 ms |
| 仅 `parseMd` | 528 MiB | 811 ms |
| parse + traverse，无规则 | 526 MiB | 676 ms |
| 仅 `space-around-alphabet` | 552 MiB | 871 ms |
| 全部默认规则，lint-only | 598 MiB | 964 ms |

显式 GC 后，即使保留解析结果，live heap 约为 6 MiB，但 RSS 仍约 505 MiB。该结果提示：

- 最终 AST 的存活体积不一定是主要问题。
- parser 解析期间的临时对象和分配峰值更值得优先调查。
- V8 / allocator 未立即归还的内存页会使 RSS 明显高于 live heap。
- 规则扫描会继续增加分配，但在该语料上不是唯一来源。

这只是单次诊断，不能作为合并前后的正式性能结论。

## 阶段 1：建立基准协议

### 1.1 新增脚本

计划新增：

- `scripts/benchmark-memory.mjs`
- `scripts/benchmark-memory-smoke.mjs`

`benchmark-memory.mjs` 负责运行正式测量，输出 NDJSON；`benchmark-memory-smoke.mjs` 只使用小输入验证参数解析、场景执行和输出格式，不设置脆弱的绝对内存断言。

脚本要求：

- 使用确定性生成的内存输入或临时文件，不提交大型 fixture。
- 每个测量 case 在独立子进程运行，避免前一个 case 的 V8 heap 和 allocator 状态污染后续数据。
- 正式测量使用构建产物，不通过 `tsx` 或 `ts-jest` 启动。
- 记录 Node 版本、平台、CPU、输入形状、输入字节数、模式、规则集和运行次数。
- 支持 `-h` / `--help`。
- 每个 case 自动执行 1～2 次 warmup 运行（不计入统计），抵消 V8 JIT 首跑差异。
- 包含一个 `noop` 对照 case（只调用一次 `process.memoryUsage()`），输出基线噪声，用于区分真实信号与测量噪声。
- 无参数时使用适合本地运行的保守默认值。

建议命令：

```bash
npm run build
node scripts/benchmark-memory.mjs \
  --bytes 1048576 \
  --shape long-paragraph \
  --runs 5
```

### 1.2 测量场景

每种输入至少执行：

1. input-only：只构造输入。
2. parser-only：只调用 `parseMd()`。
3. parse-traverse：调用 `runLint()`，规则数组为空。
4. single-rule：每条默认 text 规则单独运行。
5. all-rules：运行全部默认规则。
6. lint-only：`isFixMode = false`。
7. fix-mode：`isFixMode = true`。

CLI 侧另外保留 1、2、4 worker 的端到端测量，但 core 的归因基准先使用单进程，避免 worker 调度干扰。

### 1.3 输入矩阵

至少覆盖：

- `long-paragraph`：一个超长 text node。
- `many-paragraphs`：大量短段落和大量 AST 节点。
- `mixed-markdown`：标题、列表、链接、图片、引用、代码块、表格。
- `high-match-density`：大量会触发 text 规则和 fix 的内容。
- `low-match-density`：与 CLI #73 基准接近的普通英文内容。
- `overlapping-fixes`：产生多轮 fix 的内容。

尺寸至少覆盖：

- 64 KiB
- 256 KiB
- 1 MiB

如果机器资源允许，再增加 4 MiB；不得把超大 case 放入默认 smoke test。

### 1.4 指标

每个 case 输出：

- wall time
- `process.resourceUsage().maxRSS`
- 执行前后的 `rss`
- 执行前后的 `heapUsed`
- 显式 GC 后的 `heapUsed`（使用 `--expose-gc` 基准子进程；此为必选指标，不是可选辅助）
- 报告数量
- fix 数量
- `runLint` 执行次数

worker_threads 中：

- `rss` 是整个进程的数据；
- `heapUsed` 等 heap 字段只代表当前 worker isolate。

CLI 多 worker 测量必须由 worker 把自己的 heap 指标回传，不能把主线程的 `heapUsed` 当成全进程 heap。

### 1.5 统计方式

- 每个正式 case 至少运行 5 次。
- 报告 median，并保留 min/max；条件允许时报告 p95。
- 冷启动和热运行分开记录。
- 比较前后必须使用相同 Node 版本、构建方式、输入和规则配置。
- RSS 波动较大时，不根据单次结果作优化决定。

## 阶段 2：完成内存归因

### 2.1 分层差值

根据阶段 1 的结果计算：

- parser 成本：`parser-only - input-only`
- traverser 成本：`parse-traverse - parser-only`
- 单规则增量：`single-rule - parse-traverse`
- 全规则组合增量：`all-rules - parse-traverse`
- fix 重跑增量：`fix-mode - lint-only`

RSS 不是严格可加指标，因此这些差值只用于发现方向，最终仍需 heap profile 验证。

### 2.2 Heap / CPU profile

只对阶段 1 中占比最高的 2～3 个 case 采集 profile：

- 使用 Node heap sampling 或 heap profile 查找主要分配类型和调用栈。
- 使用 CPU profile 验证时间是否集中在 parser、Unicode 正则、字符串复制或位置计算。
- 在 GC 前后分别观察 live heap，区分“仍被引用的对象”和“已经死亡但 RSS 未下降”。
- profile 文件仅作为本地或 CI artifact，不提交包含真实用户 Markdown 的快照。

### 2.3 决策门槛

完成 profiling 后，将结果贴回 #160，并按以下规则选择下一步：

- parser-only 占目标场景峰值增量的约 70% 或更多：优先进入 parser 路径。
- 规则侧增量达到约 20%，或单条规则出现明显异常：优先进入 text-rule 路径。
- live AST 在显式 GC 后仍占主要 heap：才评估 AST 表示或生命周期。
- 多 worker 总 RSS 主要来自并发工作集叠加：同时进入 CLI 内存预算路径。

百分比是优先级判断线，不是性能正确性断言。

## 阶段 3A：Text 规则低风险优化

只有 profiling 支持该方向时才实施。

建议按以下顺序，每项独立 benchmark：

1. 改写 `space-around-alphabet`，直接扫描原字符串，消除完整 `markedText`、`split/map/join` 和不必要的 boundary 中间结构。
2. 调整 `TextScanner.forEachChar()`，避免每个字符都创建位置对象；只在命中时构造 loc。
3. 让连续匹配的位置计算保持单调游标，避免 `matchAt()` 为每个匹配从节点开头重新扫描。
4. 只有前三项收益不足时，才设计“一次扫描驱动多规则”的内部 API。

不要先把所有 text 规则耦合到一个大型扫描器。规则必须继续可以独立启用、关闭和配置。

每个优化 PR 必须：

- 保留对应规则的现有单元测试。
- 增加长 text node 和高匹配密度回归测试。
- 提供优化前后相同 case 的 median 数据。
- 不改变诊断位置、消息、fix 内容或报告数量。

## 阶段 3B：Parser 路径

如果 parser 临时分配主导：

1. 在 `@lint-md/parser` 仓库直接复现并优化 parser-only 基准（维护者 @luojiyin1987 有该仓库的 admin 权限，可直接提交和发布，无需 fork 或上游协商）。
2. 区分 remark/micromark tokenize、event 构造、mdast 构造和插件 transform 的成本。
3. 使用不同输入形状确认问题是否只发生在超长单行。
4. 评估依赖升级或 parser 配置变化能否降低分配。
5. 对候选改动运行 parser 的 position、GFM、directive、math 和 roundtrip 测试。
6. 发布 parser 版本后，在 core 和 CLI 的原始语料上复测。

本阶段不把 parser 源码复制进 core，也不删除 `@lint-md/parser` 依赖。

如果主要问题来自 remark/micromark 的不可配置内部结构，应先向上游提交最小复现；只有上游方案不可行时，再讨论替代 parser 或增量架构。

## 阶段 3C：CLI 内存预算

即使 core 得到优化，多 worker 同时解析大文件仍会叠加工作集。CLI 可以独立提供短期保护：

1. 在调度前通过 `stat` 获取文件大小，不在主线程读取内容。
2. 除 worker 数量外，再设置“同时处理中总字节数”预算。
3. 大文件自动降低有效并发，小文件仍保持现有吞吐。
4. 保留用户显式配置 thread count 的能力，并记录实际并发。
5. 对 1、2、4 worker 和混合文件大小进行端到端验证。

该改动属于 `lint-md/cli`，不放入 core PR。

`worker_threads.resourceLimits` 可以作为故障隔离实验，但它只限制 V8 的部分资源，不等价于进程 RSS 预算，不能替代字节级调度。

## 阶段 4：AST streaming / 增量解析 RFC

只有阶段 3A～3C 无法达到目标时才进入本阶段。先写 RFC，不直接提交实现。

RFC 必须回答：

- `LintMdRuleContext.ast` 是否保留，以及第三方规则如何迁移。
- heading、link 等需要完整子树的规则何时触发。
- reference link、definition、frontmatter、GFM table 等跨节点语义如何处理。
- node position 的 line、column、offset 如何保持与原文一致。
- fix 如何引用已经释放的节点或文本片段。
- 多轮 fix 如何重新解析受影响范围。
- streaming 模式与当前完整 AST 模式是否并存。
- CommonJS / ESM 和 parser 包 API 如何演进。
- 如何证明新 parser 与现有 fixture 的行为等价。
- 在 streaming 模式下，position.line/column 在跨行 context 状态传递、增量重新解析等边界 case 下是否仍然精确。

在这些问题解决前，不接受以“释放 children”或“只保留最小字段”为核心的生产改动，因为它会破坏公开规则契约。

## 性能合并标准

候选优化只有同时满足以下条件才进入主线：

- 在与 CLI #73 完全相同的 baseline 语料（16 文件 * 1 MiB 中文长段落，threads=4）上，median 峰值 RSS 至少下降 10%。
- wall time 回退不超过 5%；如果超过，必须有明确的产品级权衡决定。
- 小文件和常见 Markdown 语料没有明显性能退化。
- lint 结果、diagnostics、fix 结果和 position 测试完全一致。
- `npm run lint`、`npm run typecheck`、`npm test` 和 `npm run build` 全部通过。
- 数据至少包含优化前后 5 次运行及完整环境信息。

如果优化只改善合成的 1 MiB 单行语料而损害常见文档，应保留为实验，不合并到默认路径。

## PR 拆分

### PR 1：基准与 profiling 基础设施

- 新增 benchmark 脚本和 smoke test。
- 记录基线数据。
- 不修改 lint 行为。

### PR 2：第一个有数据支持的低风险优化

优先选择单条 text 规则或 TextScanner 的局部临时分配问题。只做一个可独立验证的优化。

### PR 3：Parser 优化

仅在 parser-only 数据证明必要时，在 `@lint-md/parser` 仓库实施。

### PR 4：Core 升级 parser 依赖并复测

在 core 仓库升级 `@lint-md/parser` 版本，运行阶段 1 的相同基准脚本，对比优化前后 RSS 和 wall time。不修改 core 的 lint 逻辑。

### PR 5：CLI 内存预算

在 `lint-md/cli` 仓库按输入字节限制并发。

### RFC：Streaming / 增量解析

不与上述 PR 混合，不受“快速 PoC”名义驱动进入生产。

## 完成标准

Issue #160 可以关闭的条件：

1. 已有可重复运行的 core 内存基准。
2. 已记录 parser、traverser、规则和 fix 模式的内存归因。
3. 至少一个有数据支持的优化已合并，或者数据证明当前无需修改 core。
4. CLI 已使用相同语料完成端到端复测。
5. 如果仍需 streaming，已经创建独立 RFC issue；#160 不继续承载无限期架构讨论。

## 执行清单

- [ ] 确认 benchmark 参数、输出 schema 和测试语料生成方式。
- [ ] 实现 `scripts/benchmark-memory.mjs`。
- [ ] 实现 `scripts/benchmark-memory-smoke.mjs`。
- [ ] 在 `package.json` 增加 benchmark 和 smoke-test 命令。
- [ ] 建立 input/parser/traverse/per-rule/all-rules 分层基线。
- [ ] 建立 lint-only/fix-mode 基线。
- [ ] 建立不同输入形状和尺寸的基线。
- [ ] 采集主要 case 的 heap 和 CPU profile。
- [ ] 将环境、原始数据和结论贴回 #160。
- [ ] 根据决策门槛选择 text-rule、parser 或 CLI 路径。
- [ ] 为第一个候选优化补齐语义回归测试。
- [ ] 运行优化前后至少 5 次对比。
- [ ] 合并满足性能和正确性门槛的最小 PR。
- [ ] 更新 CLI 端到端基线。
- [ ] 决定关闭 #160 或创建独立 streaming RFC。
