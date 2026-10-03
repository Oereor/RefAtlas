# Phase 2 Source Browser Slice C：Source Explorer Shell

日期：2026-10-03，Windows x64。任务依据外层 prompt 的 Slice C 说明和用户明确授权；本报告描述本轮实现，不改变 ADR-0007–0010。

## 1. Executive Summary

正式首页已替换为紧凑 App Shell、工作区打开/切换和 Source Explorer。完成 Zag tree interaction、managed ExplorerController、TanStack 虚拟化、目录分页/取消/重试/刷新、有界 metadata 缓存、选择与激活分离，以及只保存 SourceInfo 和根 NodeSummary 的 SourceSession。Foundation diagnostics 保留在 smoke 专用入口。

完整 Node Browser、Inspector 内容、搜索、stale/reload 产品界面均未实现。Windows x64 已通过单次完整 11 阶段 runner（exit 0），dev/built/packaged 的真实组件、键盘和只读数据验证全部通过。Slice A/B/C macOS arm64 均 deferred、未豁免，统一留待 Slice D 后 Apple Silicon 累计验收。Slice D 接口准备完成，是否进入仍需用户独立授权。

## 2. Dependency / Versions

| Production dependency | 精确版本 | License | 用途 |
| --- | --- | --- | --- |
| @zag-js/tree-view | 1.44.0 | MIT | 树交互、键盘与 ARIA |
| @zag-js/svelte | 1.44.0 | MIT | Svelte machine adapter |
| @tanstack/svelte-virtual | 3.13.39 | MIT | 有界 DOM 与滚动定位 |

通过 127.0.0.1:7890 代理重新核对官方 npm registry metadata，未升级到其他候选版本。lockfile 新增 11 项传递依赖条目，既有版本未改变；Svelte peer graph 的 production 标记随 npm 自动提升。运行时离线。Main/Preload/Utility 不导入 UI 库；打包显式排除前端源码和 Svelte 编译器闭包，保留已编译 Renderer assets。

## 3. App Shell

顶部包含 RefAtlas、原始 workspace displayName、打开/切换按钮和 locale select；Explorer 标题栏承载刷新。未打开时显示简短说明与打开按钮。左侧初始 280px，中央 minmax(0,1fr)，右侧为 32px 默认折叠 Inspector 占位。窗口默认 1280×800，最小 900×600，长 workspace/source 名称和原始路径使用省略/滚动处理。

## 4. Explorer Architecture

Zag 控制 expanded/selected/focused integration、可见逻辑集合及键盘模型。ExplorerController 保存目录数据、request ID、AbortController、directory epoch、workspace generation、分页和缓存；没有采用 Zag 原生 loadChildren。TanStack 只管理固定高度虚拟 DOM、overscan 和 scrollToIndex。Tree payload 保留真实 DirectoryPath/SourceAddress，稳定 opaque UUID 不参与地址推导。

## 5. Directory State / Lifecycle

每目录显式区分 unloaded/loading/ready/error；空目录保留 ready，不凭 entries.length 推导加载状态。每页上限 200、每目录单请求、全局并发 2。折叠取消整个子树、推进 epoch，旧结果与旧 finally 不得修改重新展开后的请求。追加保留原行 identity/selection/focus，失败保留已有页并显示 Retry；STALE_CURSOR 停止追加，显式从 null cursor 刷新该目录。

尾部 sentinel 接近真实虚拟视口时自动续页，并保留显式 Load more。工具栏刷新清空目录页、重建根目录，保留 active source。缓存起点为 10,000 entries / 8 MiB serialized metadata；目录辅助状态的分配和页面提交均检查预算。优先淘汰折叠子树和辅助记录，保护展开分支、选中/聚焦项祖先与加载中目录。无法腾出空间时保留已有树并显示本地化资源限制。

## 6. Virtualization

固定行高 24px、overscan 5。Zag 可见集合进入 TanStack count；键盘目标先 scrollToIndex、等待 Svelte tick 挂载，再取得 DOM focus。手动滚动额外保留至多一个 focused row，避免焦点节点被移除；该保留项不会触发远处自动分页。

