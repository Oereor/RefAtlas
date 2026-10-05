# Phase 2 Search：搜索范围与引用优先架构收尾

日期：2026-10-05（UTC+8）。应用基线：`ea687d10e51a030053d732449d3d600c2e792a83`（Closeout Phase 2 Search investigations），开始工作树干净。外部只读数据基线：`724b139d8c9c32d12552eb95745a4fee72bfe48b`，开始工作树干净。

**Search investigation line：COMPLETED / CLOSED / RETAINED AS HISTORICAL EVIDENCE。Production workspace-content search：DEFERRED BY PRODUCT DECISION。本次交付：ARCHITECTURE / DOCUMENTATION CLOSEOUT；STOP / WAIT FOR REVIEW。**

## 1. 本次产品转向

用户已明确决定 RefAtlas V1 不以 workspace-wide raw content search 为目标，核心方向为 raw data browsing + Dataset Contract + deterministic reference resolution + incoming references + reference navigation / local graph。这是产品架构取舍，不是 Search architecture 技术失败；调查已经证明其工程可行性，同时揭示全库扫描、initial indexing、持久缓存、增量生命周期、coverage/generation、执行隔离及平台验证的成本。

全工作区查找 `1407`、`140701`、`MonsterSkill`、`AvatarID` 的所有 occurrence 不属于 V1 要求。这是明确接受的产品缺口，不是 bug。未来真实使用需求可以重新开启 Global Content Search 设计，复用既有 evidence，不机械重复调查。

## 2. Deferred / dropped 工作与有限 UX 职责

| 工作 | 当前状态与处理 |
| --- | --- |
| Workspace-wide raw scalar / field / arbitrary text / ID/hash occurrence，Exact / Contains / Field / Text search | DEFER；不进入 Search Foundation，不作为 Phase 3 blocker |
| Relational S1 / persistent content cache | DEFER；充分可行性证据保留，不是永久 rejected；V1 无需 workspace-wide raw-content Exact acceleration |
| S1 schema / initial full build / partial coverage / background indexing / query-assisted indexing / generation / persistent lifecycle | 停止当前生产规划，不实现 |
| Compact typed hash + Contains dictionary | DROP from current V1 candidate set；无 direct-from-raw validation、compact follow-up 或新 benchmark |
| FTS / trigram | DEFER；不为当前有限 discovery/find 建立内容索引 |
| Dedicated Search Utility | DEFER；不为已 defer 的 workload 提前建进程；execution-lane evidence 保留 |
| Source Locator | 尚未实现；workspace-level file name / relative path 定位，单独授权 |
| Find in Source | 尚未实现；current active source 内 bounded literal Contains/find，单独授权 |

历史约 3 GiB 的 S1 空间量级可接受；compact 节省空间的收益不足以匹配 collision、dictionary、GC 和 incremental lifecycle 复杂度，更重要的是 workspace-wide indexing 本身已 defer。具体测量保留在 [S1/compact 调查](phase-2-search-candidate-source-index-investigation.md) 和 [PERFORMANCE](../PERFORMANCE.md)，本次没有新增测量或修改数字。

Source Locator 可用 `AvatarSkill` 定位 `AvatarSkillConfig.json` / `AvatarSkillTreeConfig.json`，不要求解析全部 JSON、scalar/field occurrence index、S1、FTS/trigram、persistent content index 或 dedicated utility。已有 Source Explorer 是单目录 discovery，不代表完整 workspace source catalog 已存在。

Find in Source 未来复用 raw/parser foundation，例如 `1407` 可命中当前 source 的 `1407`、`140701`、`131407`。要求 bounded work、progressive matches、cancellation、source-revision safety、previous/next navigation 和 bounded Renderer payload，不要求 persistent index；具体接口、匹配选项和预算需另行设计。

## 3. ADR 维护与职责分层

- 新增已接受 [ADR-0011](../decisions/ADR-0011-search-scope-and-reference-first-direction.md)，表达本次当前产品范围、defer/drop 与契约引用方向；不授权实现。
- [ADR-0009](../decisions/ADR-0009-search-completeness-and-optional-acceleration.md) 标为“已接受，产品搜索范围由 ADR-0011 部分替代”，仅更新状态与新增日期补记。原正文保留；raw truth、可重建缓存和声明范围内的完整性/可观察性继续有效，不要求 V1 全工作区内容搜索或实施 S1。
- [ADR-0004](../decisions/ADR-0004-deterministic-search-semantics.md) 保持已接受，仅新增日期补记。deterministic Exact/Contains 原则仍约束 active-source Find 与未来 generic search；不要求 Find 提供全部搜索操作，不自动定义契约引用语义。

