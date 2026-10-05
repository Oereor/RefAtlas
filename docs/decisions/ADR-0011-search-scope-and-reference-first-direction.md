# ADR-0011：搜索范围与引用优先方向

- 状态：已接受；产品搜索范围部分替代 ADR-0009，保留 ADR-0004 的确定性匹配原则。
- 日期：2026-10-05（UTC+8）。
- 适用阶段：V1 产品范围、Phase 2 discovery/find 与 Phase 3 契约引用方向；不授权生产实现。

## 背景

Phase 2 Search 已完成 full-occurrence、candidate-source / relational S1、compact typed hash、Exact/Contains、Pointer recovery、result spool、cache lifecycle、取消、execution isolation 和 Windows/Electron sandbox 调查。证据表明 workspace-wide raw content search 在工程上可行，但需要全库扫描、initial indexing、持久缓存、增量生命周期、coverage/generation、独立执行隔离及平台验证。

本次用户产品 review 决定：RefAtlas V1 的核心价值转向 raw data browsing、Dataset Contract、deterministic reference resolution、incoming references 与 reference navigation / local graph。这是产品架构取舍，不是 Search architecture 的技术失败。

## 决定

### V1 discovery 与 find 范围

| 层级 | 当前产品方向 | 边界 |
| --- | --- | --- |
| Workspace | Source Locator / source-path search | 仅 file name / relative path；例如 `AvatarSkill` 定位 `AvatarSkillConfig.json`、`AvatarSkillTreeConfig.json` |
| Active source | Find in Source | 仅 current active source 的 bounded literal Contains/find；例如 `1407` 可匹配 `1407`、`140701`、`131407` |
| Cross-source semantic navigation | Dataset Contract / Reference Resolver | 显式契约规定 target scope、target structure 与 matching rule，确定性定位目标 NodeAddress / Logical Entity |

V1 不提供 workspace-wide raw scalar value、field name、arbitrary text 或 ID/hash occurrence search；全工作区 raw Exact / Contains / Field / Text search 为 **DEFER**。无法在整个 workspace 查出 `1407`、`140701`、`MonsterSkill`、`AvatarID` 的所有 occurrence 是明确接受的产品缺口，不是 bug。

Source Locator 不要求解析全部 JSON、scalar/field occurrence index、S1、FTS/trigram、persistent content index 或 dedicated Search Utility。当前 Source Explorer 是单目录 discovery，不等于已存在完整 workspace source catalog；Source Locator 尚未实现。

Find in Source 未来基于现有 raw/parser foundation，要求 bounded work、progressive matches、cancellation、source-revision safety、previous/next navigation 和 bounded Renderer payload，不要求 persistent index。具体匹配选项、API、预算和 UI 留待独立授权设计；本决定不将 Contains 示例扩展为完整 generic search。

完整性继续约束查询明确声明的范围，不能以取消、失败、资源限制或未覆盖范围冒充完整无结果；不再要求 V1 完整 workspace content coverage。原始类型、numeric lexeme、出处及 revision 边界继续有效。

### Search 候选与执行隔离

| 工作 | 新状态 | 含义 |
| --- | --- | --- |
| Workspace-wide raw content search | DEFER | 不作为进入 Phase 3 的 blocker |
| Relational S1 / persistent content cache | DEFER | candidate-source architecture 有充分可行性证据，但 V1 没有需要 workspace-wide raw-content Exact acceleration 的产品功能；不是永久 rejected |
| Compact typed hash + Contains dictionary | DROP from current V1 candidate set | 不做 direct-from-raw validation 或 compact follow-up；历史 evidence 保留 |
| FTS / trigram | DEFER | 不为当前 Source Locator / Find 提前实现 |
| Dedicated Search Utility | DEFER | 不为已 defer 的重型 workload 提前建立进程 |

停止 S1 production schema、initial full build、partial coverage、background / query-assisted indexing、S1 generation model 与 persistent content cache lifecycle 工作。历史约 3 GiB 的 S1 空间量级在原方案中可接受；compact 的 collision、dictionary、GC 与 incremental lifecycle 复杂度所换取的空间收益不足，且 workspace-wide content indexing 本身已 defer。

