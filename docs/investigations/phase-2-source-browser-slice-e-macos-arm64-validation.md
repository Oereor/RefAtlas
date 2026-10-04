# Slice E macOS arm64 定向原生验收

日期：2026-10-04（UTC+8）。依据用户指定的 Slice E targeted validation prompt；本轮不进入后续阶段。

## 1. Executive Summary

**PASS WITH FIXES（仅验收 harness 修复/增强，无产品行为修改）。** Slice E 的 polling、Stale、显式 Reload、同 Pointer 恢复、LOCATION_MISSING 与文件级失败在 dev / built / ASAR packaged 原生 arm64 均通过。最终第 3 次完整 invocation 的全部 11 阶段 exit 0，production build 恰一次；此前失败与第 2 次成功没有被隐去。

**原生窗口结论限定台前调度关闭。** 用户自行临时关闭并负责恢复；开启时 Electron 的 minimize / Page Visibility 行为未满足 gate，独立窗口也复现，不能声称该组合通过。真实 hide/show 与关闭后的 minimize/restore 均保留 backgroundThrottling=true。

## 2. Environment / Native arm64 Proof

Apple M2 / Mac14,2 / 16 GiB / macOS 27.0.1 build 26A434；uname、shell Node、三态 Electron process.arch 与 Mach-O 均 arm64，无 Rosetta 结果。命令仅前置已有 Node 24.19.0 / npm 11.17.0，默认版本未改。Electron 44.5.1 内部 Node 24.21.0 / ABI 149 / N-API 10；better-sqlite3 13.0.3 实际 SQLite 3.53.4。原生 addon 为 prebuilds/darwin-arm64.node。

系统 HTTP/HTTPS/SOCKS 均为 127.0.0.1:7890，listener 为已有 VPN；可联网命令使用进程级 HTTP_PROXY/HTTPS_PROXY/ALL_PROXY，NO_PROXY=localhost,127.0.0.1。依赖齐全，无安装/升级；固定插件离线编译实际网络请求 0。未改永久 npm/git/代理配置。

台前调度最初 GloballyEnabled=1、AutoHide=0；用户自行关闭为 0，并明确验收后手动恢复。agent 未修改系统偏好。

## 3. Repository Baseline

应用 HEAD 与本地 origin/main：`276ceccb721e5c2ff438b8ed85f1e52f2c41452d`（Complete Phase 2 Slice E）；初始工作树干净。外部 HEAD：`724b139d8c9c32d12552eb95745a4fee72bfe48b`，初始/结束 status 均空。没有 fetch/pull。

package.json SHA-256：`ddeb1135c2103e1cde62eef3024e3df8031cf1a22902ed7e806a72333d57ca2c`；package-lock.json：`6b66915195ffd1ff012280f0302e2530aa2a0a9005f7e21b9f1e5f5f30daec99`。收尾再次一致。

六样本为 AvatarConfig、EquipmentConfig、AvatarSkillConfig、TextMapCHS、P10401_F10401001_Baked 和 SoundBankLookUp；完整路径/SHA-256/size/mtime 见 ignored artifacts/slice-e-macos/baseline.json 与 final-audit.json，前后逐项一致。

## 4. Validation Scope

针对 Slice E 相对 A/B/C/D 的新增生命周期、恢复、本地化及真实窗口行为。既有历史报告用于确定范围；没有重新开展 symlink matrix、parser/watcher 或大目录累计调查。标准 runner 的既有 A/B/C/D gate 全部保留。

mutation/delete 仅针对 Main/runner 创建的临时 JSON。Renderer 查询经既有 Preload→Main→Utility→RawDataService，无新增 diagnostics API、权限或 IPC。

## 5. Polling Behavior

Mac 定向回归验证 active source only、请求 settled 后约 1s 调度、no overlap、reset/dispose cleanup。TIMEOUT / SERVICE_UNAVAILABLE / INTERNAL 的确定性 bridge/deferred 回归保留 rendered view，允许后续 monitoring；不冒充真实网络/权限故障。