**Search discovers raw content; Dataset Contracts establish reference meaning.**

**Reference resolution must not be implemented as unconstrained workspace-wide content search.**

未来 selected raw Node → Dataset Contract → deterministic reference semantics → target scope / target structure / matching rule → Reference Resolver → target NodeAddress / Logical Entity。`Avatar.Skill[] = 140701` 可由契约规定目标 `AvatarSkillConfig.json` / `SkillID` 和 typed exact equality；不能用 Global Search `140701` 代替确定性 lookup。`CharacterName.Hash` 可由契约推导 TextMap key / Pointer 时直接访问。示例不锁定具体契约 schema 或相等规则。

Incoming References 必须来自 explicit contract-defined reference semantics；`SomeRandomNumber: 140701` 不能因 raw equality 生成 Skill reference edge。继续遵守 Core does not infer relationships。

## 4. 历史证据、FEFF 与下一步

[全库调查](phase-2-search-architecture-full-dataset-investigation.md)、[candidate-source/S1 调查](phase-2-search-candidate-source-index-investigation.md)、[execution-lane 验证](phase-2-search-execution-lane-validation.md) 及全部 evidence、tools 原样保留，未增加补记或重写结论。全库规模、membership、冻结查询、空间、生命周期/spool、取消、Browser-under-Search、执行身份与 Windows/Electron sandbox 测量继续有效。未来重启重型 Search/indexing，可复用 Raw Utility + Dedicated Search Utility isolation evidence；当前不将私有原型升级为生产拓扑。

历史 native `0xC0000409` 根因、重复键 partial coverage 与平台/打包局限没有被宣称解决。Search 调查线路的产品收尾，不等于技术未知项全部关闭；历史 OPEN / UNKNOWN / AWAITING REVIEW 不再自动触发继续调查。