开发态 synthetic 5008 个逻辑行时挂载 34 项，End 后 33 项；真实 root/ExcelOutput/Mission 合并可见 5258 个逻辑行时挂载 33 项。长 Unicode/CJK/emoji 文件名保持单行 24px，title 与 aria-label 保留完整原文。

## 7. Source Activation

单击与 Space 选择，双击或 Enter 激活。选择背景、active 圆点和 pending spinner 分开显示。激活只执行 getSourceInfo → readNode(root)，保存 SourceInfo/NodeSummary，不把文件全文或 child pages 放入 UI state。

A 在 B pending 时保留；B root 成功后提交 B，再 release A；B 失败保留 A。候选采用单执行通道与 latest-intent-wins：取消旧候选、等请求 settled、清理候选，再处理最新意图。相同地址 acquire/cleanup 也在此通道串行，避免旧 release 删除新会话。回到 active A 会取消候选并保留 A。workspace lifetime 与 activation epoch 阻止旧 workspace 结果提交。

## 8. Workspace Lifecycle

closed/opening/open/error 和 epoch 独立管理。picker 期间保留旧 UI 状态，阻止重复 picker；取消恢复原状态，不清 tree/session。成功后利用现有 openWorkspace 的 Utility reset 清理旧注册，Renderer reset 后加载新根目录；不额外 closeWorkspace，以免关闭新工作区。打开失败清除无法确认有效的旧 session，并显示本地化错误。

## 9. Localization Integration

正式文案、tooltip、ARIA label 与 RawError presentation 统一复用 Slice B typed catalog/formatRawError。语言名称使用 catalog，原始 filename/path/source address 保持原样。顶部支持 English/简体中文，无 reload runtime switch。真实组件连续四次切换保留展开、选择、DOM focus、滚动位置和 active session。

## 10. Accessibility / Keyboard

实际 Electron sendInputEvent 验证 Arrow Up/Down、Left parent/collapse、Right expand/enter、Space selection、Enter activation、Home/End scroll/focus。tree/treeitem、aria-level、selected、expanded、busy、current 由 Zag props 与 metadata 补充。完整兄弟数量未知时 aria-setsize=-1，不将已加载页数伪装成完整数量；错误/重试/loading/empty sentinel 可在树中观察与操作。

尚未执行屏幕阅读器人工验收。扁平虚拟 treeitem 只挂载视口附近与 focused item；保守 ARIA 与真实 keyboard gate 不替代目标平台 assistive technology 验收。

## 11. UI / Visual Design

浅色中性桌面工具界面，紧凑标题栏、14px 缩进、轻量 folder/file 符号、细边框和明确 focus outline。无大卡片或营销 hero。开发态已检查真实 Electron capturePage 截图；Windows 125% DPI 会使物理截图尺寸大于逻辑窗口；三态截图均经视觉检查，布局、长名称和中央状态正常。

截图证据保存在 ignored artifacts/source-explorer-dev.png、source-explorer-built.png、source-explorer-packaged.png。agent-browser skill 对应 CLI 在本机不存在，因此视觉核验使用真实 Electron capturePage，console smoke 三态均为空。历史诊断组件仅在 smoke 模式离屏挂载，普通应用不显示 Foundation 首页。

## 12. Tests

新增 Explorer/Workspace controller 回归覆盖 empty-ready、initial failure/retry、collapse cancellation、迟到 result/finally、重新展开、稳定追加、续页失败、stale cursor、refresh、并发、queued cancel、工作区代次、LRU/selection protection、字节上限和辅助状态限制。

SourceSession 回归覆盖首次激活、A→B 成功/失败、多个错误类型、快速 A/B/C/D、返回 active A、候选清理、同地址屏障、旧源释放与 workspace reset；真实 RawDataService 临时 fixture 验证注册/根读/失败/释放生命周期。

Electron smoke 验证真实 bridge/controller/组件与 input events，另以局部 bridge wrapper 注入可控 initial error 和迟到结果，验证实际 DOM retry、loading ARIA、collapse 和双击。既有 Foundation、RawAccess、localization 和 native SQLite 验证保留。最新局部 27 项测试通过；最终普通 tests 为 13 files / 172 passed，1 个 opt-in 真实数据测试在普通模式 skipped，随后独立 real-data gate 1 passed；typecheck 0 errors/0 warnings。

