# Phase 2 Source Browser 接入预检调查

调查日期：2026-10-03。性质：只读调查、隔离 spike 与设计建议；**Source Browser 尚未正式实现**。

本文以当前 production、实际目录统计和 Windows x64 隔离实验为证据。标为“建议”的类型、预算、组件和测试均未加入 production。权威状态仍以 [STATUS](../STATUS.md) 为准；本文不修改 ADR、状态或路线图。

## 1. Executive Summary

**结论：已接受的三栏 Source Explorer / Node Browser / Inspector 方案可接入现有架构，没有发现必须突破 ADR 的 implementation blocker。** 中央 Node 浏览和 Inspector 可以复用现有 raw API；需要小幅补齐目录发现和 active source 生命周期。

确定推荐的 production delta：

- `openWorkspace` 返回 Utility 生成的有界 `displayName`，只含 canonical root 的名称。
- 独立 `DirectoryPath`，根为 `""`；新增有界、可取消、分页的 `listDirectory`。
- 新增幂等 `releaseSource`，取消该 source 的任务并释放 metadata、range、cursor 和 watcher 所有权。
- 增加纯 `splitPointer` / `joinPointer` / `parentPointer` helpers。
- 目录发现独立于 parsing queue；将轻量 info metadata 操作移出重型解析队列，同时保留 source/workspace generation 保护。

Zag.js **Recommended with caveats**：Svelte 5、headless 渲染、键盘、ARIA 属性和成熟虚拟列表组合通过隔离实验；原生异步加载的折叠取消语义不满足需求，必须由 Explorer controller 管理加载、取消及 epoch。实测数千行全 DOM 渲染有明显成本，建议第一版 Explorer 使用 Zag + TanStack Svelte Virtual，而中央最多 100 行的 children table 不引入虚拟化。

Paraglide JS **Recommended with caveats**：Renderer-only Vite 集成、生成声明、参数类型、响应式语言切换、持久化、fallback、`file://` 和 Windows x64 ASAR 运行通过实验。必须显式禁用 locale 切换时的 document reload，并通过 Svelte 响应式 locale 驱动文案。Main / Utility 不加载翻译 runtime。

本轮新证据仅为 Windows x64。macOS arm64 Raw Foundation 既有验收见 [原验证报告](phase-2-raw-access-macos-arm64-validation.md)，不能据此声称新增树组件、i18n 或剪贴板行为已经获得 macOS 原生验证。

## 2. Current Architecture Fit

已完整阅读任务指定的 AGENTS、PROJECT、STATUS、ARCHITECTURE、ROADMAP、DEVELOPMENT-PROCESS、ADR-0007～0010、两份 Raw Foundation 报告及 shared/Main/Preload/Utility/Renderer 代码。现有 Renderer 是 Svelte 5 诊断骨架，尚无正式浏览器状态或 localization layer。

| 类别 | 可复用或需要补齐的内容 |
| --- | --- |
| Can reuse | Renderer → typed narrow Preload → Main broker → Utility → RawDataService；原生 workspace picker；受控地址、revision、range、六类 RawValue；完整值/摘要、children/scalar 分页；稳定错误 code；owner、wire ID、service generation、取消控制槽 |
| Needs extension | DirectoryPath、listDirectory、releaseSource、displayName、纯 Pointer helpers；metadata/control 的内部调度与 source 任务归属；Renderer 状态、组件、i18n |
| Should not change | canonical root 只在 Utility 持有；Main 不解析数据；Renderer 不拿绝对路径；number 保留 lexeme；JSON Pointer 定位；revision/range 不进入 identity；外部仓库只读；原有解析和 IPC 预算 |

Directory Entry 与 Active Source 必须保持分离：目录扫描可以发现十余万文件，但不建立 revision、source watcher 或 range，不消耗 `RAW_LIMITS.sources = 256`。只有候选 source 激活进入 raw 生命周期。无须新 Utility Process、Worker Thread、数据库、搜索或 presentation-coupled Node API。

## 3. Real Workspace Directory Measurements

**测量方法**：在相邻 `TurnBasedGameData` 用 Node `opendir` 只读遍历 dirent，不跟随链接，不读 JSON 内容来做目录统计；`.json` 使用区分大小写的后缀匹配。根目录本身不计入子目录总数。该次遍历约 9,556.6 ms；OS 文件系统 cache 冷热未控制，不能称为冷盘 SLA。

| 统计范围 | 子目录 | .json 普通文件 | 其他文件 | 观察到的链接 |
| --- | ---: | ---: | ---: | ---: |
| 全目录，含 .git | 15,229 | 137,916 | 34 | 0 |
| 数据内容，扣除 .git | **15,211** | **137,916** | **1** | **0** |
| .git 子树贡献 | 18 | 0 | 33 | 0 |

这是统计口径区分，不是新产品过滤规则。产品要求展示真实 folder；本建议不擅自加入 `.git` 等目录的特殊隐藏规则。非 JSON 文件全部过滤。真实仓库未发现链接，不能替代 synthetic symlink/junction 安全测试。

Top 20 按直接子项总数降序，同数按路径词法顺序；以下其他文件均为 0。直接子项数量不是递归后代数量。

| # | 目录 | 直接子项 | JSON 文件 | 子目录 | 忽略的其他文件 |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | Config/Level/Mission | 2,845 | 0 | 2,845 | 0 |
| 2 | ExcelOutput | 2,253 | 2,253 | 0 | 0 |
| 3 | Config/LevelOutput/SharedRuntimeGroup/Groups_P10401_F10401001 | 1,323 | 1,323 | 0 | 0 |
| 4 | Config/Level/Tutorial | 1,320 | 1,317 | 3 | 0 |
| 5 | Config/ConfigEntity/NPC/Normal | 1,258 | 1,258 | 0 | 0 |
| 6 | Config/LevelOutput_Baked/Floor | 884 | 884 | 0 | 0 |
| 7 | Config/LevelOutput_Baked/FloorCrossMapBriefInfo | 812 | 812 | 0 | 0 |
| 8 | Config/ConfigAbility/Monster | 761 | 760 | 1 | 0 |
| 9 | Config/LevelOutput/SharedRuntimeGroup | 752 | 0 | 752 | 0 |
| 10 | Config/ConfigAI | 739 | 736 | 3 | 0 |
| 11 | Config/LevelOutput/RuntimeFloor | 698 | 698 | 0 | 0 |
| 12 | Config/AssetPreload/MonsterEffect | 655 | 655 | 0 | 0 |
| 13 | Config/ConfigCharacter/Monster | 589 | 589 | 0 | 0 |
| 14 | Config/LevelOutput/SharedRuntimeGroup/Groups_P10501_F10501001 | 580 | 580 | 0 | 0 |
| 15 | Config/LevelOutput/SharedRuntimeGroup/Groups_P10301_F10301001 | 572 | 572 | 0 | 0 |
| 16 | Story/Discussion/Mission | 557 | 0 | 557 | 0 |
| 17 | Config/Level/GroupGraph/F10401001 | 556 | 556 | 0 | 0 |
| 18 | Config/ConfigAbility/Monster/Camera | 550 | 550 | 0 | 0 |
| 19 | Config/LevelOutput/SharedRuntimeGroup/Groups_P20311_F20311001 | 518 | 518 | 0 | 0 |
| 20 | Config/Level/SubLevelGraph | 516 | 516 | 0 | 0 |

