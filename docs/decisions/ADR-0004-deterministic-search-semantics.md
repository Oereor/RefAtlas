# ADR-0004：确定性搜索语义

- 状态：已接受，最终加速实现未决。
- 日期：2026-10-02（UTC+8）。
- 适用阶段：搜索产品语义与后续索引评估。

评审补记（2026-10-03，UTC+8）：[ADR-0009](ADR-0009-search-completeness-and-optional-acceleration.md) 补充完整 raw scalar/field/file-path 覆盖、可重建缓存、可观察回退和 optional accelerator 边界。下文确定性搜索方向继续有效，具体相等/匹配选项及最终加速实现仍未锁定。Text 中的“本地化文本”指原始数据集文本，与 APP UI translation 无关；UI 边界见 [ADR-0010](ADR-0010-ui-localization-boundary.md)。原正文保留。

范围补记（2026-10-05，UTC+8）：[ADR-0011](ADR-0011-search-scope-and-reference-first-direction.md) 已 defer 当前 V1 workspace content search。下文 deterministic Exact/Contains 匹配原则仍约束 active-source Find 及未来若重新引入 generic search 时的行为，不要求 Find 实现全部搜索操作；Dataset Contract reference resolution 不由 raw search semantics 自动定义。原正文与既有评审补记保留。

## 背景

同一中文 TextMap 样本中 unicode61 MATCH 与字面子串查询返回不同结果。数据库 tokenizer 的行为不能取代开发者期待的原始数据检索语义。

## 决定

- 搜索行为独立于加速技术定义，先接受确定性开发者操作方向。
- Exact：精确原始标量或显式数据集 ID；Contains：字面 Unicode 子串；Field：字段名检索；File：文件/路径检索；Text：字面本地化文本检索。
- 上述名称是架构方向，不固定最终 UI 标签、Query API 或具体匹配选项。
- FTS、trigram 或 tokenizer 只能加速已定义行为，不可将 unicode61 MATCH 等同于完整子串语义。
- 不引入中文语义分词、embeddings、AI 模糊搜索或语义推断。

## 后果

未来索引和回退路径必须验证行为一致性，特别是 1–2 个 Unicode 字符的查询。搜索命中只是原始数据观察，不创建 Core 关系；真实引用仍来自显式 Dataset Contract。

## 推迟的方案与细节

尚未接受最终 FTS 策略。Phase 1 可评估 SQLite FTS5 trigram、确定性子串回退、短查询处理及索引体积。搜索选项、RawScalar 相等规则和 API 本次不设计；不以加速方案隐式决定产品语义。

## 证据

- [搜索风险与未决问题](../investigations/phase-0-feasibility.md#10-sqlite-驱动评估)。
- [中文子串与 FTS 基线](../PERFORMANCE.md#3-sqlite-代表性索引)。
- [产品原则](../PROJECT.md)。