## 13. Real-data Results

dev/built/packaged 的真实 ExplorerController 均浏览 root、ExcelOutput（2253 sources）和 Config/Level/Mission（2845 sources），实际虚拟化路径达到 5258 逻辑行/33 mounted treeitems。只选择 AvatarConfig 时未 acquire；激活 AvatarConfig → EquipmentConfig 后旧源 readNode 返回 SOURCE_CHANGED，证明已释放。既有真实 RawDataService gate 继续验证全部 ExcelOutput entries 不批量注册，以及 AvatarSkillConfig、TextMapCHS、代表 baked Floor 和 SoundBankLookUp 等六样本。

每个 opt-in dev/built/packaged smoke 前后比较外部仓库 HEAD/status 和六样本 SHA-256/size/mtime。最终三态前后证据均一致；外部 HEAD 为 724b139d8c9c32d12552eb95745a4fee72bfe48b，status 为空。

## 14. Performance Observations

最终三态工程观测如下（ms，单次运行，没有控制 OS cache）：

| Mode | Synthetic 首页/追加至 5000 | 真实 root | Excel 首页/余页 | Avatar acquire/root | Synthetic logical/mounted | Real logical/mounted |
| --- | --- | --- | --- | --- | --- | --- |
| dev | 288.0 / 518.6 | 3.5 | 115.4 / 144.3 | 40.6 | 5008 / 34 | 5258 / 33 |
| built | 267.1 / 401.9 | 3.7 | 128.0 / 133.6 | 36.6 | 5008 / 34 | 5258 / 33 |
| packaged | 216.8 / 376.2 | 3.3 | 134.3 / 132.7 | 33.5 | 5008 / 34 | 5258 / 33 |

三态 End 后 mounted 33，scrollTop 约 119534.4，末项实际 DOM focus 正常；Home 返回首项。长 Unicode 行高保持 24px，手动滚动保留 focused item。计时涵盖临时 fixture/OS cache 等条件，不是 benchmark/SLA，不推导所有目录/硬件的性能。没有建立 FPS/RSS 门槛。

## 15. Dev / Built / Packaged

Windows 11 x64，Node 24.21.0 / npm 11.16.0 / Electron 44.5.1 / Svelte 5.57.1。

| Mode | 最终 report measuredAt（UTC） | 状态 |
| --- | --- | --- |
| dev | 2026-10-03T11:00:45.857Z | PASS |
| built | 2026-10-03T11:00:57.103Z | PASS |
| packaged | 2026-10-03T11:01:10.854Z | PASS |

每态通过 Foundation bridge/SQLite/取消/崩溃/重启、既有 RawAccess/localization 和全部 Explorer stage。三态 BrowserWindow sandbox=true、contextIsolation=true、nodeIntegration=false；Renderer consoleErrors=[]。packaged guard 确认普通模式不暴露 diagnostics，native SQLite addon 在 ASAR 外真实加载。全部 real-data gate 开启，六样本外部安全核验一致。

本地 ignored 证据为 artifacts/foundation-{dev,built,packaged}-win32-x64.json、raw-real-data.json 和汇总 slice-c-validation.json；提交报告保留关键数值，不提交大型产物。

## 16. Validation Runner

**最终 npm run validate:foundation -- --real-data 在单次完整 invocation 全部退出 0。** 2026-10-03 19:00–19:01（UTC+8）运行 11 阶段：offline i18n → format → typecheck → ordinary tests → docs → real-data → dev smoke → production build → built smoke → builder → packaged smoke。production build 恰一次，built 与 packaged 使用同一产物；没有分段补验来替代这次 exit 0，也没有延长 timeout、降低安全设置或新增 retry。

开发过程局部测试曾因新增预算 fixture 的预设容量没有触发拒绝而失败；改为按实际 metadata 用量构造确定性容量压力后通过。曾有一次 dev smoke 在 component 增补后报告 null.root，但未带 stage；加入 stage journal、active 明确断言和滚动恢复后通过，未确定该次失败的独立根因。最终全 runner 三态均未复现，报告不把未确认根因写成已证明的产品修复。本轮恢复前发生自动审批服务 usage-limit 失败，恢复后已正常运行；未更改代理或绕过外部只读约束。

