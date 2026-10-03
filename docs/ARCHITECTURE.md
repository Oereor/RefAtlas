# 已接受架构与约束

2026-10-03 Phase 1 与 Phase 1A 已关闭，Phase 2A 已评审并关闭；用户明确确认的原始访问、搜索及 UI 本地化原则已进入 ADR-0007–0010。Windows x64 与 macOS arm64 的最小桌面链路和原生 ASAR 目录包均已验证。产品原则见 [PROJECT](PROJECT.md)，决定历史见 [ADR](decisions/README.md)，调查是历史证据而非当前架构规范。Phase 2 production implementation 已 STARTED；首片 Raw Access Foundation 经用户明确授权实现并验证，见 [实现报告](investigations/phase-2-raw-access-foundation.md)。Slice C 已建立 Source Explorer，Slice D 已接入当前 revision 的 Node Browser/Inspector；搜索、契约和 Reload 未实现，A/B/C/D macOS arm64 累计 gate 尚未执行、未豁免。

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

只有 info/reload 显式 acquire；Node 请求绑定已注册 source，release 后返回 SOURCE_CHANGED。解析保留 single queue；directory/info/reload 走并发 2 的 metadata 槽，release/close 直接进入控制屏障。registration token、source-scoped task、同地址控制链及 workspace generation 防止旧任务发布/清理新状态；release 等待 handle finally 后清 metadata/range/cursor，watcher 按明确 source owner 共享。Utility 同步成功 reply 与 acquisition 最终提交，取消的未交付 candidate 回滚。没有公开 lease/ref-count API，仍是单窗口使用范围。

首次 Node 请求按预算完整校验一个 source 后才能发布范围；之后可用 revision-bound range。工作预算为 128 MiB read、800 万 token、深度 128、256 KiB token/window 和 15 秒；4 KiB 块之间让出执行。完整值初始 48 KiB/1,000 Node/深度 8，raw response envelope 64 KiB，foundation 控制限制保持 16 KiB。source/range/cursor 均为有限内存状态，不使用 SQLite 持久化；所有数值保留 lexeme。来源变化失效旧缓存，旧 workspace/revision/cursor 不自动恢复。

这些是已验证工程实现，非永久预算或产品 SLA；完整行为、错误和 edge-case policy 见 [报告](investigations/phase-2-raw-access-foundation.md)。

## 4. 存储与完整搜索

Phase 1 首选 better-sqlite3，SQLite 属于 Data Service，经窄内部存储边界隔离，不引入 ORM。Windows x64 与 macOS arm64 打包后的原生加载与数据库访问是正式必过门槛；macOS x64 已由 [ADR-0005](decisions/ADR-0005-macos-platform-scope.md) 移出支持范围。存在实质问题可复审驱动而不改高层 Query API 语义。本次不设计存储 API。[ADR-0003](decisions/ADR-0003-phase-1-sqlite-driver.md)

搜索先定义确定性行为：Exact 精确标量/未来显式契约 ID，Contains 字面 Unicode 子串，Field 字段名，File 文件/路径，Text 原始来源文本（可能包含数据集自身的多语言内容）。Text 与 APP UI translation 无关；Phase 2 不提供契约 ID resolver。名称不固定 UI/API；FTS/tokenizer 只作加速，不能改变语义，不引入语义分词、embeddings 或 AI 搜索。[ADR-0004](decisions/ADR-0004-deterministic-search-semantics.md)

Search completeness 是正确性要求，latency 是优化问题：完整可搜索范围含 raw scalar、field names、files/relative paths。SQLite 是可重建 cache/index，raw JSON 是 source of truth；可保存来源、NodeAddress/provenance、字段出现、scalar kind、exact lexeme/text、revision 及必要结构 metadata，不等于接受具体 schema。ID-like value、大整数 hash/raw number 不强制存 SQLite INTEGER。

Search coverage ≠ acceleration coverage。Trigram 只为 Contains/Text 的候选，不默认覆盖所有 scalar；启用与文件/语言范围待完整数据集容量和性能测量。未加速、特殊值或未索引来源仍参与 bounded SQLite scan / instr / source streaming fallback。最终 verification 不能补回 candidate omission；完整搜索不能只覆盖索引 preview。