若未来重新启用重型 workspace-wide Search/indexing，Raw Utility + Dedicated Search Utility 是已有证据支持的 isolation 方向；保留 execution-lane evidence，不将私有原型验证等同于已接受生产拓扑或跨平台验收。

### Search 与 Reference 正式分层

**Search discovers raw content; Dataset Contracts establish reference meaning.**

**Reference resolution must not be implemented as unconstrained workspace-wide content search.**

未来流程为：selected raw Node → Dataset Contract → deterministic reference semantics → target scope / target structure / matching rule → Reference Resolver → target NodeAddress / Logical Entity。

例如 `Avatar.Skill[] value = 140701` 可由未来契约定义为 Avatar Skill reference，目标 source 为 `AvatarSkillConfig.json`、目标 field/key 为 `SkillID`、matching 为 typed exact equality。Resolver 执行 contract-scoped deterministic lookup，不执行 Global Search `140701`。这只是职责示例，不接受具体契约 schema 或数值相等规则。如果 `CharacterName.Hash` 的契约能推导 TextMap key / Pointer，直接访问目标 Node。

Incoming References / Referenced by 必须来自 Dataset Contract-defined reference semantics。`SomeRandomNumber: 140701` 不能仅因值等于 SkillID 而生成 reference edge；继续遵守 Core does not infer relationships。ADR-0004 的 raw Exact/Contains semantics 不自动定义契约匹配或引用意义。

## 后果与后续阶段

Phase 2 保留 raw access、Source Explorer、Node Browser/Inspector、source lifecycle / stale / reload，以及另行授权的 minimal Source Locator、active-source Find 与近期 FEFF correctness work。Phase 3 转向 Dataset Contract、Forward Reference Resolution、Inspector reference preview、Incoming References、reference navigation 和 local graph。Tabs / History / Compare / Diff 属于后续 UX work，不自动成为 Phase 3 前置条件。

生产 segmented TextDecoder 丢失 U+FEFF 仍是 **OPEN：Raw Access correctness defect**，与未来 TextMap / reference preview fidelity 直接相关；Search defer 不关闭该缺陷。本次不修复，真实证据保留在既有调查。

本次仅 architecture/documentation closeout，不实现 Search Foundation、Source Locator、Find、Dataset Contract、Resolver、incoming index、graph 或 FEFF fix。完成后 STOP / WAIT FOR REVIEW，预期下一架构焦点是另行授权的 Phase 3A — Dataset Contract architecture / investigation。

## 替代、推迟与复审条件

ADR-0009 的 V1 workspace raw-content 产品范围由本 ADR **部分替代**，旧正文保留；raw truth、可重建缓存与声明范围内的完整性/可观察性原则继续有效，不再构成实施 S1 或全库内容索引的要求。ADR-0004 不废弃，其确定性匹配方向仍约束 active-source Find 和未来 generic search。

未来真实使用需求证明 Global Content Search 必要时，可重新评审产品范围并复用当前调查测量；不因旧 OPEN / UNKNOWN / AWAITING REVIEW 字样机械重复调查。技术未知项仍按原证据保留，本次没有将它们标为已解决。

## 依据

- 用户本次 Search architecture pivot closeout 决定；交付与验证见 [架构收尾报告](../investigations/phase-2-search-scope-architecture-closeout.md)。
- [ADR-0009](ADR-0009-search-completeness-and-optional-acceleration.md)、[ADR-0004](ADR-0004-deterministic-search-semantics.md)：保留被部分替代的范围及确定性原则。
- [全库 Search 调查](../investigations/phase-2-search-architecture-full-dataset-investigation.md)：full-occurrence / literal / FTS、FEFF 与覆盖局限。
- [Candidate-source / S1 调查](../investigations/phase-2-search-candidate-source-index-investigation.md)：完整 S1、membership、Exact/Contains、compact、spool 与生命周期证据。
- [Execution-lane 验证](../investigations/phase-2-search-execution-lane-validation.md)：隔离、取消、Browser-under-Search、Windows/Electron sandbox 证据及局限。