报告与权威文档在 runner 后仅补充已获得的结果；最后再做 docs、format 和 diff 检查，不重复昂贵全链路。

## 17. Bundle / Package Impact

| 指标 | Slice B 历史 Windows 基线 | Slice C 最终 | Delta |
| --- | --- | --- | --- |
| Renderer JS bytes | 152262 | 424497 | +272235 |
| Renderer gzip bytes | 34107 | 89572 | +55465 |
| ASAR bytes | 1104278 | 1385891 | +281613 |

Renderer CSS 为 6186 bytes，Windows unpacked 目录总计 413617857 bytes；app.asar.unpacked 为 27294745 bytes。此前未记录整个目录包的可比 byte 基线，因此只给出 ASAR 增量，不虚构完整目录包 delta。增量包含 Zag/TanStack、正式组件、controller、typed messages 与 smoke harness，不能等同于第三方 runtime 的独立成本。

built/packaged guard 扫描实际 Main/Utility/Preload CJS，未发现 UI/localization runtime；ASAR 排除 unbundled Zag/TanStack/Svelte/compiler/catalog/plugin cache 和外部数据，保留 out assets、运行时后端依赖及 native unpack。production dependency graph 与打包 contents 是不同边界；UI production dependencies 由 Renderer bundler 吸收。

## 18. macOS Status

Slice A/B/C macOS arm64 not yet validated，deferred to cumulative gate after Slice D，not waived。既有 Phase 1A / Raw Access Foundation 的 Mac 验证不覆盖新增 Zag/TanStack/SourceSession UI。Apple Silicon 原生 dev/build/package/keyboard/真实数据与清理仍须执行。

## 19. Known Limitations

本轮仅最小 Source/root placeholder；Node Browser、Inspector、search、stale/reload banner 属后续。Explorer refresh 重置 listing/selection/focus，但不释放 active source；不是自动文件 watcher。metadata budget 不等价于 Renderer RSS，虚拟化仍需持有有界的逻辑树/collection。没有屏幕阅读器人工 gate 或 macOS 新增 UI gate。底层 stat/revision 与 cursor snapshot 的检测边界继承 Slice A；不宣称能检测所有同 stat 修改。release 在 transport 拒绝时是 best effort，service/workspace reset 仍是最终生命周期边界。正式 picker 使用现有系统 dialog；smoke 通过 Main 内部专用 fixture queue 控制 picker 返回，不新增 production IPC。

## 20. Final Diff

新增：components/AppShell、WorkspaceToolbar、SourcePlaceholder；explorer/SourceExplorer、explorer-controller；state/app-state、workspace-controller、source-session、requests；styles/base.css；FoundationDiagnostics、explorer-smoke；scripts/source-explorer-data；tests/explorer、source-session；本报告。

修改：package/lock、messages 两 locale、Main window/smoke harness、Renderer App/main/env/smoke、validate/smoke-worker、electron-builder/config guard；同步 README、STATUS、ARCHITECTURE、ROADMAP、PERFORMANCE、DEVELOPMENT-PROCESS 和两级文档索引。没有新增生产 bridge method，没有修改 Core raw semantics，没有升级既有依赖版本。最终 diff 为 16 个新增文件、21 个修改文件，合计 37 个文件；依赖变更为 3 个精确 production declarations 和对应 11 个新增 lock 条目。

## 21. Cleanup

所有可变 fixture 位于应用测试临时目录，外部 TurnBasedGameData 全程只读。smoke wrapper 负责退出与临时目录清理，生成 JSON/PNG/out/dist 是 ignored 验证产物，不提交。最终三态 HEAD/status/六样本指纹全部一致；外部 status 为空。真实用户代理仍为 ProxyEnable=1、ProxyServer=127.0.0.1:7890；本轮仅使用进程级代理变量，没有修改全局 npm/git/system proxy。原生进程查询无本项目 Node/Electron/RefAtlas 残留，用户 TEMP 下 refatlas* fixture 目录为空。应用仍在原分支，本轮不提交、不建分支、不自动进入 Slice D。