对拟议 DirectoryResult 使用真实名称/相对路径、固定 UUID、完整 `{ok,value}` envelope 序列化，结果如下；这是候选 wire 格式探针，production 还没有 listDirectory。初次枚举与排序分别约 14.9 / 11.6 ms，不含 IPC。

| 目录 | limit | 首页完整 envelope 字节 | 页数 |
| --- | ---: | ---: | ---: |
| ExcelOutput | 100 | 17,864 | 23 |
| ExcelOutput | 200 | 35,496 | 12 |
| ExcelOutput | 500 | **86,248** | 5 |
| Config/Level/Mission | 100 | 7,835 | 29 |
| Config/Level/Mission | 200 | 15,435 | 15 |
| Config/Level/Mission | 500 | 38,237 | 6 |

**建议**：目录 page 默认与上限均为 200，再按实际完整 response 字节缩页，维持 64 KiB envelope。500 在真实 ExcelOutput 已超限，不能仅按 item count 认为安全。长路径和转义字符仍可能让 200 超限；单条也放不下时返回明确资源限制，不截断 name/path。该建议不修改既有 Node children 上限 100。

真正的 UI extreme case 是 2,845 项目录、2,253 项文件目录，以及用户同时展开多个已分页目录。lazy tree 初始只 materialize 已请求的 page，绝非一次渲染 137,916 文件；但不断追加 page 可以轻易达到 5,000～6,000 个可见逻辑行。第 9 节实测支持 Explorer 第一版引入成熟虚拟列表，并继续限制数据 cache；虚拟化不能替代 lazy discovery 或内存边界。

## 4. Directory Discovery Design

**建议接口**（不是已实现代码）：

```ts
type DirectoryPath = string & { readonly __brand: 'DirectoryPath' }
type DirectoryEntry =
  | { kind: 'directory'; name: string; path: DirectoryPath }
  | { kind: 'source'; name: string; source: SourceAddress }
type DirectoryInput = {
  requestId: string
  workspaceId: WorkspaceId
  directory: DirectoryPath
  limit: number // 1..200
  cursor: string | null
}
type DirectoryResult = {
  workspaceId: WorkspaceId
  directory: DirectoryPath
  items: DirectoryEntry[]
  nextCursor: string | null
  truncated: boolean
}
```

保留任务草案格式即可。`truncated` 表示尚有未返回条目，与 nextCursor 一致；预算不足无法建立正确快照时返回 `RESOURCE_LIMIT`，不返回“看似完整”的部分排序结果。空目录成功返回空数组、null cursor、false truncated。不要求 total/childCount：可展开性由 directory kind 表示，不必提前扫描每个目录来满足组件。

**地址与安全**：DirectoryPath 与 `.json` RelativePath 分开验证，根 `""` 是唯一空路径特例，其余拒绝绝对路径、盘符、UNC、反斜杠、冒号、NUL、空组件、`.` 和 `..`。沿用现有地址字节上限 4,096，仍检查完整请求 16 KiB。路径只用 `/`，保留原大小写与 Unicode，不做 normalization/case fold。Windows 路径 join 在 Utility 内完成；macOS 合法但当前受控协议无法表达的冒号/反斜杠名称不能偷偷改名、截断或伪造地址，应明确返回 `ACCESS_DENIED` 或稳定 `RESOURCE_LIMIT` address 标识。

Utility 从 canonical root 逐组件 `lstat`，拒绝 symlink/junction；root `""` 走明确分支。最终 `realpath` containment 使用路径分隔边界而非字符串 prefix，并在枚举前后检查目录身份/stat。目录内容中的链接过滤，不跟随；普通目录和精确 `.json` 普通文件才进入列表，未知 dirent 类型用 lstat 确认，特殊文件过滤。打开一个列出的 source 仍重新做 raw 路径与 stat 验证，不能信任旧目录行绕过安全边界。保留 Raw Foundation 对恶意外部同时保留全部 stat 的非严格快照隔离边界。

**排序**：directories first，组内采用区分大小写、locale-independent 的 UTF-16 code-unit 字符串词法比较（`a < b` / `a > b`）。不调用 localeCompare，不做自然数字排序，不受 UI locale 影响。相同输入名称在 Windows/macOS 得到相同排序；不同平台实际文件名的 normalization/case 特性不会被改写。`.JSON` 不符合当前 `.json` 路径契约，第一版过滤，不另增大小写容错。

**枚举预算建议**：单请求只枚举一个目录，不递归；为全局正确排序，要先收集有界的完整直接子项，cold page 成本是 O(directory size)，不承诺 O(page size)。建议初始扫描最多 20,000 个 dirent（包括被过滤项），单快照 serialized metadata 4 MiB，共享目录快照 cache 8 MiB / 32 个，cursor TTL 60 秒，工作 5 秒，最多 2 个目录任务并行，每 64 项检查取消并让出事件循环。20,000 比实测最大 2,845 留有余量，4 MiB 与 200 项约 35 KiB envelope 有数量级依据；这些是需在 implementation fixture/实测校准的建议值，**不是已验证 RSS 上限或新 SLA**。不得通过无限枚举绕过限制。

**分页与变化**：服务持有不透明 UUID cursor，绑定 workspace generation、DirectoryPath、snapshot ID 和位置。首批枚举前后 directory dev/ino/mtimeNs/ctimeNs 一致才发布快照；每次续页再次检查身份，变化、TTL 到期、淘汰返回 `STALE_CURSOR`，目录消失返回 `NOT_FOUND`。不使用会被读取影响的 atime。旧快照不与新枚举拼接；refresh 清空 page 并从 null cursor 重建。第一版不用目录 push/watch：已显示条目可在手动 refresh 前陈旧，点击时 raw 安全验证仍生效，应在 UI 表达此边界。