原生 smoke 仅包装现有 private bridge 记录调用/完成，随后恢复，未代替真实服务响应。可见两次请求后隐藏，窗口内计数不增长；恢复第一请求与后续周期均完成。所有来源地址等于 active source，max pending=1，unchanged source 保持同一 active session。无 workspace scan。工程计时见第 6 节，不是 SLA、CPU/FPS 或跨机器性能排名。

## 6. Native Minimize / Hide / Resume

首次 dev 的 BrowserWindow.minimize 后 native minimized=false、visible=true、focused=false、throttling=true，document.visibilityState=visible；原 3 秒状态 gate 失败。没有提高失败 deadline、替换成 fake timer 或关闭节流。

独立真实 Electron 窗口（相同 sandbox/contextIsolation/backgroundThrottling）同样不产生 minimize event；20 秒有界观测仍 minimized=false，而 hide/show 正确。用户确认动画正常、台前调度开启；曾根据截图提出的“动画卡住”推测撤回。用户自行关闭台前调度后，同一个探针在 unfocused/focused 两种情况下均产生 minimize event、minimized=true、visible=false、document=hidden；恢复后 visible。代码和 Electron 版本未变，支持 Electron/macOS/环境语义分类，不证明 RefAtlas product bug 或所有开启台前调度的机器都会失败。

最终三态实际调用 minimize→restore、hide→show/focus；隐藏观察目标 2200ms，均明显超过两个 1000ms polling interval，实际后台 timer 可能更晚完成。原生状态：minimize 时 visible=false/minimized=true，hide 时 visible=false/minimized=false；恢复均 visible=true/minimized=false，Page Visibility=visible。各阶段 throttling=true。每轮计数 visible 2 → hidden 2 → resumed 4；恢复窗口没有重叠。

| 模式 | 原生动作 | 隐藏观察 ms | visibilitychange→首次请求 ms | 首次完成→后续请求 ms | 调用计数 / max pending |
| --- | --- | ---: | ---: | ---: | --- |
| dev | minimize | 2527.8 | 0.3 | 1006.4 | 2→2→4 / 1 |
| dev | hide | 2471.3 | 0.2 | 1000.6 | 2→2→4 / 1 |
| built | minimize | 3081.4 | 0.2 | 1001.7 | 2→2→4 / 1 |
| built | hide | 2340.9 | 0.5 | 1000.5 | 2→2→4 / 1 |
| packaged | minimize | 2974.1 | 0.1 | 1006.4 | 2→2→4 / 1 |
| packaged | hide | 2420.8 | 0.3 | 1000.5 | 2→2→4 / 1 |

证据为最终 foundation 三态 JSON 的 monitor-visible/paused/resumed 与 nativeWindow；开启环境 stdout/probe JSON 和关闭对照保存于 artifacts/slice-e-macos/window-*。不声称开启组合的 polling pause/resume 已通过。

## 7. Stale Lifecycle

三态真实临时 fixture 进入非 root /entries 或 /long 后被 Main 修改，poll 自动标 Stale，无导航触发、无自动 Reload。保留旧 children 页与旧 segment；Breadcrumb、Previous/Next 和 Inspector Open Node 禁用，Reload 可用。Controller 和 DOM 双重边界延续既有实现。request-time readNode/children/segment 的 SOURCE_CHANGED 回归亦在 Mac 执行。

## 8. Same-Pointer Reload

三态 /a/b 从 1→2，Reload 后 READY、Pointer 不变、新值为 2、old revision≠new revision；container /entries 和 segmented /long 同样记录旧/新 revision。完整 UUID 在每态 JSON 的 reload-survives、scalar-reload、scalar-value-reload。不是按实体身份恢复。

## 9. Recovery State Reset

container 从第二页 ordinal=100、selected child 与 scrollTop=200 开始，Stale 保留旧页；Reload 后首页/新值 42、position=0、history 只含初始 null cursor，selection/parent context 清空、scrollTop=0、Inspector current Node。

segmented scalar 从第二段、scrollTop=100 开始；旧“旧🙂”替换为“新🙂”，Reload 后首段精确为“新🙂”×2048（4096 code points），position=0、history 重启、selection/context 清空、scrollTop=0、Inspector /long。恢复不保留页、段偏移或选中 child。scroll 在真实 DOM 验证，controller 的 cursor/race 回归另列。

