# PROJECT STATUS: ARCHIVED / DEVELOPMENT DISCONTINUED

归档日期：**2026-10-06（UTC+8）**。Standalone RefAtlas development is discontinued。项目保留为历史实验、架构与研究 archive，**不再推进 standalone roadmap，不存在下一阶段**。收尾记录见 [standalone archival closeout](investigations/standalone-archival-closeout.md)。

研究已建立对 TurnBasedGameData 结构、raw-data fidelity、大整数 ID/hash、搜索取舍和引用语义的重要认识。产品范围重新审视后，主要真实痛点收窄为阅读 raw JSON 时理解 Hash 对应的本地化文本；VS Code 原生浏览能力加薄层 deterministic reference navigation 已足以解决这一需求，完整 standalone workbench 的基础设施成本不再合理。这是产品方向决定，不是技术、架构或性能失败。

实际使用方向已转向独立的 [RefAtlas-VSCode](https://github.com/Oereor/RefAtlas-VSCode)。依据其当前 README，它仅将名称精确为 `Hash` 的 numeric JSON property 解析到 `TextMap/TextMapCHS.json`，找到目标时提供原生 Hover / Definition / Peek。它有独立、更窄的目标，不是 Phase 3 的另一种实现，不继承本仓库 specification、架构或 roadmap。

## 归档后的权威状态

- Phase 0–3A 历史工作、代码、ADR、调查及 evidence 保持原样；Phase 0/1/1A、Phase 2A、Raw Access、Source Browser、Search 和 ADR-0011 的研究与验收事实继续保留。
- Phase 3A investigation 已完成，其 identity/reference taxonomy 仍是有价值的研究结果；不会继续 Dataset Contract schema/API，standalone Phase 3 development 已由产品方向决定取消。
- Phase 2 未完成事项不再构成 active backlog。FEFF 仍未修复，Mac F/G 仍 NOT YET RUN，原 Windows runner 与 Mac minimize 等限制保持历史口径，不在本仓库继续推进。
- Search 的历史 DEFERRED / DROP 状态保持原记录；归档后的后续工作统一为 CANCELLED / NOT PLANNED，不表示等待恢复。
- **Historical OPEN / UNKNOWN / AWAITING REVIEW / NOT YET RUN markers in older reports do not imply planned future work.** 下文的“当前方向”“下一架构焦点”“需独立授权”等均属于归档前历史状态，以本节为当前真相。

## 已取消的 standalone 后续工作 — CANCELLED / NOT PLANNED

- Dataset Contract schema/API/DSL、Reference Resolver、Inspector reference preview、Incoming References、reference navigation、Local Graph。
- FEFF production fix、Source Browser Slice F/G macOS validation，以及剩余 Phase 2 平台验证与收尾。
- Global Content Search、S1、FTS/trigram、persistent search cache / content cache、dedicated Search Utility。
- Tabs、History、固定/Compare、Diff。
- Agent integration、正式 desktop release、release workflow、signing / notarization。

这些工作并未因此被判定技术上不可行；它们不再由 archived standalone product 的需求所支持。归档文档收尾后 **STOP / WAIT FOR REVIEW**，不进行代码清理、bug 修复、依赖升级或 GitHub repository settings 操作。

## 归档前状态快照（历史）

更新日期：2026-10-06（UTC+8）。

**Phase 3A：INVESTIGATION COMPLETED / AWAITING REVIEW / STOP。** 用户已独立授权并完成 Dataset Contract identity/reference taxonomy 调查。五案覆盖 TextMap object-key/localization、AvatarSkill 多等级物理记录、Stage nested occurrences、RelicSet parent-context composite lookup 与 JsonPath source/root；匹配事实与候选语义明确分开。报告见 [Phase 3A](investigations/phase-3a-dataset-contract-reference-taxonomy.md)，[紧凑证据](investigations/evidence/phase-3a-dataset-contract-reference-taxonomy.json) 保存 typed lexeme、Pointer、目标集合与只读审计。仅新增调查交付及必要状态/入口，没有 Contract schema、Resolver、Incoming References、UI/index 或 FEFF 修复。下一步是评审候选关系与最小能力，再另行授权 Contract schema/API 设计或实现；本轮 STOP / WAIT FOR REVIEW。

**Phase 2 Search investigation line：COMPLETED / CLOSED；RETAINED AS HISTORICAL EVIDENCE。Production workspace-content search：DEFERRED BY PRODUCT DECISION。** 用户已明确接受 [ADR-0011](decisions/ADR-0011-search-scope-and-reference-first-direction.md) 的 V1 搜索范围与引用优先方向；这是 architecture/documentation closeout，不是技术失败，也不表示所有技术未知项已解决。该次收尾状态为 **DOCUMENTATION CLOSEOUT / WAIT FOR REVIEW**，报告见 [架构收尾](investigations/phase-2-search-scope-architecture-closeout.md)。

**当前方向：workspace Source Locator（filename / relative path）＋active-source bounded literal Find＋Dataset Contract / deterministic Reference Resolver。** Source Explorer 保持单目录 discovery；本轮独立授权的 Slice F 已接入 Raw Utility 路径 catalog 与 Source Locator，Windows x64必要gates累计通过，macOS arm64 NOT YET RUN，结果与限制见下文。本轮独立授权的 Slice G 已实现 Find，Windows 完整验收进行中，macOS arm64 NOT YET RUN；见 [Slice G 报告](investigations/phase-2-source-browser-slice-g-find-in-source.md)。Search discovers raw content; Dataset Contracts establish reference meaning。Reference resolution 不得退化成 unconstrained workspace-wide content search；Incoming References 必须来自 explicit contract semantics，不能由 raw equality 生成边。

**停止的 Search 工作：no Search Foundation authorized；no S1 implementation planned；no compact follow-up。** Workspace-wide raw Exact/Contains/Field/Text、ID/hash occurrence search、relational S1 / persistent content cache、FTS/trigram 与 dedicated Search Utility 为 DEFER；compact typed hash + Contains dictionary 为 DROP from current V1 candidate set。停止 production schema、full build、partial coverage、background/query-assisted indexing、generation/cache lifecycle 和 compact direct-from-raw validation。S1 可行性证据保留，不是永久 rejected。

**FEFF：OPEN / RAW ACCESS CORRECTNESS DEFECT / REQUIRES INDEPENDENT AUTHORIZATION。** 生产 segmented TextDecoder 丢 U+FEFF，真实来源为 `TextMap/TextMapJP.json`、Pointer `/7505878640962067595`，见 [全库调查](investigations/phase-2-search-architecture-full-dataset-investigation.md) 与 [Round 2 保真说明](investigations/phase-2-search-candidate-source-index-investigation.md#25-feff--duplicate-key-prerequisites)。这是近期独立 raw fidelity 任务，关系未来 TextMap/reference preview；未修复，不因 Search defer 关闭。

**Search 历史证据保留，不再等待继续 Search architecture investigation。** [全库调查](investigations/phase-2-search-architecture-full-dataset-investigation.md) 与 [measurements](investigations/evidence/phase-2-search-measurements.json)、[S1/Controlled Retry](investigations/phase-2-search-candidate-source-index-investigation.md) 与 [retry evidence](investigations/evidence/phase-2-search-candidate-source-controlled-retry.json)、[execution-lane validation](investigations/phase-2-search-execution-lane-validation.md) 与 [lane evidence](investigations/evidence/phase-2-search-execution-lane-measurements.json) 均原样保留。全库测量、membership、冻结查询、空间/lifecycle/spool、Browser-under-Search、取消与执行隔离结果继续有效；若未来恢复重型 Search/indexing，可复用 Raw Utility + dedicated Search Utility 的 isolation evidence。历史 `0xC0000409` 根因、重复键 partial coverage、native/平台边界仍按原报告保留，Windows 私有 prototype 不等同 production / macOS / packaging 验收；不因旧 OPEN / UNKNOWN / AWAITING REVIEW 重启调查。

**下一架构焦点：Phase 3A 调查评审 → 最小 Dataset Contract schema/API 设计。** Phase 3A investigation 已获独立授权并完成，候选关系和能力待审；未授权 Contract/Resolver production implementation，FEFF fix 仍需独立授权。Workspace-wide content search 与 Tabs/History/Compare/Diff 不作为 Phase 3 前置条件；现有 Source Browser 的待评审状态及平台限制按下文保留。

**Source Browser Slice G：IMPLEMENTED；Windows x64必要gates累计VALIDATED；macOS arm64 NOT YET RUN；AWAITING REVIEW。** 当前 active source/revision 的 case-sensitive literal raw-fact Find、暂停续扫、32 项批次、有界历史、取消、NodeAddress 导航和 native shortcut 已接入。286普通测试、types、只读真实数据与dev/built/ASAR packaged/normal guard通过，production build恰一次。完整runner在既有catalog/Raw预算失败后按调查证据完成剩余gates；不是单次11阶段exit0，根因未完全隔离；最终结果与限制见 [Slice G 报告](investigations/phase-2-source-browser-slice-g-find-in-source.md)。交付后 STOP / WAIT FOR REVIEW，下一架构焦点为另行授权的 Phase 3A。

**Source Browser Slice F：IMPLEMENTED；Windows x64必要gates累计VALIDATED；macOS arm64 NOT YET RUN；AWAITING REVIEW。** 路径 catalog、typed locate/refresh、Quick Open、唯一 SourceSession activation、en/zh-CN、资源/取消/代次边界已接入。252普通测试、types、真实数据和dev/built/ASAR packaged/normal guard通过，production build恰一次。完整runner曾在旧可见性gate失焦失败，恢复同一build的后三阶段通过；不是单次11阶段exit0，该宿主限制保留；报告见 [Slice F](investigations/phase-2-source-browser-slice-f-source-locator.md)。

**Source Browser Slice E：IMPLEMENTED；Windows x64 native full gate VALIDATED；macOS arm64 PASS WITH FIXES；AWAITING REVIEW。** active-source polling、唯一 stale、显式 Reload、新 revision 同 Pointer 恢复、application-level LOCATION_MISSING/Return to Root 已实现。Windows A/B/C/D shared watcher preflight 在实现前以单次完整 runner exit 0 关闭；最终版本 230 ordinary tests/types/独立真实数据/dev/built/packaged 全过；单次 11 阶段 runner exit 0、production build 恰一次。generic browsing foundation 功能完成不等于整个 Phase 2 或未来功能完成。macOS 定向验收最终单次 11 阶段 runner exit 0、production build 恰一次，三态 polling/stale/reload/recovery 与真实 minimize/hide/resume 通过；仅 harness 修复/增强，无共享产品行为改动，不要求本轮 Windows native 补验。原生 minimize 的通过范围为台前调度关闭，开启组合保留限制。见 [Windows 实现报告](investigations/phase-2-source-browser-slice-e-change-reload-integration.md) 与 [Mac 定向报告](investigations/phase-2-source-browser-slice-e-macos-arm64-validation.md)。

**Source Browser A/B/C/D/E generic browsing foundation is validated on both Windows x64 and macOS arm64.** 仅关闭 generic browsing foundation 平台 gate；不表示整个 Phase 2 或完整 accessibility audit 完成。

**Source Browser Slice A/B/C/D macOS arm64：PASS WITH FIXES / AWAITING REVIEW。** 2026-10-04 单次 11 阶段累计 runner exit 0、production build 恰一次；202 项普通测试、独立真实数据、dev/built/ASAR packaged、真实 native picker/wheel、用户触控板与 VoiceOver sanity check 均通过，见 [累计报告](investigations/phase-2-source-browser-macos-arm64-validation.md)。共享 watcher hint 修复的 Windows native 补验已在 Slice E preflight 完成；此前历史 Windows 结果不作为本轮证据。Slice E 新 diff 的 Mac 定向 gate 已单独完成，范围与限制见本页顶部；Copy Pointer 与完整 accessibility audit 延期。

**Source Browser Slice D：IMPLEMENTED；Windows x64 VALIDATED；AWAITING REVIEW。** NodeBrowserController、Source Header、Breadcrumb、direct children 表格、scalar/segment、Previous/Next、Inspector 和唯一 SourceSession stale 边界已实现。201 项普通测试、独立真实数据、dev/built/packaged 均通过；单次 11 阶段完整 runner exit 0，production build 恰一次，见 [Slice D 报告](investigations/phase-2-source-browser-slice-d-node-browser-inspector.md)。Copy Pointer 因现有 Renderer 权限策略实测拒绝而延期；没有新增权限或 IPC。Slice A/B/C/D macOS 累计结果见本页顶部；Slice E 本轮已独立授权实现。

**Source Browser Slice C：IMPLEMENTED；Windows x64 VALIDATED；本轮已获 Slice D 独立授权。** 正式 App Shell、Workspace flow、Zag managed Source Explorer、TanStack virtualization、分页/取消/retry/refresh、有界缓存和 SourceSession 最小 activation 已实现。172 项普通测试、独立真实数据与 dev/built/packaged UI/data gate 均通过；11 阶段完整 runner 在单次 invocation exit 0，production build 恰一次，见 [Slice C 报告](investigations/phase-2-source-browser-slice-c-source-explorer.md)。Slice A/B/C/D macOS arm64 已累计 PASS WITH FIXES，见本页顶部。

**Phase 0：CLOSED；Phase 1：CLOSED；Phase 1A：CLOSED；Phase 2A investigation：CLOSED / REVIEWED；Phase 2 production implementation：STARTED；Raw Access Foundation：COMPLETE / AWAITING REVIEW。** 首个 production slice 已通过 Windows x64 的完整验收，见 [实现报告](investigations/phase-2-raw-access-foundation.md)；2026-10-03 的原生 [macOS arm64 验证](investigations/phase-2-raw-access-macos-arm64-validation.md)也已通过。**Raw Access Foundation validated on Windows x64 and macOS arm64.** Phase 1A 的平台 gate 和 ADR-0006 仍有效；Phase 2A 原则由 ADR-0007–0010 约束，历史调查保持原样。


**Source Browser Slice B：IMPLEMENTED；Windows x64 VALIDATED（11 阶段证据齐备，ASAR guard 修正后末阶段单独复验）；AWAITING REVIEW。** Renderer-only Paraglide、en/zh-CN、窄 system bootstrap、持久化/no-reload reactive 切换、错误 presentation 和 metadata formatter 已实现。148 项普通测试、类型检查、生成目录为空后的自动恢复、只读真实数据及 dev/built/packaged smoke 已通过；全程一次 production build；当前验证与平台状态见 [Slice B 报告](investigations/phase-2-source-browser-slice-b-localization-foundation.md)。macOS arm64 已累计 PASS WITH FIXES；Slice C 本轮已获独立授权并接入，状态见本页顶部。

## 已完成

**Source Browser Slice A：Windows x64 IMPLEMENTED / VALIDATED；REVIEWED，可继续开发；macOS arm64 cumulative validation PASS WITH FIXES（共享修复 Windows 补验已完成）。** 本轮只实现底层目录发现、metadata 调度和 source 生命周期；106 项普通测试、三目录/六样本真实 gate、dev/built/ASAR packaged smoke 与含真实数据的十步完整验收通过。详细范围、stat 检测边界与清理见 [Slice A 报告](investigations/phase-2-source-browser-slice-a-directory-lifecycle.md)。

- 核实实际目录 TurnBasedGameData，外部仓库初始干净。
- 项目文档整体迁入应用仓库 `docs/`，外层旧目录已移除，证据保留；收尾已提交为 `809a4a5 Closeout Phase 0`。
- 建立产品边界、文档权威模型与实验隔离规则。
- 完成全数据集规模/前 30 大文件统计、15 个代表结构、ID/引用形态调查。
- 完成 42 个重复基准：完整解析、流式与两种 SQLite 驱动；样本指纹和仓库状态一致。
- 完成 Windows x64 Electron 44.5.1 utilityProcess 双驱动/FTS5/BigInt 探针。
- 完成官方版本/兼容范围、构建工具、UI 候选与跨平台发布文档调查。
- 交付中文报告、性能基线与紧凑历史证据；针对性测试通过。
- Phase 0 / Phase 1A 已接受 ADR-0001–0006；Phase 2A 评审新增 ADR-0007–0010，更新当前架构和维护规则，历史调查只增加带日期补记。

## Phase 1A 已实现与验证

- 独立生产 package/lockfile、electron-vite + Svelte 5 + TypeScript + electron-builder 工具链；兼容证据见 [报告](investigations/phase-1a-foundation.md)。工具链路线已由 ADR-0006 接受，当前精确版本不成为永久架构要求。
- sandbox / context isolation 窄 Preload bridge、Main 来源与输入校验、Utility ready handshake、MessagePort 和请求匹配。
- 最多 16 KiB 消息、32 个未完成请求（含一个取消控制槽）、批次取消、超时、窗口销毁、异常退出与显式重启；不自动重放请求。
- Utility 内临时 SQLite：Unicode 和大整数文本往返、close/cleanup；Windows x64 与 macOS arm64 ASAR 目录包均实际加载预构建 `.node`，普通打包态拒绝故障注入。
- 基础交付时 35 项自动测试、类型检查、开发态/构建态/打包态 smoke、基础响应性与测量；工程清理后的当前测试结果见下节。验证使用 synthetic probe，不证明真实数据产品性能。
- AGENTS 加入所有公网操作经系统 7890 代理的长期规则；修复当前文档过时状态，历史调查仅追加带日期补记。

## 工程规范清理

工程卫生清理（2026-10-02）：引入受限范围的 Prettier、长期 formatter/test/昂贵命令政策和分层验证；调整配置 guard、补充打包编排行为验证，并提供单次生产构建的完整验收入口。清理验收时 6 文件 / 43 项测试、类型检查和 Windows 九阶段完整验收通过，独立打包仍重新构建。具体执行结果与失败修正见 [清理报告](investigations/phase-1a-development-policy-cleanup.md)。这是开发流程改进，不改变 Phase 或跨平台 gate。

## macOS arm64 收尾

2026-10-02 在 MacBook Air / Apple M2 / macOS 27.0.1 原生 `darwin/arm64` 完成 Node 24.19.0 / npm 11.17.0 环境准备。确认本机 7890 HTTP 代理后按 lockfile 安装依赖；Electron 44.5.1 内部 Node 24.21.0 / N-API 10 / ABI 149，better-sqlite3 13.0.3 / SQLite 3.53.4。

format/typecheck、6 文件 / 42 项测试、文档检查、dev/built/packaged smoke、独立原生打包及九阶段 `validate:foundation` 均通过。测试数量变化仅因移除了不再支持的 macOS x64 参数化目标。`RefAtlas.app` 与 native addon 均为 arm64；ASAR unpack、真实 SQLite 往返、清理和普通打包模式故障注入保护通过，结束后无项目进程残留。代理与沙箱权限失败均有记录，详见 [macOS 报告](investigations/phase-1a-macos-arm64-validation.md)。没有新增性能基线。

## 已接受决策

- [ADR-0001](decisions/ADR-0001-desktop-stack-and-process-model.md)：Electron/Svelte 5/TypeScript 与 Utility Process 数据服务，初始无 Worker Threads。
- [ADR-0002](decisions/ADR-0002-lossless-raw-data-and-bounded-access.md)：无损类型/词法/出处、物理与逻辑身份分离、有界混合访问。
- [ADR-0003](decisions/ADR-0003-phase-1-sqlite-driver.md)：Phase 1 首选 better-sqlite3；历史三目标门槛由 ADR-0005 部分替代。
- [ADR-0004](decisions/ADR-0004-deterministic-search-semantics.md)：确定性搜索语义独立于 FTS 加速。
- [ADR-0005](decisions/ADR-0005-macos-platform-scope.md)：正式支持 Windows x64 与 macOS arm64，macOS x64 不属于支持目标。
- [ADR-0006](decisions/ADR-0006-electron-build-and-packaging-toolchain.md)：接受 electron-vite + electron-builder 为当前长期构建/打包路线，不永久冻结版本或决定正式发布配置。
- [ADR-0007](decisions/ADR-0007-node-addressing-and-source-lifecycle.md)：Node 物理地址、结构浏览角色、只读来源及 revision 失效。
- [ADR-0008](decisions/ADR-0008-parser-capability-contract-and-source-ranges.md)：可替换 parser 能力契约、一致 raw semantics 及版本绑定的可重建范围。
- [ADR-0009](decisions/ADR-0009-search-completeness-and-optional-acceleration.md)：完整性、可重建 SQLite、可观察回退与可选 accelerator；产品搜索范围由 ADR-0011 部分替代，历史正文保留。
- [ADR-0010](decisions/ADR-0010-ui-localization-boundary.md)：UI-only 类型化 localization、稳定协议 code、raw 数据不本地化及测试边界。
- [ADR-0011](decisions/ADR-0011-search-scope-and-reference-first-direction.md)：Source Locator / active-source Find、全库内容搜索 defer、Search/Reference 分层与显式契约 incoming references。

## Phase 1A 收尾与平台验收

- 桌面骨架、进程链路、有界类型化 IPC、生命周期/取消/崩溃/重启、better-sqlite3 和 foundation validation/test/formatter/工程规范均已留下实现与验证证据。
- 两个正式平台 native/package gate 已通过；平台范围 ADR-0005 与工具链 ADR-0006 均已接受，Phase 1A 无剩余收尾门槛，正式关闭。macOS x64 不属于支持目标，不再构成 gate。
- 详细收尾与明确未完成领域见 [收尾记录](investigations/phase-1a-closeout.md)；签名、公证及正式发布不属于本阶段验收。

| Target | Dev | Package | Utility | better-sqlite3 | SQLite smoke |
| --- | --- | --- | --- | --- | --- |
| Windows x64 | 通过 | ASAR 目录包通过 | 通过 | 通过 | 开发/构建/打包态通过 |
| macOS arm64 | 通过 | ASAR .app 目录包通过 | 通过 | 通过 | 开发/构建/打包态通过 |

Phase 2A 的 Node/浏览、parser/range 和 UI localization 原则继续有效；原完整 workspace 搜索产品范围已由 ADR-0011 部分替代；本轮已实现 raw types、窄 Query API、固定版 parser adapter、工程预算、source revision 与内存范围缓存。Workspace-wide content search、S1/content cache/FTS-trigram/Search Utility 已 defer，compact hash 已退出当前候选；Source Locator IMPLEMENTED，Windows累计验收与Mac NOT YET RUN限制见Slice F，Find 已实现（验收见 Slice G），Dataset Contract 尚未实现；Source Explorer shell 与当前 revision 的 Node Browser/Inspector 已实现；可见窗口帧率与正式签名/公证未测。基础 IPC 口径见 [PERFORMANCE](PERFORMANCE.md)，真实采样与隔离传输实验保留在原调查报告。

## Phase 1 最终收尾与 Phase 2A 调查历史

- Phase 1 随 Phase 1A 正式关闭；`.gitattributes` 固定自动文本检测与 LF checkout，无 CRLF 例外，不改写历史调查。
- 21 个真实样本结构／词法与分布调查，15 个 Phase 0 指纹一致；外部 HEAD、工作树及所有采样文件未变。
- 受限 SQLite/Exact/LIKE/unicode61/trigram、source range／child summary、Node 与 Electron Main↔Utility 实验完成；八组针对性风险检查通过。
- 中文 [调查报告](investigations/phase-2a-data-access-architecture.md) 与 [紧凑证据](investigations/evidence/phase-2a-measurements.json) 已保存；新增依赖与工具仅在独立 investigation package。
- 调查交付时未改生产 src/package/lockfile，未建立生产索引／契约／关系／产品 UI，未新增已接受 ADR 或操作远程仓库；调查随后纳入 `e049ab4 Complete Phase 2A investigation`。

## Phase 2A 评审收尾

- 正式接受用户确认的原则，新增四份职责独立的 ADR；ADR-0002/0004 仅增加补记，历史决定正文保留。
- 明确 JSON Node ≠ Structural Record ≠ Logical Entity；SourceAddress + Pointer 为物理地址，SourceRange 为失效可重建的访问元数据。
- 当时接受 parser capability contract、raw 搜索完整覆盖、只读来源与 revision invalidation；不锁定库、schema、匹配选项、预算或 trigram 默认覆盖。原全库搜索产品范围已由本次 ADR-0011 部分替代，其他原则继续有效。
- 接受从第一批 Phase 2 production UI 起统一类型化 localization；更新功能测试与专项 localization 测试边界，本轮不实现 runtime。
- 同步产品、架构、流程和入口，原调查仅追加日期明确的评审补记。报告记录实际文档/格式/diff 验证及最终变更清单；未改生产代码、依赖、配置、工具和证据。

## Phase 2 Raw Access Foundation

- 受控 NodeAddress、只读 workspace/source、stale/reload、revision-bound range 和单任务可取消扫描已生产实现。
- `@streamparser/json@0.0.26` 经统一 adapter 保留六类型和 numeric lexeme；完整小值、摘要、children 分页及 scalar segment 有明确工作/IPC 预算。
- 普通测试 65 项通过，专用六来源只读 gate 通过；Windows x64 dev/built/ASAR packaged raw smoke 和九阶段完整验收通过。
- macOS 27.0.1 / Apple M2 原生 arm64：65 项普通测试、临时 filesystem/watcher/stat 回退探针、六来源真实数据 gate、dev/built/ASAR packaged raw smoke 均通过。parser runtime dependency 与 better-sqlite3 native unpack 实际可用；无 production bug 或源码修改，详见 [Mac 验证报告](investigations/phase-2-raw-access-macos-arm64-validation.md)。
- 未新增产品 UI、SQLite 持久化、search/trigram、Dataset Contract 或 source writes；更大 scalar/child-index 优化未做。两平台 gate 不代表所有文件系统、严格 snapshot isolation、正式性能 SLA 或整个 Phase 2 已完成。

## 归档前的下一步（历史规划，已停止）

Slice A 已评审，Slice B localization 已获授权并实现；最终 Windows gate 与评审状态见本页顶部及 [Slice B 报告](investigations/phase-2-source-browser-slice-b-localization-foundation.md)。Slice A/B/C/D 新实现的 macOS arm64 累计原生 gate 已完成，证据见本页顶部，不借用旧 Raw Foundation 结果。

Phase 3A 调查已完成，当前 STOP / WAIT FOR REVIEW；评审重点为五案候选语义、M1–M8 最小能力，以及 AvatarSkill 的多记录/group/view 与 incoming 归属，见本页顶部报告。下一次 schema/API 设计或 production implementation 需另行授权，不继续 Search Foundation 或 compact follow-up。FEFF 仍是独立 OPEN Raw Access correctness task，依赖 production TextMap string fidelity 的功能在修复前不能验收；Source Browser 的既有平台 gate、待评审状态和限制保持原口径。Workspace-wide content search、Tabs/History/Compare/Diff 不阻塞 Phase 3；本轮不自动开始 FEFF fix、契约、References/Graph 或发布工作。