**队列与取消**：目录 metadata task 位于同一 Utility 的独立小并发槽，不排在 JSON parsing queue。复用 broker owner/wire ID/cancel slot；dir handle 在 finally 关闭。workspace close/reopen 先提升 generation、abort active/queued metadata task，再清 cache/cursor、关闭句柄；旧任务不得发布结果，新 workspace ID 不能接续旧 cursor。无需复杂 scheduler 或新增进程。

Preload、Main、Utility 校验 exact shape、UUID、DirectoryPath、limit、cursor 和请求 bytes；Main 按操作校验响应 workspace/directory、entry kind/name/path/source 对应关系、目录/file 顺序、nextCursor/truncated 和实际 envelope bytes。拒绝多余键及任意绝对路径，沿用 `{ok,value}` / `{ok,error:{code,details?}}`，不传原始异常。

## 5. Active Source Lifecycle

**现有事实**：RawDataService 用 Map 保存 known sources、range、cursor，目录 watcher 按 dirname 共享；reset 清所有 watcher。当前请求任务没有足够的 source 归属来完成 targeted release。info 也经过单解析队列，在 source 注册后才走后续 budget/cancellation 检查。

**复现**：隔离探针加载未修改的 production TypeScript，仅在测试调用边界让 signal 在 `source()` 注册完成后立即 abort。返回 `CANCELLED`，随后 info 复用同一 revision，known sources 为 1。取消不是 metadata rollback；快速取消候选可能逐渐耗尽 256 上限。该测试 timing hook 不代表生产用户操作总会触发，但证明 race 确实存在。

**推荐 releaseSource 语义**：

```ts
releaseSource({ requestId, source }): Promise<RawResult<{ released: boolean }>>
```

unknown source 返回 false，已知 current/stale source 返回 true；重复释放返回 false。workspace 不匹配/已关闭仍按既有 `WORKSPACE_NOT_OPEN`，不要把错误 workspace 当 unknown source。无须 expectedRevision：目标是释放地址下当前注册状态，不读取 Node。

确定清理顺序：

1. 标记该 source registration generation 为 retiring，阻止新的发布和隐式注册。
2. abort 其 active 和 queued parsing/metadata 请求；排队任务移除，运行任务经已有检查退出，等待句柄 finally 关闭。
3. 删除该 registration 的 metadata、revision-bound range 和 cursor，准确更新 cache bytes。
4. 从目录 watcher ownership Set 移除此 source；Set 空才关闭 watcher。完成后才 resolve release。

采用取消加完成屏障，不拒绝 release，不等待扫描自然结束。超时/owner 销毁仍必须最终清理，generation guard 防止已失去调用者的旧任务重新 publish。每个 task 记录 SourceAddress/registration generation；range entry 增加内部 SourceKey/index，避免靠容易含混的字符串前缀删缓存。同目录 A/B 的 watcher 保留到最后 owner 释放；reload 不重复增加引用，stale 仍可释放，workspace reset 是全体更强的取消/清理。

还有一项必要防护：当前 Node 操作会经过可注册的 source lookup。release 后旧 queued read 不得重新注册。建议 info/reload 作为显式 acquire 路径，Node 操作只查已有 registration；旧 expectedRevision 返回 `SOURCE_CHANGED` 或被取消，不创建新 known source。执行完成前同时检查 workspace 和 registration generation。

**切换协议**：active A 在候选 B 的 info + root read 成功前继续显示；B 成功后原子切换，随后 release A。失败、取消或过期 B 在所有相关 promise settled 后 cleanup。source 可能已注册，即使 UI 未拿到 info 成功也要 release 候选地址。

同一 SourceAddress 的旧 cleanup 不能释放新会话：第一版 single-window/single-active controller 使用 per-source acquire/cleanup barrier，新 acquire 等旧 release 完成；active A 再点击 A 则取消 pending B 并复用 A，不另起同地址 acquire。仅凭 Renderer epoch 过滤 release 响应不能防止 Utility 已执行删除。source-only release 对同地址多个独立 owner 本身不区分租约，因此不可宣称支持未来多 tabs/多窗口共享；本轮范围无需 public lease API。

正常稳定 active 约 1，切换允许短暂 A+B。A/B/C/D 快速点击仍有 bounded in-flight cleanup，不承诺任何瞬间绝对不超过 2；barrier、取消及 generation 保证最终回落，不用提高 source 上限掩盖泄漏。

## 6. Source Change Strategy

**测量**：未扫描时 30 次 AvatarConfig getSourceInfo，中位 0.744 ms，p95 1.078 ms，最大 1.257 ms，不含 IPC；没有 parser/hash 工作。前一轮约 0.32 ms 的采样不能当稳定指标，本轮报告以新样本为准。info 返回 metadata/state，不等于 JSON 已验证；`validated:false` 是尚未语法验证，不是坏文件。

但 cold TextMap scan 与另一个 source 的 info 并行：scan summary 约 8,747.4 ms，info 约 **8,737.2 ms**。观察解析工作 52,399,649 bytes / 1,896,773 tokens，说明昂贵的是 queue 等待。扫描前后 Avatar/TextMap 的 hash、size、mtime/ctime 相同，watch callback 与 invalidation 均为 0。

**推荐**：第一版保留 info polling + request-time error，不增加 Main→Renderer raw push IPC；实现时把 info path/stat 操作从 parser queue 移出。用 per-source registration/control generation、有限 metadata 槽和最终状态复查协调 reload/release，不让并行 info 在 reset 后重注册。解析仍为单任务，不改 parser adapter。

active source 約 1 秒级检查，使用上一轮 settled 后 setTimeout，禁止重叠；页面隐藏/窗口不可见时暂停，恢复立即检查。visibilitychange 与窗口 minimize 的实际 production 行为需 smoke；如平台不报告 visibility，再用窄 presentation visibility 信号补齐，不能扩成 source-change push。poll 也可被 node/session 切换取消。

遇到 info `state:'stale'`、revision 与 active 不同，或任一 Node 请求 `SOURCE_CHANGED`，立即标 stale，冻结旧分页与 revision 对应选择。已知删除的 source 可能先返回旧 revision + stale，reload 再返回 NOT_FOUND；未知文件初次 info 的 NOT_FOUND 是打开失败。service exit 清 workspace/session，不重放请求。reload 建立新 revision 后在同一 Pointer 重新定位；Pointer 不存在进入 LOCATION_MISSING，文件不存在另行表达。

旧计划中未带诊断的并行探针曾得到 SOURCE_CHANGED；随后单扫描成功，本轮带诊断并行也成功。旧错误的具体原因 **not verified**，没有证据归咎 watcher、文件修改或 parser；旧失败不算成功性能证据。本轮检查未复现，可保留为 implementation integration 观察项。