Query/UI 必须能表达 searching/progress/coverage/partial results/cancellation，不能把未完成或失败的覆盖标为全工作区已搜完。回退要有界且可取消；不为 1–2 字符查询提前自研复杂单字/双字倒排索引。具体 planner、匹配选项、schema、分页和 accelerator coverage 未接受。[ADR-0009](decisions/ADR-0009-search-completeness-and-optional-acceleration.md)

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

Controller 保存 current address/summary、已知 parent context、可选 complete RawScalar、selected child、一页 children 或一段 scalar、cursor metadata、局部 pending/error 和 epoch。单执行通道取消旧意图，等待旧请求 settled 后执行最新意图；提交同时验证 source/revision/epoch。readNode 成功先提交 current，随后加载第一页；失败保留旧 current/view。返回当前 Node 取消其他 pending navigation，不重新 read/acquire。workspace/source/revision 切换清空 Node 状态；picker cancel、Explorer refresh 和 locale switch 保持状态。

Container 一律 listNodeChildren，page 上限 RAW_LIMITS.page=100，不遍历 complete container value、不额外 read 每行。Scalar complete number 显示 exact lexeme、string 显示 semantic value；summary string/number 用 readScalarSegment，limit=4096。Previous/Next 替换 payload，最多 128 项 opaque cursor/page metadata，窗口边界提供 Restart；STALE_CURSOR 保留原页并要求 null cursor Restart，不解析 cursor。

SOURCE_CHANGED 标记唯一 session stale，取消其他读取并保留缓存内容；Header/中央/Inspector 显示 stale，Controller 和按钮双重禁止新的结构读取。无 Reload、LOCATION_MISSING、History 或跨 revision 位置恢复。Breadcrumb 使用 splitPointer/joinPointer/parentPointer，显示 decoded raw token，不将 numeric-looking object key 猜为 Index。Inspector 优先 selected child，否则 current，只有已知父 kind 才标 Index；展开状态只在 App UI memory。

表格使用 semantic table 和 roving tabindex，Up/Down/Home/End 选择并移动 focus，Enter/双击进入，Escape 清选择，区域内 Alt+Left 返回父；不引入虚拟化或新表格库。UI message 沿用 Slice B，raw key/value/lexeme/path/Pointer/revision 原样保留。Copy Pointer 真实用户手势在现有 deny-all permission handler 下失败，作为可选功能延期；没有新增 clipboard IPC 或扩大权限。Windows 验收与限制见 [Slice D 报告](investigations/phase-2-source-browser-slice-d-node-browser-inspector.md)。

## 8. 尚未接受或产品验证

- 正式发布配置、CI/release workflow、签名、公证、安装器/DMG、自动更新与发布节奏。工具链路线已接受，但这些发布事项不属于 ADR-0006；具体版本由 package/lockfile 管理并按风险升级验证。
- full search、Dataset Contract 和完整产品 UI/API 尚未实现；新增 raw query primitives 已接入现有进程链路。
- SQLite schema、持久 cache、child index 和更大 scalar streaming 策略仍未实现；当前 RawValue、范围/检测和工程预算见本轮报告。Dataset Contract 仍留在 Phase 3。
- Exact 具体相等规则、BINARY/case/normalization、分页参数，trigram 启用与文件/语言覆盖、完整数据集容量及性能。
- macOS A/B/C/D 新 UI 累计 gate、真实屏幕阅读器和正式签名/公证验证；Windows 当前 revision Node Browser/Inspector gate 见 Slice D 报告。

[Phase 2A 调查](investigations/phase-2a-data-access-architecture.md)保留历史候选与实测；本次接受范围及候选区别见 [评审收尾](investigations/phase-2a-review-closeout.md)。实验表、合成边、采样、具体阈值和库不自动成为生产架构。Phase 0 的版本矩阵没有被接受为永久要求；真实测量见 [PERFORMANCE](PERFORMANCE.md)，已完成阶段范围见 [Phase 1A](ROADMAP.md#已完成phase-1a--桌面基础与架构验证)，当前状态以 STATUS 为准。