## 10. LOCATION_MISSING

/a/b 的来源 Reload 成功、revision current，但 Pointer 消失，进入 application-level LOCATION_MISSING；显示旧 /a/b 与 Return to Root，没有自动 Root。用户动作（smoke 点击真实按钮）后 READY / Pointer="" / 首页。额外用 323 code-point CJK/emoji Pointer 在窄窗验证原文、换行和 Root 按钮。

Raw protocol 仍为 NOT_FOUND；src/shared/raw.ts 未增加 LOCATION_MISSING RawCode，本轮无 protocol diff。

## 11. File-level Failure

三态实际删除 source，以及写入 invalid JSON：分别 NOT_FOUND / INVALID_JSON，保留旧 stale view、revision 和原 Pointer，不伪造新 revision、不跳 Root、不冒充 LOCATION_MISSING。错误 presentation 可 en↔zh-CN 切换；恢复合法文件后显式 retry 成功。ACCESS_DENIED 是既有 controller bridge 注入，未宣称实测 macOS ACL。

## 12. ADR-0007 Semantic Boundary

真实临时数组 [{id:1}] 浏览 /0，改为 [{id:2},{id:1}] 后 Reload 仍 /0 且显示 id=2，不跟随 id=1 到 /1。三态 UI、真实服务 controller 回归与实现 inspection 一致；没有 ID/value/field matching、相似度或 logical entity migration。

## 13. Locale Continuity

Stale、LOCATION_MISSING、删除及 invalid Reload error 下 en↔zh-CN，active source、Node snapshot、Pointer/recoveryPointer、revision、raw payload、错误状态与 Inspector 展开/折叠保持。最终每态 Node 生命周期 did-start-navigation=0；localization runtimeNavigations=0。持久化 fixture 主动 reload 各 3 次单独记录，不混入 runtime 切换。

Reloading 按钮在真实 UI tick 后直接断言 disabled=true、session.reloading=true 且文案为当前 locale 的 source_reloading；成功后 current Header 不显示 Reload。没有以只验证 controller busy 代替最终按钮证明。

## 14. Race / Cancellation Regression

SourceSession / NodeBrowser / raw lifecycle 定向 suite 在 Mac 验证 poll/reload/recovery 跨 source/workspace、新意图优先、旧 SOURCE_CHANGED/旧 finally、取消、重复 Reload 合并、候选 root validation 失败清理与 retry。共享状态机竞态使用确定性 deferred/fake timer；native polling/window 另用真实时钟，未混淆证据。没有强行设计不可靠的人工 UI 竞态。

## 15. UI / Narrow Window Sanity

最终三态各六张截图已视觉检查：默认、narrow、Stale、LOCATION_MISSING、删除 Reload error、long LOCATION_MISSING；文件为 ignored artifacts/node-browser-{dev,built,packaged}{suffix}.png。Header/Reload、旧内容、禁用结构控件、当前 revision Inspector、Root 动作、本地化错误与 CJK/emoji 均可用。323 code-point Pointer 原文完整换行，窄窗中央和 Inspector 可读；表格使用局部滚动，shell 无横向 overflow，Inspector 可折叠。Reloading 的短暂状态由直接 DOM 断言验证，没有静态截图。

| 模式（均相同） | 窗口 logical | 内容区 logical | PNG physical |
| --- | --- | --- | --- |
| dev / built / packaged 默认、Stale、Reload error | 1280×800 | 1280×768 | 2560×1536 |
| dev / built / packaged narrow、LOCATION_MISSING、长 Pointer | 900×600 | 900×568 | 1800×1136 |

截图是 capturePage 内容区，不含 macOS 标题栏；工具预览可能缩放，不据此改写物理尺寸。本轮没有新的人手触控板/VoiceOver 检查；上轮用户反馈仅属于 A/B/C/D，不算本轮人工 E 证据。

## 16. Dev / Built / Packaged

| 模式 | 最终 measuredAt（UTC） | E native / recovery / locale | navigation / console errors |
| --- | --- | --- | --- |
| dev | 2026-10-04T03:46:45.634Z | PASS | 0 / [] |
| built | 2026-10-04T03:47:30.591Z | PASS | 0 / [] |
| packaged | 2026-10-04T03:48:19.110Z | PASS | 0 / [] |