## 7. Renderer State Model

| 状态域 | 保存内容 | 生命周期边界 |
| --- | --- | --- |
| Workspace | closed/opening/open/error；workspaceId/displayName；workspace epoch | native picker cancelled 恢复原状态；成功切换清下属状态；服务退出清 ID |
| Explorer | 每 DirectoryPath 的 unloaded/loading/ready/error、entries、nextCursor、expanded、requestId、directory epoch | collapse abort；ready cache 可复用；refresh 重建 epoch；追加 page 验证 workspace/dir/request；workspace 切换全清 |
| SourceSession | activeSession + pendingActivation；EMPTY/OPENING/READY/STALE/RELOADING/LOCATION_MISSING；地址、revision、info、activation epoch | A 保持至 B 成功；obsolete 候选 cancel + settled cleanup；同地址 acquire/release barrier |
| NodeBrowser | current NodeAddress、revision、summary；children 或 scalar page、selection、request cursor history、nextCursor、node epoch | navigate/reload 清分页；late 响应不得覆盖新 Pointer；revision 变化清旧 cursor/selection |

controller 管理异步与清理，组件只读 state 并发出意图。避免一个 giant global store；大 page 可用 `$state.raw` 与不可变替换，directory record 使用合适响应式 collection，不深度代理整个数据仓库。

必须同时有 transport cancel 和 Renderer guard。现有 broker 的 wire ID、owner、服务 generation 防止错误请求配对；它不知道“现在 active B”或“目录已 collapse”。所有更新检查 workspace epoch + activation/node/directory epoch + requestId；finally 清 loading 也检查归属，防止旧 finally 清掉新任务。

collapse 将 loading 请求 abort、提升 directory epoch；空目录设置 ready，不能因为 entries.length=0 被当 unloaded。error 有独立重试；page append 保留 stable IDs、焦点与 selection。目录 cache 建议初始 10,000 entry / serialized metadata 8 MiB，collapsed LRU 优先淘汰，不静默淘汰展开中的 active branch；无法容纳时明确限制。该 Renderer cache 数值是 implementation 候选，尚未测量硬内存上限。虚拟列表只限制 DOM，不限制 collection 对象。

Previous/Next 使用服务的 opaque cursor：保存**发起该页的 cursor**（第一页 null）和小规模 page cache；Previous 可重发已保存请求 cursor。缓存有界且不成为产品 history 功能。STALE_CURSOR 提示并回到当前 Node 第一页，不猜位置重建假 cursor；跨 revision 无法接续旧 page。

## 8. Node Browser API Completeness

| 产品能力 | 现有 API / 本地逻辑 | 判断及必要边界 |
| --- | --- | --- |
| Source header | SourceInfo + SourceAddress + displayName | 足够；file name 从相对路径取 leaf；validated/state 区分 |
| Breadcrumb/ancestor | 纯 Pointer helpers，点击后 readNode | 足够，不增加 getBreadcrumb |
| Object children | readNode + listNodeChildren | 源顺序、有序 key、summary、ordinal；不 JS object 覆盖重复键 |
| Array children | 同上 | key/ordinal 提供 index；不从 numeric object key 推断数组 |
| Boolean/null | complete RawValue | 足够，显示原类型 |
| String/number | complete value 或 readScalarSegment | number 展示 lexeme；string 片段保留合法 surrogate pair |
| Huge scalar | summary / segment 或 RESOURCE_LIMIT | segment 不是突破 256 KiB token/scalar 上限的任意流接口；超预算明确显示限制，不承诺完整浏览 |
| Pagination | children/segment nextCursor + Renderer request-cursor history | 足够；空页、最后一页、stale cursor 需表现 |
| Selection | Renderer stable child identity | selection 与 activate/navigation 分离 |
| Inspector | NodeSummary + SourceInfo + selected ChildrenResult item | 足够；range 为 null 可表达未知；childCount null 显示未知 |
| Stale | info state/revision + SOURCE_CHANGED | 足够；轻量 info 不应卡 parser queue |
| Reload | reloadSource → 新 revision → 同 Pointer readNode | 足够；旧 range/cursor 不迁移 |
| Location missing | readNode NOT_FOUND + 当前 source/reload 状态 | 足够；区分 Pointer missing 与 source 文件 missing |

Inspector Key/Index 从导航的 child item 保存。根 Node 没有 key/index；直接指定任意深层 Pointer 时仅能得 token 字符串，不知道父容器类型，应先显示 key/token，不凭数字猜 index；父级已知是 array 时才显示 index。Type/Pointer/Children 用 NodeSummary；File/Path/Revision/Status 用 SourceInfo/address；没有 Inspector-specific API 缺口。

Pointer helpers 推荐放 shared raw 边界：先现有 validation；root split 为 `[]`，`/` split 为 `['']`；decode 按 `~1` 后 `~0`，join 用既有 escapePointer，保留 Unicode 与 numeric-looking string；parent(root) 为 null，parent(`/x`) 为 root `""`。不将 Pointer 转路径，不把数字 token number 化，不容错 malformed `~`。join 同样受地址预算验证。

中央 children 上限已经是 100，不加载完整对象用于 table，也不需要 TanStack Table/Virtual。完整值超过 48 KiB / 1,000 Node / 深度 8 就显示 summary；未知 count/preview 和 truncated 必须可观察。数据、key、Pointer 用文本节点，禁止插入 raw HTML。

## 9. Tree View Spike

### 9.1 版本与实验环境

