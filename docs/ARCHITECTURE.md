# 已接受架构与约束

**Archived standalone architecture — 2026-10-06。** 本文保留 standalone RefAtlas 开发时期的架构记录。Electron/Svelte、Main/Preload/Utility Process/Data Service 及下文实现边界继续描述旧项目；未来规划和待验证项属于历史状态，不构成归档后的工作清单。当前归档决定见 [STATUS](STATUS.md)。

这些架构决定不构成 [RefAtlas-VSCode](https://github.com/Oereor/RefAtlas-VSCode) 的 architecture requirements，不进行架构迁移。Successor 是独立、轻量的产品重置，其架构以自己的仓库文档为准；归档不追溯否定 standalone 已接受的 ADR。

2026-10-04 Phase 1 与 Phase 1A 已关闭，Phase 2A 已评审并关闭；用户明确确认的原始访问、搜索及 UI 本地化原则已进入 ADR-0007–0010。Windows x64 与 macOS arm64 的最小桌面链路和原生 ASAR 目录包均已验证。产品原则见 [PROJECT](PROJECT.md)，决定历史见 [ADR](decisions/README.md)，调查是历史证据而非当前架构规范。Phase 2 production implementation 已 STARTED；首片 Raw Access Foundation 经用户明确授权实现并验证，见 [实现报告](investigations/phase-2-raw-access-foundation.md)。Slice C 已建立 Source Explorer，Slice D 已接入当前 revision 的 Node Browser/Inspector；Slice E 已补齐显式 Reload 和同 Pointer recovery；active-source Find 已由 Slice G 实现，契约未实现，workspace 内容搜索仍 deferred。A/B/C/D macOS arm64 累计 gate 已 PASS WITH FIXES，shared watcher Windows 补验已在 Slice E preflight 完成，见 [累计报告](investigations/phase-2-source-browser-macos-arm64-validation.md)。Slice E 的 [Mac 定向验收](investigations/phase-2-source-browser-slice-e-macos-arm64-validation.md) 已 PASS WITH FIXES，仅 harness 修改；A/B/C/D/E generic browsing foundation 平台 gate 已关闭，Mac minimize 通过范围为台前调度关闭，开启组合保留限制。

2026-10-05 产品范围更新：[ADR-0011](decisions/ADR-0011-search-scope-and-reference-first-direction.md) 已接受搜索范围与引用优先方向，部分替代 ADR-0009 的 workspace-wide content search 要求；既有 investigation evidence 保留。当前 V1 workspace discovery 仅要求 Source Locator，raw content find 限 active source，跨 source 语义导航由 Dataset Contract / Reference Resolver 承担。Slice F 已接入路径 catalog / Source Locator 的窄 raw API，生产拓扑保持 Raw Utility ownership；Find 已由 Slice G 实现，契约尚未实现，验收状态见 STATUS。

## 1. 桌面栈与进程所有权

采用 Electron、Svelte 5、TypeScript，面向 Windows x64 与 macOS arm64，通过 GitHub Releases 分发，无网页部署。macOS x64 不属于正式支持目标。接受 electron-vite 负责 Main/Preload/Renderer/Utility 入口与开发构建，electron-builder 负责桌面打包、ASAR/native unpack 及后续发布打包基础；不永久冻结当前包版本，正式发布配置仍未决定。[ADR-0001](decisions/ADR-0001-desktop-stack-and-process-model.md) [ADR-0005](decisions/ADR-0005-macos-platform-scope.md) [ADR-0006](decisions/ADR-0006-electron-build-and-packaging-toolchain.md)

初始拓扑：Renderer → Preload 类型化窄桥 → Main → Utility Process → Data Service。

| 边界 | 职责 | 禁止承担 |
| --- | --- | --- |
| Renderer | Svelte 展示、树/表格/标签、有界视图、未来局部图、交互 | 任意工作区文件读取、SQLite、巨大 JSON 解析与整文件状态 |
| Preload | 最小类型化桥 | unrestricted IPC、ipcRenderer 或 Node API 暴露 |
| Main | 生命周期、窗口、对话框、工作区编排、数据进程生命周期 | 重型数据处理引擎 |
| Utility Process / Data Service | 扫描、解析/流式、索引、SQLite、搜索、Node/后续契约引用查询 | 启发式或 AI 关系真相、UI 翻译 |

初始不引入 Worker Threads；只有测量证明具体需要时再接受。Phase 1A 的该进程链路、最小请求生命周期与显式恢复已在 Windows x64 和 macOS arm64 验证；不代表表中未来数据功能已实现。

### 已验证的基础链路

- BrowserWindow 启用 context isolation/sandbox，禁用 Node integration；Preload 自包含 CJS 构建并检查运行时隔离状态。桥只提供状态、有限 Probe、取消、SQLite smoke 与受保护的诊断方法。
- Main 校验发送窗口、主 frame、文档 URL、参数数量和输入类型；消息通过 MessagePort 进入 Utility。启动握手、请求/响应校验、超时、窗口销毁和服务退出都会明确结束相关请求。
- 每次发往 Utility 的 wire ID 独立生成；调用方 ID 可用于取消，但迟到响应不能匹配复用 ID 的新请求。新服务使用新 broker/代次，无自动重放或复杂 supervisor。
- 当前基础设施限制：16 KiB 消息、32 个未完成请求（普通任务最多 31，保留取消控制槽）、最多 1,000 步/计划时长 10 秒、启动 10 秒/请求 20 秒超时。这不是未来数据模型或产品性能预算。
- SQLite 只在 Utility 的独立 smoke 模块内操作临时数据库，主进程与 renderer 不拥有数据库。普通打包启动拒绝 crash/restart；开发态或显式诊断/smoke 模式才允许。

## 2. 数据事实、类型与身份

概念层次：UI/客户端 → Query API → 显式 Dataset Contract → 通用数据/索引 → 原始文件。这是职责边界，不是已实现接口或最终进程拓扑。

Core 不推断引用、不硬编码玩家实体。相等数值、相似字段、启发式或 AI 不能生成真实边；引用来自显式确定性 Dataset Contract 或等价来源。

原始 JSON 六类值、无损数值词法与出处必须保留，123 与 "123" 可区分。number lexeme 是事实；解析值只能在证明安全时辅助使用。数值未经安全性证明不得经过 JavaScript number；signed INTEGER 不保证承载全部 ID/哈希。

接受概念地址 `SourceAddress = { workspaceId, relativePath }`、`NodeAddress = { source, pointer }`；SourceAddress + JSON Pointer 定位原始 Node。根 Pointer 是 `""`，`~`、`/` 分别转义为 `~0`、`~1`。生产类型和 raw query 线格式现由 `src/shared/raw.ts` 管理，受控标识与路径/Pointer 均经运行时校验。

JSON Node ≠ Structural Record ≠ Logical Entity。在显式选中 collection/container 内，直接 child 可以作为 structural record 列出、浏览；这只是浏览角色，不保证整体物化或一次 IPC 返回。根、容器、属性、scalar 都可定位。Core 不根据 ID、名称、metadata、wrapper 或值猜实体/默认 flatten；逻辑身份和数据集知识留给 Phase 3 的显式 Dataset Contract / dataset adapter。[ADR-0002](decisions/ADR-0002-lossless-raw-data-and-bounded-access.md) [ADR-0007](decisions/ADR-0007-node-addressing-and-source-lifecycle.md)

### 只读来源与外部变化

当前 raw source 是只读 viewer / investigation 来源，不设计 raw editing/save/merge/conflict resolution/undo-redo/transactional source writes/source-format rewrite。应用自己的缓存目录可以写，source workspace 保持只读。

外部变化按 old revision → stale → invalidate → reload/reindex → new revision 处理；旧 SourceRange 和相关文件索引失效，打开视图表达 stale。可重新打开仍存在的相同 Pointer，但不意味着同一 logical entity；不存在时表达 location no longer exists。不按 ID、值或 heuristic 迁移，不恢复 array reorder 的原记录。tabs/history 保存物理地址及 revision 上下文，不能把裸 range 当永久身份。目标是可靠检测并响应变化，不要求每次 Node read 重 hash 全文件或数据库级 strict snapshot isolation；production 使用已知来源 watcher/轮询、路径与句柄前后 stat 检查，首次完整校验计算 hash；显式 reload 建立新 revision，已知变化不返回成功结果。具体实现和局限见本轮报告。[ADR-0007](decisions/ADR-0007-node-addressing-and-source-lifecycle.md)

## 3. 有界与混合访问

- 外部数据只读，不修改、不复制到应用仓库。
- 渲染进程只收有界查询结果、Node 摘要或有界值/片段，不保存整份巨大 JSON。
- 主进程负责生命周期/编排，不承担重型数据处理。
- 巨大文件是数据源，通过搜索、记录浏览、外部打开使用，不整体加载编辑器。
- 大列表使用成熟虚拟化，不堆海量 DOM；解析、数据库、编辑器、图等优先成熟库。

小且安全文件可有界完整解析；大或精度敏感文件采用流式和/或索引访问。无固定大小阈值，不声称流式普遍更快，巨大嵌套记录仍需细化边界。实验 numberAsString 不构成生产类型。[ADR-0002](decisions/ADR-0002-lossless-raw-data-and-bounded-access.md)

### Parser adapter 与范围

接受可替换的成熟库 adapter 能力契约：六类型、numeric lexeme、不安全数值不先经过 JS number、大文件 bounded/streaming、巨大 scalar 不无界聚合、产生或恢复 source byte range、取消、资源限制、所有路径一致 raw semantics。indexing/range-read/search 不得各自产生不同 raw truth。

`SourceRange = { startByte, endByteExclusive }` 是源文件字节坐标上的半开区间，nullable、version-bound、rebuildable；Pointer 是地址真值，range 是 cache/acceleration metadata，不参与 identity。无范围时仍可定位和恢复，源变化时失效。UTF-8/BOM/转义/分块及资源边界需在生产适配中验证；历史调查中的两库原本只是候选；当前 production adapter 采用固定版 `@streamparser/json@0.0.26`，原始数值不先经过 Number，语法/范围/预算共用一个入口。库仍可替换，版本由 package/lockfile 管理。[ADR-0008](decisions/ADR-0008-parser-capability-contract-and-source-ranges.md)

### 已实现的 Raw Access Foundation

`window.raw` 提供受控 workspace open/close、source info/reload/release、单目录 discovery、Node read、children page、scalar segment 和 owner cancellation。Main 原生选择根目录，Utility 生成有界 displayName，拒绝路径逃逸和根下 symlink/junction；不做全库 discovery。小值返回完整六类型 union，大值返回独立 summary，object 使用有序 entries。

Source Browser Slice A 的 `DirectoryPath` 与 `.json` RelativePath 分离，根为 `""`。单目录 listing 仅返回普通目录与精确 `.json` 普通文件，不解析或注册 source；按目录优先、组内 `<`/`>` 排序。分页使用绑定 workspace generation、目录与 snapshot 的 opaque UUID cursor；目录 stat 变化、TTL/淘汰使 cursor 失效。snapshot、扫描、执行、并发和完整 64 KiB response 均有界，长路径页自动缩减，不截断地址。详见 [实现报告](investigations/phase-2-source-browser-slice-a-directory-lifecycle.md)。

只有 info/reload 显式 acquire；Node 请求绑定已注册 source，release 后返回 SOURCE_CHANGED。解析保留 single queue；directory/info/reload 走并发 2 的 metadata 槽，release/close 直接进入控制屏障。registration token、source-scoped task、同地址控制链及 workspace generation 防止旧任务发布/清理新状态；release 等待 handle finally 后清 metadata/range/cursor，watcher 按明确 source owner 共享。watcher 通知作为 hint，对当前 registration 复核路径/stat，按 source 合并 pending verification；无变化的迟到或重复通知不使 source stale。变化检测依已有 stat signature，不提供恶意保留所有 stat 的 strict snapshot 保证。Utility 同步成功 reply 与 acquisition 最终提交，取消的未交付 candidate 回滚。没有公开 lease/ref-count API，仍是单窗口使用范围。

首次 Node 请求按预算完整校验一个 source 后才能发布范围；之后可用 revision-bound range。工作预算为 128 MiB read、800 万 token、深度 128、256 KiB token/window 和 15 秒；4 KiB 块之间让出执行。完整值初始 48 KiB/1,000 Node/深度 8，raw response envelope 64 KiB，foundation 控制限制保持 16 KiB。source/range/cursor 均为有限内存状态，不使用 SQLite 持久化；所有数值保留 lexeme。来源变化失效旧缓存，旧 workspace/revision/cursor 不自动恢复。

这些是已验证工程实现，非永久预算或产品 SLA；完整行为、错误和 edge-case policy 见 [报告](investigations/phase-2-raw-access-foundation.md)。

## 4. 存储、discovery/find 与契约引用

Phase 1 首选 better-sqlite3，SQLite 属于 Data Service，经窄内部存储边界隔离，不引入 ORM。Windows x64 与 macOS arm64 打包后的原生加载与数据库访问是正式必过门槛；macOS x64 已由 [ADR-0005](decisions/ADR-0005-macos-platform-scope.md) 移出支持范围。存在实质问题可复审驱动而不改高层 Query API 语义。本次不设计存储 API。[ADR-0003](decisions/ADR-0003-phase-1-sqlite-driver.md)

### 当前 V1 discovery model

| 范围 | 职责 | 实现边界 |
| --- | --- | --- |
| Workspace | Source Locator：filename / relative path | 不要求解析全部 JSON、scalar/field occurrence index、S1、FTS/trigram、persistent content index 或 dedicated Search Utility |
| Active source | Find in Source：bounded literal Contains/find | 复用 raw/parser foundation，渐进匹配、取消、source-revision safety、previous/next navigation、有界 Renderer payload；不要求 persistent index |
| Cross-source semantic navigation | Dataset Contract / Reference Resolver | 显式契约定义 target scope、structure、matching rule，返回目标 NodeAddress / Logical Entity |

Source Explorer 保持单目录 discovery；Slice F 的独立 workspace catalog 只管理 JSON 路径 metadata，服务 filename/path Locator。Slice G 已实现当前 source/revision 的 Find，具体实现见下文。Find 示例 `1407` 可匹配当前 source 的 `1407`、`140701`、`131407`，不扩展到所有 workspace source。

确定性匹配方向遵循 [ADR-0004](decisions/ADR-0004-deterministic-search-semantics.md)，Find 采用区分大小写 literal Contains，具体 protocol/预算见 Slice G 实现。完整性约束声明的查询范围，progress、partial results 与 cancellation 必须可观察，未覆盖或失败不能冒充完整无结果；不再要求 V1 完整 workspace raw content coverage。raw JSON 是 source of truth，SQLite 是可重建缓存，类型、numeric lexeme、出处与 revision 边界继续有效；不因存储方案丢失大整数或 raw facts。[ADR-0009 的历史与部分替代](decisions/ADR-0009-search-completeness-and-optional-acceleration.md)

### Search 与 Reference 的正式边界

**Search discovers raw content; Dataset Contracts establish reference meaning.**

**Reference resolution must not be implemented as unconstrained workspace-wide content search.**

未来 selected raw Node → Dataset Contract → deterministic reference semantics → target scope / target structure / matching rule → Reference Resolver → target NodeAddress / Logical Entity。`Avatar.Skill[] = 140701` 可由契约规定 lookup `AvatarSkillConfig.json` 的 `SkillID`，按契约的 typed exact equality 确定目标；不能退化为 Global Search `140701`。可直接从 `CharacterName.Hash` 推导 TextMap key / Pointer 时直接访问。示例不接受具体契约 schema 或相等规则，raw search semantics 不自动定义 reference resolution。

Incoming References / Referenced by 只能来自显式 contract semantics；`SomeRandomNumber: 140701` 不因值等于 SkillID 生成边。关系导航继续遵守 Core does not infer relationships。

### Deferred / dropped Search 工作

Workspace-wide raw Exact / Contains / Field / Text、scalar / ID / hash occurrence search 为 DEFER，是接受的 V1 产品缺口，不是技术失败。Relational S1、persistent content cache、FTS/trigram 与 dedicated Search Utility 同样 DEFER；compact typed hash + Contains dictionary 为 DROP from current V1 candidate set，不再做 direct-from-raw validation。

S1 的 candidate-source architecture 已有充分可行性证据，但当前 V1 没有 workspace-wide raw-content Exact acceleration 需求，停止 production schema、full build、partial coverage、background / query-assisted indexing、generation 与 persistent content cache lifecycle；不是永久 rejected。约 3 GiB 的历史 S1 空间量级可接受，compact 的 collision/dictionary/GC/incremental complexity 与收益不匹配。

若未来恢复重型 workspace-wide Search/indexing，Raw Utility + Dedicated Search Utility 是合理 isolation 方向，当前不提前实现。保留 [全库调查](investigations/phase-2-search-architecture-full-dataset-investigation.md)、[S1/compact 调查](investigations/phase-2-search-candidate-source-index-investigation.md) 与 [execution-lane evidence](investigations/phase-2-search-execution-lane-validation.md)，未来复审应复用证据；私有原型不等同生产或跨平台验收。

生产 segmented TextDecoder 丢 U+FEFF 仍是 OPEN 的 Raw Access correctness defect；真实 `TextMap/TextMapJP.json` `/7505878640962067595` 的首字符丢失见 [既有调查](investigations/phase-2-search-architecture-full-dataset-investigation.md)。这是近期独立 raw fidelity 任务，影响 TextMap/reference preview，不随 Search defer 关闭；本轮不修复。

## 5. UI 本地化边界

从第一批 Phase 2 production UI 起，所有 APP 用户可见 message（按钮、菜单、标题、对话框、提示、empty/loading/searching、错误、a11y 等）经统一且类型化的 localization message layer，不在组件/业务逻辑/Data Service/IPC/parser/SQLite 散落 locale-specific 文案。

raw field/string/numeric lexeme/path/Pointer/NodeAddress 保持原事实，`AvatarID`、`DamageType`、`Ice` 不翻译；`1.00`、`-0`、`1e3` 不走 locale number formatter。APP 自有日期/时间/计数/大小/普通 UI 数字使用共享 `Intl.*` formatting layer。

内部协议使用稳定 locale-independent identifier/code，presentation 将 code 与参数映射为用户消息，locale 无需传到 Data Service。Slice B 正式采用 Paraglide JS（当前 compiler 2.25.4 devDependency），支持 `en` / `zh-CN`，英文为 base/fallback；集中 catalog 为权威，generated modules/declarations ignored、不人工维护。功能测试不以具体译文断言行为，专项 localization tests 验证消息、参数、切换、fallback/formatter 和 raw 边界。[ADR-0010](decisions/ADR-0010-ui-localization-boundary.md)

Main ready 后读取 `app.getSystemLocale()` 并缩减为 UiLocale，只经可信 additionalArguments → sandboxed Preload readonly `appPresentationConfig` 传值；不传原始系统语言、不增加 raw command 或 unrestricted IPC。Renderer 挂载前按有效 localStorage `refatlas.locale` → system bootstrap → en 初始化。统一 i18n 入口管理 readonly Svelte store、Paraglide globalVariable/baseLocale strategy、存储、messages、formatters 和 error mapper；切换 `{ reload:false }` 并明确驱动 reactive 文案与 html lang/dir，不导航、不重置其他 state。

`project.inlang/settings.json` / `messages/en.json` / `messages/zh-CN.json` 为 tracked source；固定版 message-format 插件准备到 ignored 本地缓存，避免 SDK URL cache 的 network-first 请求。CLI 与 Renderer Vite plugin 共享编译配置、在 typecheck 前生成声明；Main/Preload/Utility 没有翻译 runtime 或 catalog。metadata formatter 只接收非负安全整数，byte size 使用十进制单位；error mapper 不修改协议，未知 code 映射通用错误，不回显任意 details。实现与验证边界见 [Slice B 报告](investigations/phase-2-source-browser-slice-b-localization-foundation.md)。

## 6. Source Explorer Shell

Slice C 采用 Renderer-only Zag.js tree-view/Svelte adapter 与 TanStack Svelte Virtual。Zag 控制交互、expanded/selected/focus 和 ARIA；ExplorerController 持有目录状态、取消、request ID、epoch、分页、重试和缓存，禁用 Zag 原生 loadChildren 生命周期；TanStack 只负责可见 DOM、滚动和固定行高。UI ID 与 DirectoryPath/SourceAddress 分离。

WorkspaceController 保留 picker cancel 前的树/session，成功后基于已有 Utility reset 切换 Renderer epoch。SourceSession 管理 active/pending、SourceInfo、root NodeSummary 和可选 complete root RawScalar；complete container value 不进入 session state；info + root read 成功后提交 B，再释放 A，失败保持 A。候选串行、最新意图优先，旧请求 settled 后 cleanup，避免同地址旧 release 清理新会话。

目录页上限 200、Renderer metadata cache 起点 10,000 entries / 8 MiB，折叠子树 LRU 优先，展开分支/选择焦点祖先/加载中目录受保护；无法容纳时明确资源限制。STALE_CURSOR 保留已有页并要求显式刷新，整树刷新不释放 active source。固定 24px 行、overscan 5，焦点行可额外挂载一项；未知完整兄弟数量使用 aria-setsize=-1。

工具栏有工作区与 locale selector，紧凑浅色 shell、280px Explorer、中央 Node Browser 和默认展开 280px / 折叠 32px Inspector。单击选择，Enter/双击激活；所有正式文案经过 Slice B。Slice D 提供当前 revision 内 Node/ancestor 导航，不写入 source。Renderer 依赖及其 Svelte compiler 闭包不复制到 ASAR node_modules，Main/Preload/Utility 不导入 UI 库。

## 7. Node Browser / Inspector

SourceSession 是 source acquire/release 和 stale 的唯一所有者；markStale 按 SourceAddress + revision 验证，迟到旧源错误不能标记新源。成功 root read 完成语法验证后同步 validated；失败不把尚未验证当 invalid JSON。NodeBrowserController 只消费 active source，不注册或释放 source。

Controller 保存 current address/summary、已知 parent context、可选 complete RawScalar、selected child、一页 children 或一段 scalar、cursor metadata、局部 pending/error 和 epoch。单执行通道取消旧意图，等待旧请求 settled 后执行最新意图；提交同时验证 source/revision/epoch。readNode 成功先提交 current，随后加载第一页；失败保留旧 current/view。返回当前 Node 取消其他 pending navigation，不重新 read/acquire。workspace/source 切换清空 Node 状态；同 source 新 revision 只恢复 current Pointer并清分页/selection；picker cancel、Explorer refresh 和 locale switch 保持状态。

Container 一律 listNodeChildren，page 上限 RAW_LIMITS.page=100，不遍历 complete container value、不额外 read 每行。Scalar complete number 显示 exact lexeme、string 显示 semantic value；summary string/number 用 readScalarSegment，limit=4096。Previous/Next 替换 payload，最多 128 项 opaque cursor/page metadata，窗口边界提供 Restart；STALE_CURSOR 保留原页并要求 null cursor Restart，不解析 cursor。

SOURCE_CHANGED 标记唯一 session stale，取消其他读取并保留缓存内容；Header/中央/Inspector 显示 stale，Controller 和按钮双重禁止新的结构读取。Slice E 提供 stale-only Reload 和新 revision 同 Pointer 恢复。LOCATION_MISSING 为应用状态，recovery NOT_FOUND 后须确认来源仍 current；文件级失败保留旧 stale view，不自动跳根。成功只恢复 current Pointer，selection/page/cursor/segment/context/scroll 清空，Return to Root 由用户触发；没有 History。Breadcrumb 使用 splitPointer/joinPointer/parentPointer，显示 decoded raw token，不将 numeric-looking object key 猜为 Index。Inspector 优先 selected child，否则 current，只有已知父 kind 才标 Index；展开状态只在 App UI memory。

表格使用 semantic table 和 roving tabindex，Up/Down/Home/End 选择并移动 focus，Enter/双击进入，Escape 清选择，区域内 Alt+Left 返回父；不引入虚拟化或新表格库。UI message 沿用 Slice B，raw key/value/lexeme/path/Pointer/revision 原样保留。Copy Pointer 真实用户手势在现有 deny-all permission handler 下失败，作为可选功能延期；没有新增 clipboard IPC 或扩大权限。Windows 验收与限制见 [Slice D 报告](investigations/phase-2-source-browser-slice-d-node-browser-inspector.md)。

SourceSession 只对 active current source 以请求 settled 后约 1s 的节奏 getSourceInfo，no overlap；AppShell 传 visibility，隐藏/最小化暂停，恢复可见立即检查，可见但失焦继续。普通 poll error 保留 view；reset/dispose 清 timer/listener/request。普通产品 BrowserWindow 使用 Electron 默认 backgroundThrottling=true，让 Page Visibility 正确反映窗口；smoke 也从创建时使用 true，并使用与产品一致的初始可见窗口；guard smoke 保持隐藏。没有 Main→Renderer push IPC。Session.reload 复用 reloadSource/root validation，NodeBrowser 等待新 revision Pointer recovery，source/workspace 新意图仍优先；底层 registration/queue/预算保持原实现。详见 [Slice E 报告](investigations/phase-2-source-browser-slice-e-change-reload-integration.md)。

## 8. Workspace Source Locator

RawDataService 持有 RawSourceCatalog。workspace open 成功后异步启动单扫描，不占 parser/metadata scheduler，也不阻塞 open 的 IPC reply；新 generation 的 catalog / request 守卫与旧任务收尾覆盖 refresh、switch、close/dispose。Renderer 只接收 building/ready 状态或有界匹配项。新增 locateSources / refreshSourceCatalog 经现有 typed Preload/Main/MessagePort、runtime validators 和 RequestBroker。source lookup 不 acquire，只有用户选择后调用唯一 SourceSession.activate。

遍历使用 opendir/lstat、安全 resolveRawPath 和目录前后 stat；不 follow symlink/junction，不读取 JSON 内容，只接受 regular exact .json。各层 .git（含大小写变体）排除；其他 hidden directories 保持可发现。发布前复核已访问目录，已知变化/权限/资源失败丢弃整次 build，须显式刷新重试；仍是 stat-based best effort traversal，不承诺严格 snapshot isolation。

比较键为 locale-independent toLowerCase，不改 query/raw path；basename exact → prefix → contains → relativePath contains → raw relativePath code-unit tie-break。每次 query 维护 top 50，不全排序 matches；完整 envelope 按 64 KiB 缩减并显式 truncated，无 cursor/spool。空 query 返回空 ready 列表，UI 显示输入提示。

默认 1,000,000 sources / 100,000 directories / 2,000,000 scanned entries / 128 MiB accounted metadata / 60s build；Raw Utility 内单个 builtin worker 逐目录同步 metadata I/O，复用逐组件 link/confinement/stat 策略；单目录 handle，每64项 yield。完整目录前后和最终复核，失败丢弃整次列表。worker每包≤64项/64KiB、单在途包等待ACK；Atomics取消与finally关闭handle后等待实际worker exit再换代。Main仅传入Vite编译的worker路径，不做扫描，不新增进程或依赖。query 每 1,024 项 yield，1s work。计费包括字符串、对象/遍历元数据和固定 1MiB 临时余量，非 heap/RSS 硬上限。catalog 留在 workspace lifetime 内存；没有 TTL、持久 DB 或 workspace watcher network。明确的刷新文件列表重建 catalog，Explorer refresh 保持独立。

WorkspaceController 持有 SourceLocatorController；latest-intent 串行 drain、AbortController、request epoch 与 catalog generation 防迟到覆盖。building 时仅在 dialog 打开期间约 250ms poll，ready 后执行最新 query，关闭不取消共享 build。原生 dialog 管 focus/Tab，combobox + listbox/options 管 selected 与 active-descendant；Ctrl/Cmd+P、显式按钮、上下/Enter/Escape/click 已接入。选择先关闭、恢复 focus，再复用 source activation；错误沿用现有 presentation，取消保留 Explorer/Node/Inspector。en/zh-CN 文案进入 Paraglide，raw names/path/query 不翻译。验收与局限见 [Slice F 报告](investigations/phase-2-source-browser-slice-f-source-locator.md)。

## Active-source Find（Slice G）

NodeBrowserController 持有 FindController；SourceSession 仍是唯一 registration/revision/stale 所有者。Find 只保存 raw query、匹配历史、进度、cursor 与错误。key 与 scalar 分别计命中；decoded key 对应 property value NodeAddress，semantic string / number lexeme / canonical boolean/null 对应自身地址。每事实仅一次，按源顺序 key 在 value 前。所有命中复用 navigate(address, context, { preserveFocus: true })，无需父表 reveal 或第二套读取路径。

scanJson 和 Find 共用 createJsonWalk，保留成熟 tokenizer、grammar、Pointer/range/duplicate-key/BOM/decoder semantics；只在完整 4 KiB feed 块间暂停。首次 matching block 可交付，no-match 每约 100ms 返回进度。Utility 最多一个会话，绑定 workspace generation、source registration token、revision 与原始 query；每批关闭文件句柄、释放 parser queue，续扫重新打开并复核路径/句柄 stat。findInSource/closeSourceFind 沿用 exact validators、可信 Main、owner cancellation 与窄 Preload；cursor 是单向、轮换、不可重用的 opaque capability，迟到旧 close 不会清理新查询。

每批 ≤32 matches，query ≤1 KiB，待交付 metadata ≤8 MiB；完整 request/response 仍为 16/64 KiB，响应缩页保留余项。Raw read/tokens/depth/token/key/address 限制沿用；累计执行 15s，暂停不计时，续扫不重置预算。只有 EOF grammar 校验和全部待交付 matches 交付后 complete。失败不冒充完整无结果。

Renderer debounce 150ms，输入变化立即取消旧请求/导航并清旧结果；单请求 drain 以 signal/epoch/source/revision 守卫提交。最多 128 matches / 512 KiB，Next 消耗历史后按需续扫，Previous 只走已加载历史；边界停止、不循环，淘汰后提供 Restart。空进度批次自动继续到首命中/EOF/取消/失败；ready 不自动全扫。用户普通 Node 导航取消在途 Find，保留有效历史，需续扫时从头 Restart。首批自动导航，输入焦点保持；打开/关闭不改变 current Node/selection/page/Inspector。

Ctrl/Cmd+F 在 Renderer preventDefault，Locator modal 打开时不在下方打开 Find。Enter/Shift+Enter/Escape 和显式按钮、localized ARIA/title/polite status 已接入。关闭恢复仍有效的原焦点，否则按 scalar、表格、Breadcrumb 内容顺序回退。source/workspace 切换清 query 并关闭；stale/reload/revision 变化清结果并取消，同 source Reload 保留 query、等待显式重新查找。locale switch 保留 raw query/matches/navigation。资源失败、incomplete、历史边界与 no-match 区分呈现；未到 EOF 不宣称无更多。平台验收见 [Slice G](investigations/phase-2-source-browser-slice-g-find-in-source.md)。

## 9. 尚未接受或产品验证

- 正式发布配置、CI/release workflow、签名、公证、安装器/DMG、自动更新与发布节奏。工具链路线已接受，但这些发布事项不属于 ADR-0006；具体版本由 package/lockfile 管理并按风险升级验证。
- Dataset Contract 与完整产品 UI/API 尚未实现；新增 raw query primitives 已接入现有进程链路。Phase 3A 契约架构/调查是下一焦点，需独立授权。
- Workspace-wide content search / S1 / content cache / FTS-trigram / dedicated Search Utility 已 defer，compact hash 已退出当前候选；不是等待继续 Search Foundation 的任务清单。
- 契约 schema、resolver matching rule、incoming/reference navigation 仍待独立设计；child index 和更大 scalar streaming 优化尚未实现。FEFF 是独立 OPEN correctness work。
- 台前调度开启组合的 macOS minimize/visibility 回归、完整 accessibility audit 和正式签名/公证验证；macOS A/B/C/D 累计 gate 与用户 VoiceOver sanity check 见 [累计报告](investigations/phase-2-source-browser-macos-arm64-validation.md)，Slice E 范围见 [Mac 定向报告](investigations/phase-2-source-browser-slice-e-macos-arm64-validation.md)。

[Phase 2A 调查](investigations/phase-2a-data-access-architecture.md)保留历史候选与实测；本次接受范围及候选区别见 [评审收尾](investigations/phase-2a-review-closeout.md)。实验表、合成边、采样、具体阈值和库不自动成为生产架构。Phase 0 的版本矩阵没有被接受为永久要求；真实测量见 [PERFORMANCE](PERFORMANCE.md)，已完成阶段范围见 [Phase 1A](ROADMAP.md#已完成phase-1a--桌面基础与架构验证)，当前状态以 STATUS 为准。