每态 sandbox=true、contextIsolation=true、nodeIntegration=false，renderer consoleErrors=[]，arm64。专项场景均在实际 Electron 产品 UI/data path，fixture mutation 在 Main，普通模式 guard 单独运行。不是因为 runner exit 0 就推定 native E 行为自动成立。

现有 --real-data 同时浏览六来源；独立真实 gate 与三态外部前后检查一致。原目录 root 6 / ExcelOutput 2253 / Config/Level/Mission 2845，完整响应仍有界；本轮不将这些既有 runner 结果包装为新的累计调查。

## 17. Native / ASAR Sanity

packaged 实际加载 unpacked darwin-arm64 SQLite addon，三次 Unicode 与大整数文本往返、close/cleanup 全过，nativeUnpacked=true。app.asar 与 .node unpack 检查、renderer-only runtime/compiler/catalog/cache 排除和 normalModeGuard 保持通过。Builder 为 --dir / mac arm64 / publish never，identity=null，未签名/公证/发布。

最终 Renderer JS 553,102 bytes / gzip 108,707 bytes（包含 smoke instrumentation，不解释为纯产品增量）。没有新增性能目标；其余包体大小非本轮门槛。最终 JSON packageContents 全部 true，normalModeGuard diagnostics=false / nodeIntegration=false。

## 18. Tests / Native Evidence

最终完整命令（每次相同入口，Node24/代理仅进程级）：

```sh
npm run validate:foundation -- --real-data
```

| 完整 invocation | 退出码 | production build 次数 | 结果/复验依据 |
| --- | ---: | ---: | --- |
| runner-1.log | 1 | 1 | 前十阶段通过；packaged Explorer End 在 Unicode 行挂载/焦点完成前断言；修复可观察等待 |
| runner-2.log | 0 | 1 | 11 阶段全部通过；随后加强 Reloading 实际 DOM 断言 |
| runner-3.log（最终） | 0 | 1 | 最终固定 harness 输入，全 11 阶段通过 |

本轮完整 runner 总 production build=3；最终 invocation 恰一次，未并行覆盖 out/dist。dev 编译不算 production build；未把历史成功替代本轮最终证据。

定向 SourceSession、NodeBrowser、localization、raw lifecycle：4 文件 / 123 passed。首次直接 Vitest 122 passed / 1 failed（缺 source_reload）因绕过 npm pretest、旧 ignored Paraglide 产物；离线编译后同 suite exit 0。最终普通测试 230 passed / 1 opt-in skipped，独立 real-data 1 passed；既有 opt-in 是后续单独执行的真实 gate，不是跳过验收。

定向 dev invocation：dev-targeted exit 1（台前调度 minimize）；dev-stage-manager-off exit 0（用户环境改变）；dev-final-harness exit 0（End/长 Pointer 增强）；dev-reloading-ui exit 1（补强断言漏 messages import）；补齐 import、typecheck 后 dev-reloading-ui-fixed exit 0。每个 dev production build=0。遗漏 import 的 typecheck exit 1，修正后 0 errors / 0 warnings；最终 runner 再次类型检查通过。所有失败日志保留。

独立窗口探针是原生环境诊断，不是产品 gate；CUA 绑定延迟超过一次 60 秒探针寿命，工具后来打开 default Electron 的结果未计为探针通过。没有无依据机械 retry 或扩大 deadline。

## 19. Fixes Made

**产品行为修复：无。** SourceSession、NodeBrowserController、普通窗口配置、Svelte 产品组件、RawDataService/watcher/parser、Preload/IPC 与 raw types 均无 diff。

**harness 修复：** Explorer End 由只等 scrollTop 改为同时等待目标 Unicode 行挂载与 focus，原 deadline 不变；后续原 24px/完整 title/ARIA/有界 mounted 检查仍保留。失败属于 native UI automation 的未完成状态等待，不降低检查要求。