**FEFF：OPEN / Raw Access correctness defect。** Production segmented TextDecoder 丢 U+FEFF，真实 `TextMap/TextMapJP.json` 的 `/7505878640962067595` 首字符丢失。证据见 [全库保真调查](phase-2-search-architecture-full-dataset-investigation.md) 和 [Round 2 prerequisites](phase-2-search-candidate-source-index-investigation.md#25-feff--duplicate-key-prerequisites)。调查 decoder 已修正不证明 production adapter 已无损；本次未修复。该问题与未来 TextMap/reference preview 的 raw fidelity 直接相关，保留为近期独立 correctness task，不随 Search defer 关闭。

ROADMAP 的 Phase 2 保留 Raw Access、Explorer、Node Browser/Inspector、source lifecycle / stale / reload，以及单独授权的 minimal Source Locator、active-source Find 和 FEFF work。Phase 3 方向为 Dataset Contract → Forward Reference Resolution → Inspector reference preview → Incoming References → reference navigation / local graph。Tabs / History / Compare / Diff 移入后续 UX work，不与全局内容搜索一起成为 Phase 3 前置条件。

STATUS 明确关闭 Search investigation line，记录 no Search Foundation authorized、no S1 implementation planned、no compact follow-up。下一架构焦点为 **Phase 3A — Dataset Contract architecture / investigation**，本次交付后 STOP / WAIT FOR REVIEW；不自动执行该调查、FEFF fix、Source Locator 或 Find。

## 5. 实际文档范围

合计 **13 份 Markdown：11 修改 + 2 新增**，无删除。AGENTS 的最小同步由用户在计划确认中明确授权。

| 文件 | 本次修改 |
| --- | --- |
| [AGENTS](../../AGENTS.md) | 替换冲突的全工作区搜索要求，链接 ADR-0011，约束契约引用职责 |
| [PROJECT](../PROJECT.md) | 引用优先定位、三层 discovery/find 模型、接受的 V1 缺口与独立 FEFF work |
| [ARCHITECTURE](../ARCHITECTURE.md) | 当前范围、Search/Reference 分层、defer/drop 与 raw fidelity 边界 |
| [ROADMAP](../ROADMAP.md) | Phase 2 有限 UX、Phase 3 契约引用顺序与后续 UX，移除全局搜索 blocker |
| [STATUS](../STATUS.md) | Search 线路关闭、历史 evidence、独立 FEFF 与等待评审/下一焦点 |
| [DEVELOPMENT-PROCESS](../DEVELOPMENT-PROCESS.md) | 当前 scope 与阶段授权规则，禁止旧调查状态自动推进工作 |
| [文档入口](../README.md) | 当前 ADR/closeout 与下一架构焦点入口 |
| [决策入口](../decisions/README.md) | ADR-0011 与 ADR-0009 部分替代、ADR-0004 保留状态 |
| [调查入口](README.md) | Search 历史状态与当前产品收尾入口 |
| [ADR-0009](../decisions/ADR-0009-search-completeness-and-optional-acceleration.md) | 状态与日期补记，正文保留 |
| [ADR-0004](../decisions/ADR-0004-deterministic-search-semantics.md) | 日期补记，状态与正文保留 |
| [ADR-0011](../decisions/ADR-0011-search-scope-and-reference-first-direction.md) | 新增已接受产品范围与职责决定 |
| [本报告](phase-2-search-scope-architecture-closeout.md) | 新增收尾、文件与实际验证记录 |

## 6. 验证与交付边界

本轮实际验证如下，仅证明文档、历史保留与修改范围，不作为 runtime 行为或产品性能验收。

| 检查 | 结果与口径 |
| --- | --- |
| `npm.cmd run docs:check` | PASS；43 份 Markdown 的本地链接与锚点有效，包含两个新文档 |
| `npm.cmd run format:check` | PASS；全部受管文件符合仓库 formatter，Markdown 按现有 policy 被排除，没有运行全仓 formatter |
| `git diff --check` | PASS；已修改受管文档无 whitespace 问题 |
| 新增与修改文档格式 | 临时 Node 检查全部 13 份 Markdown 为 LF、无尾随空白；人工检查表格、标题和链接，不批量重排历史文件 |
| ADR 历史正文 | 临时 Node 去除新增日期补记，并恢复 ADR-0009 原状态行后，ADR-0004/0009 与 `git show HEAD:<path>` 字节一致 |
| 精确修改范围 | 临时 Node 核对 `git status --porcelain --untracked-files=all` 精确匹配第 5 节 13 份 Markdown（11 修改、2 新增）；无其他 tracked/untracked 变更，index 未动 |
| 历史 evidence / production 边界 | Git diff/status 核对三份 Search 调查、全部 evidence/tools、PERFORMANCE、production src/tests/scripts/package/lockfile/config 无改动；没有新实验或测量 |
| 当前入口与 diff 审查 | 明确 Search 线路关闭，defer 与 drop 区分、ADR 部分替代与声明 scope 一致；Source Locator/Find 未实现，FEFF 保持独立 OPEN；旧技术未知项与其他浏览 slice 待评审状态保留 |
| 应用 HEAD / index | HEAD 仍为 `ea687d10e51a030053d732449d3d600c2e792a83`，staging index 空；无 branch/commit/remote 操作 |
| 外部只读仓库 | 起止 HEAD 均为 `724b139d8c9c32d12552eb95745a4fee72bfe48b`，起止 `git status --short` 为空；仅只读 Git 核对，使用单次 `-c safe.directory=<外部绝对路径>` 处理执行身份所有权检查，未改全局 Git 配置 |

没有运行 production build、package、Electron smoke、普通 production tests 或全数据集 Search benchmark；没有重新扫描外部数据、重新 fingerprint 全库或补做 compact/S1/platform 实验。

**没有 production implementation。** 没有修改 src/tests/scripts、public API/types、IPC、Renderer features、package/lockfile/dependencies、配置、实验工具、历史 investigation/evidence 或 PERFORMANCE；没有修复 FEFF，没有实现 Search Foundation、Source Locator、Find、Dataset Contract、Reference Resolver、Incoming Reference index 或 Graph。

应用 HEAD/分支与 staging index 保持原状，不 commit/push、不建分支/PR/issue、不操作远程；外部 TurnBasedGameData 保持只读。所有修改留在当前工作树供用户审查，完成后停止等待评审。