通过已验证的 7890 HTTP 代理查询官方 registry、官方文档及源码。截至调查日，`@zag-js/tree-view` / `@zag-js/svelte` 最新均 **1.44.0，MIT**，2026-09-13 发布；Svelte adapter peer 为 `>=5`。tree-view 依赖同版 core/types/utils/anatomy/dom-query/collection，Svelte adapter 依赖 core/types/utils。维护近期有发布是事实，不是长期 SLA。[官方 Tree View 文档](https://zagjs.com/components/tree-view)、[官方 Svelte usage](https://github.com/chakra-ui/zag/blob/main/website/data/snippets/svelte/tree-view/usage.mdx)、[固定版本 registry](https://registry.npmjs.org/@zag-js/tree-view/1.44.0)。

临时 package 固定 Svelte 5.57.1、Vite 7.3.6、Svelte Vite plugin 6.2.4、TypeScript 6.0.3，Electron 44.5.1 / Node 24.21.0，复用应用 electron-vite 5.0.0 / electron-builder 26.15.3。未改 production dependency graph。UI 是 synthetic directory tree，custom folder/file 标识、loading/error/retry 行和临时 Inspector；不是实际 Source Browser 产品。

### 9.2 可观察行为

| 场景 | 隔离实验结果 |
| --- | --- |
| Svelte 5 headless integration/custom render | 通过 useMachine/connect/normalizeProps、collection 和 Svelte 响应式更新；图标与状态由调用方渲染 |
| 未知 child count / 空目录 | directory branch hint 可表示未知；加载空数组后缓存 ready，再展开不重复加载 |
| 原生 lazy error/retry | 错误可显示，再次加载成功 |
| 原生加载中 collapse | **不符合需求**：signal 未 abort；迟到成功后 branch 再次 expanded |
| Managed adapter collapse | 自有 AbortController + directory epoch；折叠取消，迟到结果不展开；重新展开成功 |
| 分页追加 200 → 400 | stable ID 保持 selection/focus；不会把选择自动当导航 |
| Keyboard | 实际 Electron sendInputEvent 的 Down/Home/End/Space 通过；虚拟分支 Left 折叠、Right 展开/进入 child 通过 |
| ARIA | tree/treeitem、selected、level；虚拟集合 pos/set size 属性可观察；真实屏幕阅读器 **not verified** |
| Electron runtime | file URL、sandbox/contextIsolation、nodeIntegration=false，Renderer 无 require；最终通过运行 console errors 为空 |

Zag 接收 AbortSignal 不等于“折叠会取消调用方请求”。不要把原生 loadChildren 作为 Explorer source of truth。推荐 controller 独立保存 loaded/error/cursor/epoch，受控 expanded/selected，由 Zag 承担键盘和属性。`childrenCount:0` 在 spike 只作为本地“这是 branch”提示，不是实际目录 count；不能传到 Inspector 冒充数量。已空目录必须单独 ready。

opaque UI ID 与真实 DirectoryPath/SourceAddress 分开。不要把 Zag valuePath `join('/')` 当物理路径；node payload 保存真实地址。批量受控 expansion 用一次更新并等待 Svelte tick，避免 reset 与连续 expand 同一时刻丢更新。

### 9.3 渲染与交互测量

方法：构造 synthetic 同长度行，reset 后完成 Svelte tick + frame 计时；统计 tree 容器 DOM，键盘延迟记录 Renderer key event → 下一 frame。父 runner 的 40 ms 等待不算交互延迟。每档一次观测，未做 percentile/冷启动控制，不是 SLA。

| 可见逻辑行 | 全 DOM treeitem | DOM elements | 直接 Vite render ms | 实际 electron-vite render ms | electron-vite End → frame ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 100 | 224 | 3.0 | 5.6 | 2.6 |
| 200 | 200 | 424 | 10.5 | 9.9 | 4.0 |
| 500 | 500 | 1,024 | 22.3 | 26.3 | 8.2 |
| 2,845 | 2,845 | 5,714 | 143.8 | 173.6 | 34.3 |
| 5,000 | 5,000 | 10,024 | 161.7 | 176.0 | 67.4 |
| 6 个展开分支，各 1,000 child（含分支共 6,006） | 6,006 | 12,054 | 507.1 | 624.8 | 未测 |

同一 electron-vite 运行中 Renderer working set 从 100 行约 127,540 KiB 到 5,000 行约 263,140 KiB，private bytes 从 73,880 到 209,240 KiB。它包括 Chromium、此前测试与分配残留，不能解释为单个树对象占用；performance.memory 返回缓存式粗粒度值，没有用于硬 heap 预算。

**成熟虚拟化组合实测**：`@tanstack/svelte-virtual@3.13.39`（MIT；virtual-core 3.17.11；peer 支持 Svelte 5），结合 Zag public `getVisibleNodes` / `scrollToIndexFn`，固定行高 24、overscan 5，不自研虚拟列表。[官方 Svelte adapter](https://tanstack.com/virtual/latest/docs/framework/svelte/svelte-virtual)、[固定版本 registry](https://registry.npmjs.org/@tanstack/svelte-virtual/3.13.39)。

| 逻辑行 | 挂载 treeitem / DOM elements | 直接 Vite render ms | electron-vite render ms | electron-vite End → frame ms |
| ---: | --- | ---: | ---: | ---: |
| 200 | 25 / 100 | 18.3 | 23.0 | 6.6 |
| 2,845 | 25 / 100 | 8.6 | 9.9 | 7.0 |
| 5,000 | 25 / 100 | 9.8 | 9.8 | 8.8 |
| 6,006 / 6 分支 | 25 / 101 | 35.7 | 50.9 | 未测 |

End 滚动至末项并保留焦点，虚拟分支 Left/Right 改变逻辑集合并导航通过。未知完整 children 数量不能通过已加载 page 的 setsize 冒充完整目录计数，正式实现需处理 ARIA 的未知 total；屏幕阅读器是后续验收项。横向长文件名、不同字体/缩放及动态 row height **not verified**，第一版固定行高截视觉文本但保留真实地址/tooltip。

Windows x64 隔离 ASAR 包重复关键场景：5,000 行未虚拟化 render 168.0 ms / End 74.2 ms，6 分支 render 590.1 ms；managed cancellation、locale 等行为通过，console errors 为空。不是正式 RefAtlas Source Browser packaged smoke。

### 9.4 Bundle 和替代候选

同 Svelte/Vite minified 单入口对比，未 gzip 输入、gzip 输出分别如下；不同导入/markup 会影响 tree shaking，只能说明数量级。

| build | JS bytes | gzip bytes | 相对 Svelte baseline JS / gzip delta |
| --- | ---: | ---: | --- |
| Svelte baseline | 26,517 | 10,354 | — |
| baseline + Paraglide messages | 29,239 | 11,472 | 2,722 / 1,118 |
| baseline + Zag tree | 84,374 | 27,999 | 57,857 / 17,645 |
| baseline + Svelte Virtual | 59,573 | 20,615 | 33,056 / 10,261 |

完整临时 demo 不含 virtual 的 minified JS 103.58 kB / gzip 35.25 kB；加 virtual 后 133.93 / 44.19 kB，CSS 0.98 kB。实际 electron-vite 默认未 minify 的 Renderer JS 325.70 kB、CSS 1.10 kB，不与 minified 数值直接比较。初次 isolated install 76 个 package，virtual 增加 2 个；这是工具/compiler/transitive 总量，不是全部 production runtime。

| 候选 | 官方对照 | 本轮判断 |
| --- | --- | --- |
| Carbon Components Svelte 0.113.0 | Apache-2.0，2026-10-02 发布；runtime deps flatpickr 与 IBM telemetry；官方 TreeView 源码有 hasChildren lazy hint 和 virtualize 选项；设计系统/CSS 比 headless 更强约束 | 不是无虚拟化；但固定版本 Svelte 5、取消、键盘与性能 **not verified**，没有证据优于已验证组合，不切换 |
| KeenMate 4.8.0 | MIT，2026-03-02 发布，Svelte ^5 peer，无 declared runtime deps；README 有 virtualScroll、固定 row/overscan、progressive flat、LTree/search/edit/drag 等功能 | “50k+”是作者声明，**not verified**；LTree 与真实地址要再适配，功能面更大，本轮不做第三个完整 demo |

依据：[Carbon 官方 TreeView](https://github.com/carbon-design-system/carbon-components-svelte/blob/master/src/TreeView/TreeView.svelte)、[Carbon registry](https://registry.npmjs.org/carbon-components-svelte/0.113.0)、[KeenMate 官方 README（prod 分支）](https://github.com/Keenmate/svelte-treeview/blob/prod/README.md)、[KeenMate registry](https://registry.npmjs.org/@keenmate/svelte-treeview/4.8.0)。官方 branch 文档可能晚于发布版本，不能替代固定版本 runtime 验证。

**最终推荐**：Zag + managed Explorer controller + TanStack Svelte Virtual，Recommended with caveats。lazy tree 限制发现范围，虚拟化限制可见 DOM，两者共同工作；不建设自有通用 tree engine/virtual-list，也不因需要虚拟化就更换尚未实测的库。

## 10. Localization Spike

`@inlang/paraglide-js@2.25.4`，MIT，2026-09-17 发布；官方 peer Vite >=5 / TypeScript >=5.6。compiler 包有 SDK、unplugin、valibot、jiti 等构建依赖；它们不应成为 Utility runtime。[官方 basics](https://paraglidejs.com/basics)、[strategy](https://paraglidejs.com/strategy)、[compiling messages](https://paraglidejs.com/compiling-messages)、[固定版本 registry](https://registry.npmjs.org/@inlang/paraglide-js/2.25.4)。

**最小集成建议**：production 将 compiler 作为 devDependency，electron-vite **renderer** plugins 加 Paraglide 与 Svelte；Main/Preload/Utility 不导入 generated messages/runtime。`project.inlang/settings.json` 与 `messages/en.json` / `zh-CN.json` 为受控 source of truth；message-format 插件 URL 固定 4.4.0，构建首次下载也必须走显式代理。generated messages/runtime/declarations 忽略、不手改、不批量格式化；新 checkout 在 typecheck 前先 compile，启用 `emitTsDeclarations:true`。不要采用当前 Vite 8 实验选项改动本项目 Vite 7，亦不引入 server middleware、URL/cookie routing。

| 检查项 | 结果及范围 |
| --- | --- |
| Svelte/Vite、实际 electron-vite | 临时 renderer-only plugin 构建通过；生产原配置未改；spike 无 Preload entry 的 warning 是临时配置差异 |
| Generated types | 声明生成成功；tsc 对合法调用通过，@ts-expect-error 的缺 greeting name、非法 locale fr、不存在 message 均被正确消耗 |
| TypeScript 6 CLI | 初始 inherited tsconfig 触发 TS5112；明确 `--ignoreConfig` 后独立类型 probe 通过，未改生产 tsconfig |
| Runtime switch | en ↔ zh-CN 文案响应式改变，html lang、stored locale 与 runtime 一致，不 document reload |
| Persistence / initial mapping | file URL reload 后保留 zh-CN；有效 stored en 优先；无有效存储时 zh-Hans-CN → zh-CN、其他 → en；非法存储 fallback en |
| Missing translation | zh-CN 缺失的测试 message 使用 en base locale fallback |
| Raw boundary | key AvatarID、string Ice、number lexeme 1.00、path、Pointer、孤立 UTF-16 surrogate D800 不变 |
| Session continuity | 切换保留临时 opaque session/revision/token；**这是 symbolic state，不是正式 RawBridge SourceSession end-to-end** |
| Security / packaging | sandboxed file Renderer 和 Windows x64 ASAR passed；包中是编译后的 messages，不含 SDK node_modules |

语言切换用 `setLocale(locale,{reload:false})`，并把 reactive locale 显式传给 message functions；不能只改变 Paraglide 全局变量期待 Svelte 自动重新求值。同步 html lang/dir、title、tooltip、ARIA label、共享 presentation formatter，保留 source/node controller，不 remount 会话。功能测试用稳定 state/code/role；仅 localization 专项断言翻译文本。

初始语言必须尊重用户持久化选择，其次系统语言。本轮 Windows Main `app.getSystemLocale()`/getLocale 为 en-US，Renderer navigator.languages 为 `[en-US, zh-Hans-CN]`，第一项一致；其他平台映射 **not verified**。推荐 Main 在 bootstrapping 时只给 Preload 一个规范化的 initial UI locale（如可信 additionalArguments），源为 app.getSystemLocale；这是窄 presentation 值，不是 raw command 或 Utility 翻译 runtime。UI 取有效 localStorage choice 优先，系统 locale 的 zh 前缀映射 zh-CN，其余 en，locale 不进入 NodeAddress/协议。

ASAR 内容检查仅 7 条目录/文件记录：dist/assets/CSS/JS、dist/index.html、electron.cjs、package.json；无 SDK/node_modules。electron-builder Windows x64 `--dir --publish never`，使用现有 Electron dist、禁用 npm rebuild/签名编辑；验证 app.isPackaged=true。未制作 installer、签名或发布，macOS 新 UI package **not verified**。

**最终判断：Recommended with caveats**。必须落实 renderer-only compiler、显式 reactive switch 与 no-reload、系统 locale 窄 bootstrap、generated 声明先于 typecheck、离线/代理构建可复现。保持 ADR-0010 UI-only 边界，internal code 不翻译，Renderer 将 code + 有界 limit 参数映射为消息。

## 11. Proposed Production API Delta

| Existing | 本轮建议 |
| --- | --- |
| openWorkspace | opened 分支增加 displayName，其余 native picker/cancelled 行为不变 |
| closeWorkspace | 将 directory snapshot/tasks 一并纳入 generation reset |
| getSourceInfo | 保留 API，轻量 metadata 不经过解析长队列 |
| reloadSource | 保留 API，协调 registration generation/control barrier |
| readNode / listNodeChildren / readScalarSegment | 保留 API、expectedRevision、预算；release 后不隐式注册 source |
| cancelRequest | 保留 API，覆盖目录、metadata 和 release 相关排队/运行任务 |

新增仅 `listDirectory`、`releaseSource` 与纯 Pointer helpers。独立 DirectoryPath/DirectoryResult 类型、新 command/output validators 与 Main broker 操作分派同步扩展。请求 16 KiB、响应 64 KiB；新 metadata 不能走 unrestricted filesystem bridge。

displayName 由持 canonical root 的 Utility 取 basename，而非 Renderer 请求/自行解析绝对路径。保留真实 root leaf，检查有界 UTF-8/序列化长度；不要返回 drive/root path。根 `/` 或 drive-root 没有普通 leaf 时返回 `""`，Renderer 显示本地化 generic workspace label，不由 Utility 翻译。Main 仍只转交用户原生选择结果。

**Copy Pointer 调查与决定**：当前 sandbox file Renderer 的 isSecureContext=true、writeText 可用，权限 query 为 granted；即使 Main 有 permission-request deny handler，也不能据此推导 Web Clipboard 写入一定被阻止。本轮没有写入用户剪贴板，实际 user-gesture write **not verified**。推荐第一版按钮使用 Renderer `navigator.clipboard.writeText(validPointer)`，await 并显示失败 code 对应 UI；将实际 gesture 写入纳入受控 smoke。若某正式支持平台验证失败，再加只写 Pointer 的窄 Preload/Main presentation bridge（校验 Pointer/bytes/owner），不开放 readClipboard 或任意 IPC，不放 RawDataService。此验证项不要求本轮碰用户剪贴板，也不扩大 raw delta。

## 12. Proposed Component / State Structure

推荐如下组织，名称不构成新架构约束：

```text
renderer/src/
  App.svelte                     # 启动、controller 装配
  components/AppShell.svelte      # 三栏 CSS grid
  components/WorkspaceToolbar.svelte
  explorer/SourceExplorer.svelte  # 树、加载/重试/更多
  explorer/SourceTreeItem.svelte  # 仅 row 呈现
  explorer/explorer-controller.svelte.ts
  browser/NodeBrowser.svelte
  browser/SourceHeader.svelte
  browser/Breadcrumb.svelte
  browser/ChildrenTable.svelte
  browser/ScalarValueView.svelte
  browser/StaleBanner.svelte
  browser/Inspector.svelte
  state/workspace-controller.svelte.ts
  state/source-session.svelte.ts
  state/node-browser.svelte.ts
  i18n/                          # locale 状态与 presentation formatters
```

共享较小 header/banner 可以保持局部组件，不按每个标签创建文件。CSS grid、min-width:0、局部 overflow、固定 tree row height、keyboard focus/disabled/loading 状态即可，无须完整设计系统或 split-pane library。长地址视觉省略与真实文本/tooltip 分开，显示不能变更 identity。Zag 与 virtualizer 的 DOM props adapter 放 Explorer 内；中央 table 用普通 semantic table。Inspector 仅组合已有模型，业务 controller 不依赖翻译文本。

## 13. Test Plan

以下是正式 implementation 的高价值测试建议，本轮未添加 production tests。遵循 [Test Policy](../../AGENTS.md)，不按数量或私有调用次数分配测试。

| 层次 | 关键可观察行为 |
| --- | --- |
| Unit | DirectoryPath root/nested/非法组件/bytes；Pointer root、空 key、~0/~1、Unicode、numeric object key；确定排序不随 locale 改变；exact input/output 与 envelope bytes |
| Service/integration | JSON-only regular entries、root/nested/空目录、symlink/junction/路径替换拒绝；冷枚举/快照页一致；变化/TTL/淘汰 stale cursor；取消关闭句柄、close/reopen 不发布；长 key/path 缩页及单项超限 |
| Source lifecycle integration | A→B/失败保持 A；重复/stale/unknown release；同目录 watcher ownership；active/queued cancel；注册后 abort cleanup；同地址旧 cleanup 不释放新会话；反复切换 known source 不增长至上限 |
| Renderer/component | A/B/C/D 迟到响应/旧 finally 不覆盖；collapse/reopen/refresh/page append；selection != navigation；STALE 冻结、reload 同 Pointer、missing Pointer；children/scalar Previous/Next 与 STALE_CURSOR reset |
| Electron smoke | native picker cancelled、displayName 无 root 泄漏；完整 Renderer bridge directory→activate→Node→Inspector；metadata 不被 scan 阻塞；窗口销毁/服务重启；实际 keyboard/focus/ARIA、virtual scrolling、Pointer clipboard gesture；dev/built/packaged |
| Real-data gate | 只读 ExcelOutput、Config/Level/Mission 和混合目录 page/bytes；AvatarConfig、EquipmentConfig、AvatarSkillConfig、TextMapCHS、已知 Floor/SoundBank 选定操作，记录耗时/读量/response，不再无目的全仓 JSON scan |
| Localization-specific | zh-CN/en、参数类型与 fallback、持久化/system bootstrap、html lang、no-reload 会话、formatter、raw boundary；生成前 typecheck、file/package 无 compiler runtime |

目录变化、source 修改/删除/替换、range/revision 必须用应用临时目录 writable fixture，绝不改真实数据仓库。普通测试离线；第三方的通用内部行为不复制成大量单测，只保留已发现 collapse/release race 对产品行为的 regression。正式 supported-platform packaged smoke 包括 Windows x64 和 macOS arm64；本轮 Windows spike 不能替代这些集成验收。

## 14. Risks / Open Questions

无需用户再决定排序、page size、poll-vs-push 或是否增加 Inspector API：本文已有确定工程建议。没有发现需推翻已接受架构的冲突。以下是 implementation 验证/技术风险，并非把工程工作重新交给用户选择：

- 目录 20k/4 MiB/5 s 与 Renderer cache 预算是候选值，真实最大目录和 synthetic fixture 要验证；网络盘/权限错误/极端长路径尚未测量，不能宣称全 filesystem 覆盖。
- Zag 原生 lazy collapse 不合需求；managed controller 和 generation 是采用条件。真实屏幕阅读器、macOS 新 UI、缩放/长行、未知全目录 ARIA count 为 **not verified**。
- Paraglide no-reload 与 reactive message 调用必须显式；generated compile 和插件下载需构建可复现，不允许系统代理失效后直连。
- 当前 info queue 延迟与注册后取消残留是必须在 slice A 修正的现有缺口；不能只依赖 broker 或提高 source 上限。
- 旧 SOURCE_CHANGED 探针原因未确定；新有诊断成功不足以倒推原因，应保留 bounded integration 观察。
- 目录 snapshot/stat 不是恶意外部严格隔离；poll 的隐藏/恢复和 Web Clipboard gesture 还需实际产品进程验证。
- 当前 single-active source-only release 不能直接扩展到未来多 owner tabs/windows；超出本轮范围时再评审 lease ownership。

以上不阻止按建议进入正式实现；若后续实测需要突破 ADR、取消词法保真、自研完整 parser 或显著扩大范围，应停止该方向报告。正式 adoption 仍需本报告评审，本轮没有安装库到 production。

## 15. Recommended Implementation Slices

| Slice | 内容与结束条件 |
| --- | --- |
| A. Directory + lifecycle | shared/contracts/IPC validators；displayName、listDirectory、source-scoped release、metadata 与 parser 调度分离；目录安全/预算/cursor、取消注册与 watcher race integration 通过 |
| B. Localization foundation | Renderer-only Paraglide、catalog/generated/compile 顺序、locale bootstrap/persistence、no-reload reactive formatter；type/file/package/raw boundary 验证 |
| C. Source Explorer shell | 三栏 shell、Workspace/Explorer controller、Zag managed tree + mature virtualization、目录 lazy/page/retry/cancel；选择与激活分离 |
| D. Node Browser + Inspector | SourceSession 原子切换/barrier、root/任意 Pointer、breadcrumbs、children/scalar 页、Inspector、copy；复用既有 raw APIs |
| E. Change + integration | poll/stale/reload/missing/服务退出；race/real-data gates；dev、built、Windows x64/macOS arm64 packaged 与 accessibility 验证，随实现同步权威文档 |

依赖顺序 A→B→C→D→E。可以保持每个变更可评审，但不能把某个 slice 完成宣称整个 Source Browser 完成。**本轮到报告为止，不自动开始任何 slice。**

## 16. Validation / Cleanup

### 16.1 执行与证据范围

公网前确认系统 7890 listener 和 HTTP 协议，单次 `curl.exe --proxy http://127.0.0.1:7890` 检查成功；npm install 显式 `--proxy`，SDK/compiler 构建环境显式 HTTP_PROXY/HTTPS_PROXY + NODE_USE_ENV_PROXY，localhost/127.0.0.1 bypass。未改 npm/git/user/system 全局配置，无 direct fallback。官方 registry 版本/license/依赖与文档通过该代理抓取；未远程写入。

主要命令/方法（均在隔离路径执行；下面是复现入口说明，不是让已清理路径重新运行）：

```text
git -c safe.directory=<app> status --short / rev-parse HEAD
git -c safe.directory=<data> -C ../TurnBasedGameData status --short / rev-parse HEAD
node artifacts/source-browser-preflight/local-probes.cjs
npm install --proxy http://127.0.0.1:7890 --cache ../../.npm-cache
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit
  --target ES2022 --module ESNext --moduleResolution Bundler
  --skipLibCheck typecheck.ts
Vite build / bundle-probes.mjs
electron-vite build --config <isolated config>
node artifacts/source-browser-preflight/run-electron.cjs
electron-builder --dir --win --x64 --publish never --config <isolated config>
npm run docs:check
npm run format:check
git diff --check
```

production TypeScript 只在 Node 内存 transpile/执行，无源文件写入。raw parser probe只读 Avatar/TextMap，不重新全扫描数据 JSON；全目录 traversal 只读取 metadata。树/i18n spike 使用 synthetic data 和单独 userData；临时 Electron 可见窗口实际接受 keyboard input，runner 有 100 s deadline、应用有 90 s deadline并 finally 清理。实验不包含真实产品 Source Browser 的完整 raw IPC flow。

忽略目录 `artifacts/source-browser-preflight` 留本地 measurement JSON / screenshot：local-measurements、official-packages、bundle-measurements、electron-spike、electron-vite-spike、packaged-spike、presentation-probe、package-contents 及 cleanup evidence。它们不是 tracked/permanent delivery，也不是运行测试依赖；核心事实已收录本文。临时 package/lock/node_modules、源码、generated、dist/ASAR、fixture、userData 和 runner 在收尾删除。复现时按本文固定版本与行为重新建立 isolated package，不恢复到生产依赖。

实验中的失败与边界也保留在判断中：

| 诊断问题 | 处理与证据解释 |
| --- | --- |
| GUI exe shell 返回 0 但 child 尚未完成 | 改用 spawn runner 等待结构化结果/退出；早期 exit code 不计通过 |
| 隐藏窗口无法可靠 keyboard focus，误读非 public focusedValue | 改可见聚焦窗口和 DOM/public state 断言；使用真实输入，不把脚本调用当 keyboard |
| 受控扩展批次/预加载 ready metadata 不一致 | 同步 controller、单次批量扩展并 await tick；避免 synthetic load 覆盖 1,000 项为 200 |
| 一次 bounded probe timeout、selector 引号和 memory API 错用 | 未加长期限掩盖；stage journal 定位 harness，修复 script/API 后重跑；超时不算性能成功，旧未记录的具体停点不倒推 |
| 独立 TS6 继承配置、CLI 路径猜错 | --ignoreConfig / 明确绝对工具路径；未改生产配置 |
| KeenMate main README 404、猜错 TanStack dist 路径 | 官方 API 确认 prod 分支；实际 runtime import 成功，不能虚构发布缺文件问题 |

最终 direct Vite、实际 electron-vite 和 Windows x64 packaged 三组结构化报告均 `ok:true`、errors=[]；其中“native collapse behavior observed”通过表示问题成功被观察，**不表示原生 collapse 语义符合产品要求**。没有新增 macOS、屏幕阅读器或剪贴板实际写入证据。

### 16.2 最终仓库与清理验收

本轮唯一永久交付为此报告。生产 source、测试、配置、package/lock、权威文档均保持原状；没有 commit、branch、PR、issue、push 或下一 slice。

应用 HEAD：`c9a402cebcadaeac953ce556d3bab4da7c0b4bf8`。外部数据 HEAD：`724b139d8c9c32d12552eb95745a4fee72bfe48b`。初始双方工作树 clean；最终应用仅新增本报告，外部仍 clean。production package SHA-256 `e81d08c04f308010ca5179595b81fd45fdba697e967e4e653cb6bd580da1d7bc`，lockfile `556868ed96b7d1c2c9dea2f0504e97e5c8bd7b932ad61386ffb68ad07374c893`，前后相同。

临时 source/package/应用进程清理完成；按本轮路径核对无残留 spike Electron 进程，不停止其他用户应用。docs:check、format:check 和 diff whitespace 检查通过。因生产无改动，本轮没有重新跑完整 Raw Foundation production 测试/build/跨平台流水线；正式 Source Browser implementation 需要第 13/15 节验收。

`git diff --stat` 对 tracked 文件为空；本报告为 untracked 新文件，最终 `git status --short` 仅 `?? docs/investigations/phase-2-source-browser-preflight.md`。这符合只交付调查报告的边界。等待评审。