**harness 覆盖增强：** 现有 guarded Main fixture flow 与 screenshot/native state、smoke-only bridge poll 观测、container/scalar reset、invalid JSON、1→2、数组位置语义、长 Pointer、零 navigation、Reloading DOM；worker 要求新增阶段存在。隐藏 1200→2200ms 是用户计划要求的 >2 interval 观测窗口，不是加长失败 timeout。补强中漏 import 已修正并保留失败。

| 失败 | 分类 | 依据与处理 |
| --- | --- | --- |
| source_reload 缺失 | 环境/命令前置遗漏 | 直接 Vitest 绕过 pretest；离线重新生成后通过 |
| 开启台前调度 minimize | Electron/macOS/环境语义差异 | 独立窗口复现；用户关闭后同版本探针及三态通过，开启组合仍列限制 |
| packaged End Unicode 行未就绪 | harness / native UI automation timing | 加强挂载与 focus 可观察等待，保持原 deadline 和全部断言 |
| 新断言 messages 未导入 | 本轮 harness 编辑错误 | 类型检查与 dev 检出；补 import 后定向及最终完整 runner 通过 |
| CUA 绑定超过 probe 寿命 | 外部工具问题 | 后续 default Electron 不计探针证据，精确清理 |

## 20. Remaining Limitations

台前调度开启组合的 minimize/visibility/pollpause 不在通过范围；本轮不修改系统偏好、不声称平台通用缺陷已经修好。关闭环境三态 gate 已通过，该差异留作明确平台限制。

未做完整 accessibility audit、Slice E 人工触控板/VoiceOver、macOS ACL 拒绝、网络盘、恶意同-stat strict snapshot、任意巨大 scalar 或 CPU/FPS 基线。Copy Pointer 延期。Search、Dataset Contract、References/Graph、Tabs/History/Compare/Diff、raw editing 和发布工作未实现/未进入。

## 21. Cross-platform Final Status

Windows x64 的 Slice E native full gate 已通过，shared watcher 的 Windows preflight 已关闭，见 [Slice E 历史报告](phase-2-source-browser-slice-e-change-reload-integration.md)。本轮 Mac 没有新增共享产品修复。

**Source Browser A/B/C/D/E generic browsing foundation is validated on both Windows x64 and macOS arm64.** Mac E 原生 minimize 的通过范围为台前调度关闭，开启组合保留第 20 节限制。这不等于 Phase 2 全部完成、entity/reference 功能完成或完整 accessibility audit。验收完成，报告交付待 review，不借此改写历史 review 结论。

## 22. Whether Windows Revalidation Is Required

**No（针对本轮 diff）。** 只有 guarded validation harness、fixture、观察和文档，没有共享产品生命周期/窗口行为变更；不触及核心服务/协议/Preload/IPC。Windows 历史原生证据仍对应相同生产行为。若后续处理开启台前调度的 visibility 行为而修改共享状态机/窗口配置，则需重新评估并执行 Windows native 补验。

## 23. Final Diff

4 个 harness 文件：scripts/smoke-worker.mjs、src/main/index.ts（现有 guarded smoke 分支）、src/renderer/src/explorer-smoke.ts、src/renderer/src/node-browser-smoke.ts。其余为本报告、STATUS、两级文档索引及 README/PROJECT/ARCHITECTURE/ROADMAP/PERFORMANCE 当前状态引用；历史调查不改写。

package/lock、依赖版本、安全配置、public API/IPC/types、预算和 ADR 未变。ignored 日志/JSON/PNG 留供 review，不提交产物。收尾 format:check、docs:check、git diff --check 通过。

## 24. Cleanup

收尾 baseline/final-audit 对照：应用 HEAD/originMain 不变，外部 HEAD/status/六指纹与 package/lock 哈希一致；代理与初始一致。owned processes=0；runner 临时 fixture/profile 清理完成，独立 probe 的 app-owned profile 与临时 .cjs source 已精确移除；保留 ignored 证据。用户负责恢复台前调度，agent 未更改该设置。

没有 fetch/pull、commit/push、PR、远程写入、签名、公证或发布。工作树只含上述预期改动。

## 25. Recommended Next Step

将本报告交给 ChatGPT review。用户可手动恢复台前调度；保留开启组合限制，不把关闭环境成功外推。验收交付后停止，不自动进入 Search 或其他阶段。
