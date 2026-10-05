# ADR-0009：搜索完整性与可选加速

- 状态：已接受，产品搜索范围由 ADR-0011 部分替代。
- 日期：2026-10-03（UTC+8）。
- 适用阶段：Phase 2 搜索与索引设计；不表示产品搜索已实现。

范围补记（2026-10-05，UTC+8）：[ADR-0011](ADR-0011-search-scope-and-reference-first-direction.md) 部分替代本 ADR 的 V1 workspace-wide raw-content 搜索范围：V1 仅要求 source filename / relative-path locator 与 active-source Find，跨 source 语义导航由 Dataset Contract / Reference Resolver 承担。全库内容搜索、S1 content cache、FTS/trigram 与 dedicated Search Utility 已 defer，compact hash 退出当前 V1 candidate set；下文不再构成其生产实现要求。声明范围内的完整性、raw truth、可重建缓存与可观察性原则继续有效。原决定正文保留。

## 背景

Phase 2A 受限样本中，unicode61 candidate 会遗漏中文短词及字面子串，trigram 对短查询仍需回退且增加磁盘成本。最终字面验证不能补回 candidate 生成时已遗漏的结果。用户接受完整检索是调查工具的正确性要求，延迟则是优化问题。

## 搜索与存储决定

**Search completeness is a correctness requirement; search latency is an optimization concern.** 完整可搜索范围包括 raw scalar values、field names、files / relative paths。没有 accelerator 的来源或值不能永久搜不到；查询声明的 scope 中未覆盖的数据不能默认为无命中。

沿用 [ADR-0004](ADR-0004-deterministic-search-semantics.md) 的 Exact、Contains、Field、File、Text 确定性方向。Text 指原始来源中的文本，可能包含数据集自身的多语言内容，与 APP UI translation 无关；Core 不按 UI locale 改写源文本。FTS 不定义这些操作的语义，搜索命中也不赋予实体或引用语义。

SQLite 是基础可重建 cache/index，raw JSON 是 source of truth。可保存 files、NodeAddress / provenance、field occurrences、scalar kind、exact lexeme / text、source revision 和必要结构 metadata。这是允许的索引信息类别，不是已经接受的表设计、全 Node 持久化或 schema。

不得将 ID-like value、大整数 hash 或 raw number 强制保存为 SQLite INTEGER 并因此丢失原始事实。索引须保留类型、numeric lexeme 与出处，遵守 [ADR-0002](ADR-0002-lossless-raw-data-and-bounded-access.md) 和 [ADR-0008](ADR-0008-parser-capability-contract-and-source-ranges.md)。来源更新后的失效与重建遵循 [ADR-0007](ADR-0007-node-addressing-and-source-lifecycle.md)。

## 可选加速与完整回退

**Search coverage ≠ acceleration coverage。** Trigram 只是 Contains/Text 的候选 accelerator；不接受所有 scalar 默认全部 trigram。是否启用、覆盖哪些文件和语言，须在真实完整数据集容量与性能测量之后决定。

未加速、无法进入 accelerator 或尚未被索引的来源，仍须通过 bounded SQLite scan / `instr` / source streaming fallback 等完整路径检索。候选与回退的合并必须避免漏匹配；最终验证只能去除假阳性，不能修复 candidate omission。不得用截断 preview 代替可搜索的完整内容。

1–2 字符查询保持完整性，但不因此自研复杂单字/双字倒排索引；只有未来真实测量证明必要时再评审。具体 query planner、范围批次、分页、字符匹配选项和索引覆盖策略留待实现。

## 慢搜索的可观察性

后续 Query / UI 必须能表达 searching、progress、coverage、partial results、cancellation。尚未完成 coverage 的搜索不能标成 full workspace search completed；用户取消、失败和资源限制也不能伪装为完整“无结果”。

回退须有界、能让出执行并响应取消。同步数据库调用不能仅靠同线程 timeout 就宣称可中断；具体分批和取消机制在生产实现验证。本决定不固定状态枚举、Query API、进度百分比、错误 code 全集或 UI 文案。

## 后果与推迟事项

完整性可能需要较慢扫描，UI 应提供状态与部分结果。索引的重建、存储成本和 fallback 成本都需要全量测量；已有采样容量外推不是预算或 SLA。RawScalar Exact 的具体相等规则、BINARY/case/normalization、完整 schema、trigram 默认范围均未接受。

本 ADR 补充 ADR-0004，不替代其确定性检索方向。它接受完整覆盖、基础可重建索引和可选加速边界，不授权实现 full search、trigram 或搜索 UI。

## 依据

- 用户已确认的完整性、缓存、回退与慢搜索决定，见 [评审收尾](../investigations/phase-2a-review-closeout.md)。
- [Phase 2A 历史调查](../investigations/phase-2a-data-access-architecture.md)：完整字面集合对照及受限索引容量；不将采样外推视为全量证据。
