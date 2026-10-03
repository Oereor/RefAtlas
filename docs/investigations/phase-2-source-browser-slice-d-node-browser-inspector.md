# Phase 2 Source Browser Slice D：Node Browser + Inspector

日期：2026-10-03，Windows x64。基于已提交 Slice C `8daa780`，依任务 prompt 和用户明确批准的实现计划。本报告不改变 ADR-0007–0010，不宣称 Source Browser 跨平台完成。

## 1. Executive Summary

实现当前 revision 内的 raw Node 浏览：Source Header、Breadcrumb、direct children semantic table、complete scalar / bounded segment、Previous/Next、Inspector，以及 NodeBrowserController 与 SourceSession 唯一 stale 边界。保留 Explorer 的选择/激活、分页、虚拟化、刷新与 source 生命周期。

没有新增 production dependency、IPC 或 Data Service API，没有递归 JSON tree、Raw Source View、搜索、Reload、LOCATION_MISSING、History、Dataset Contract 或 Slice E。Windows x64 单次完整 11 阶段 runner exit 0，production build 恰一次；201 项普通测试、独立真实数据和 dev/built/packaged 的实际 UI/data gate 全部通过。可选 Copy Pointer 因现有权限策略实测拒绝而延期。Slice D review 后可进行 Apple Silicon A/B/C/D 累计原生验收；该 gate 是下一节点，尚未执行、未豁免。

## 2. Node Browser Architecture

SourceSession → NodeBrowserController → SourceHeader / Breadcrumb / ChildrenTable / ScalarValueView / Inspector。Controller 使用既有 Svelte readonly/writable store，持有 source/revision、current summary/context、scalar、selected child、单页 children/segment、cursor history、position、pending/error 和 epoch。组件只展示并提交意图。

SourceSession 是 acquire/release 和 stale 唯一所有者。最小扩展保存 complete root RawScalar，丢弃 complete container value；成功 root read 已完成 RawDataService 语法验证，info.validated 同步 true。Root container 直接加载 children；complete root scalar 直接显示，summary string/number 直接请求 segment，不重复 acquire。

## 3. Source Header / Breadcrumb

Header 保留原始 filename / relative path，显示 Current/Stale、metadata size 与已验证/尚未验证；invalid JSON 用现有本地化 RawError，不能把 validated=false 当 invalid。根 Pointer 为 `""`。

Breadcrumb 用 splitPointer/joinPointer，parent 用 parentPointer；显示 decoded raw token，导航使用 encoded Pointer。实际 fixture 覆盖 `/a~0b~1c//0`，显示 `a~b/c`、空 key 与 `0`，不会猜 numeric token 为 array index。空 key 的视觉原文为空，accessible name 经 catalog 标识；长 token 本地水平滚动/省略，原始 Pointer 不重写。

## 4. Container View

所有 container 调用 listNodeChildren，最多 RAW_LIMITS.page=100，不从 complete container 遍历、不为每行 readNode。列为 Key/Index、Type、Value Preview、Children；未知 count 显示 `—`。Preview 是服务给出的摘要，不把 truncated summary 标记当作每个 preview 一定被截断；数值 preview 不经 Number/Intl 转换。

单击只选择并更新 Inspector；Enter / 双击进入 child。current 和 selected 分开，导航开始清 selection，readNode 失败保留旧 current/view。成功翻页清 selection，翻页失败保留原页和 selection。表格仅一页，不使用虚拟化或新表格库。

## 5. Children Pagination

Previous/Next 替换当前页，不 append。range 从实际返回 ordinal 与首/末行计算，已知 childCount 才显示 total；不假设每页恰 100 行。只保存一页 payload、最多 128 项 opaque request cursor/page number metadata；不解析或构造 cursor。

超过窗口淘汰最早 metadata，在边界禁用 Previous 并提供 Restart pagination。Previous 使用保存的 request cursor 重读；从该页再向前通过服务返回的 nextCursor。翻页失败 inline Retry；STALE_CURSOR 保留旧页、禁用 Previous/Next，显式 null cursor Restart。Controller 回归到 131 页验证窗口/payload 分别有界。

## 6. Scalar View

complete RawScalar：number 显示 exact lexeme（`1.00`、`-0`、`1e+3`、`16752756560315677817`）；string 显示 parsed semantic value，boolean/null 保留 true/false/null。没有 numeric precision conversion、locale formatting 或 JSON.stringify 重建。

summary string/number 调用 readScalarSegment，limit=RAW_LIMITS.segment=4096，单段保留、Previous/Next 替换，不拼接成整个 scalar。真实 adapter fixture 验证 Unicode code point 边界和长 number。parser/resource failure 显示本地化错误并保留旧 view；既有超限 huge fixture 验证 RESOURCE_LIMIT 仍保留原 active source。这个 bounded segment 路径不承诺任意巨大 scalar 可读取。

## 7. Inspector

target 优先 selected child，否则 current；Node 显示已知 context 的 Key/Index、Type、Pointer、Children。selected child 从当前容器获得 parent kind；ancestor navigation 没有 parent kind 时省略 Key/Index，不能按 numeric token 猜 Index。Source 显示 File、Relative Path、Revision、Status、Size。

默认展开 280px，折叠 32px；open 状态仅 App UI memory，locale switch 保留，不新增 settings/persistence。selected child 提供 Open Node；stale 下禁用。原始 metadata 可选择文本。

Copy Pointer 曾仅在真实用户 click 中调用 navigator.clipboard.writeText；Windows dev 实测返回 CLIPBOARD_WRITE failure。最小检查定位现有 Main deny-all setPermissionRequestHandler，未扩大权限、未增加 clipboard IPC/read API。按用户计划与任务可选范围移除此按钮并延期：Windows 未通过、built/packaged 与 macOS 未验证。不能写为三态 Copy 已通过。

## 8. Navigation / Race Model

单执行通道 RequestQueue(1)，新意图 abort 旧请求并推进 epoch；等待旧请求 settled 后只执行最新意图。提交检查 source、revision、epoch 和 signal，旧 finally 不得清新 pending。回到当前 Node 取消未提交导航，不重读当前节点；如果 root 首页尚未建立，取消后恢复其首读。

导航期间保留旧 current/view、显示局部 pending，清 selection。readNode 成功提交 current 后再加载第一页/segment；首读失败可 Retry。source/revision/workspace 切换取消旧请求、清分页和 selection、初始化新 root。picker cancel、Explorer refresh、locale switch 不重置 NodeBrowser。Controller 不 acquire/release，继续依 SourceSession B 成功后 release A 的生命周期。

## 9. Stale Boundary

当前导航、children、segment 请求的 SOURCE_CHANGED 均调用受 SourceAddress/revision 校验的 session.markStale，取消其他请求并保留旧 view。迟到旧源错误不能标记新源。Header、中央告知与 Inspector 同时显示 stale；Controller 拒绝所有新的 node/children/segment reads，Breadcrumb、分页、Open Node 禁用。旧 metadata 仍可查看/选择。

临时 fixture 在 Main 中外部修改后，真实 bridge/UI 保留原 100 行、标记唯一 session stale 并禁用导航。没有 Reload、重定位或 LOCATION_MISSING UX；后续 change/reload slice 才能接入，不能自动进入 Slice E。

## 10. Localization / Raw Boundary

正式文案、错误、tooltip、ARIA 均在 Slice B en/zh-CN typed catalog/formatter，metadata size/count 复用 formatter。raw key/value/lexeme/path/Pointer/revision 不翻译、不格式化。新消息没有传给 Data Service，没有新增 locale IPC。

实际组件连续切换保留 current、page/segment payload identity、selected child、DOM focus、scroll 和 Inspector open/collapsed。Foundation 诊断入口保持隔离，不把测试说明加入产品流程。

## 11. Accessibility / Keyboard

semantic table / column scopes、roving tabindex 和 aria-selected；Up/Down/Home/End 移动 focus 并选择，Enter 进入，Escape 清选择。Alt+Left 只在 NodeBrowser 区域、非 input/textarea/select/contenteditable target 处理。导航完成后 focus 新 row 或 scalar value，空容器回当前 breadcrumb；source activation 不自动抢 Explorer focus。

Electron sendInputEvent 验证 Home/End/Up/Down/Enter/Alt+Left。native event 是异步交付，smoke 等待可观察 focus/selection/navigation，不能仅 await tick 后断言。Breadcrumb、Inspector toggle、pagination 为原生 button，可键盘操作。实际屏幕阅读器/manual assistive technology 验收未执行，macOS 键盘累计 gate 未执行。

## 12. Tests

Controller + real RawDataService 临时 fixture 回归：六类 root、empty container、原始词法/semantic string、空/~//Unicode/numeric-looking object key、array index、ancestor/current 导航、失败保留/Retry、queued latest navigation、迟到结果/source switch、known/unknown count、children/segment Previous/Next、stale cursor、128 metadata cap / single payload，以及导航/children/segment SOURCE_CHANGED。既有 SourceSession tests 保留 acquire/release、同地址 cleanup barrier 和快速 source intents。

Node Browser 新增 29 项；与 Explorer 局部检查 40 passed。最终普通 tests：14 files passed / 1 opt-in file skipped，201 passed / 1 skipped；独立真实数据 gate 1 passed；typecheck 0 errors / 0 warnings。实际 Electron 组件/桥/UI 验证六 root、selection/navigation、Inspector、特殊 breadcrumb、205 children、long Unicode segment、locale continuity、900×600 和临时 source stale。最终三态全部通过，保留 Foundation/raw/localization/SQLite/取消/崩溃/重启/响应性 gate；locale 不 reload current session。

## 13. Real-data Results

实际 NodeBrowserController/UI dev/built/packaged 均浏览下列 six sources，外部数据没有修改：

| Source | 已知 root count / target page | 实际 scalar / representative Pointer |
| --- | --- | --- |
| ExcelOutput/AvatarConfig.json | 94 | /0/AvatarID |
| ExcelOutput/EquipmentConfig.json | 170 | /0/EquipmentID |
| ExcelOutput/AvatarSkillConfig.json | 7040 | /0/SkillID |
| TextMap/TextMapCHS.json | 首页 100 | 空 root Pointer |
| Config/LevelOutput_Baked/Floor/P10401_F10401001_Baked.json | /DimensionList 18 | /DimensionList |
| Config/SoundBankLookUp.json | /Events 首页 100 | /Events |

三 Excel 来源验证第一 children 页、Inspector 选择、container→scalar、Breadcrumb root 返回；Equipment/AvatarSkill 额外 Previous/Next。每页 payload ≤100，没有批量注册 sources，既有 Explorer gate 验证选中不 acquire、切换后旧 source 已释放。原始 Pointer 只是 fixture/数据浏览证据，不代表关系或实体模型。

每个 opt-in smoke 前后检查 external HEAD/status 和六样本 SHA-256/size/mtime。三态 unchanged=true，结束后再次独立 snapshot 一致；external HEAD 为 `724b139d8c9c32d12552eb95745a4fee72bfe48b`，status 空。所有代表页和三 Excel scalar 指针三态一致，真实数据 gate PASS。

## 14. Performance Observations

最终三态单次观测（ms），不是 SLA，不控制 OS cache；UI 时点覆盖 IPC/parse/DOM：

| Mode | Synthetic root+children | Next page | Segment | Inspector update | 导航/分页/locale 整段 sequence |
| --- | --- | --- | --- | --- | --- |
| dev | 23.4 | 28.5 | 12.2 | 0.7 | 279.2 |
| built | 30.5 | 43.6 | 15.4 | 0.6 | 334.9 |
| packaged | 24.7 | 18.4 | 10.1 | 0.4 | 222.7 |

| Mode / Source | Root commit | Root 后首 children view | Scalar navigation |
| --- | --- | --- | --- |
| dev / Avatar | 57.6 | 60.4 | 6.2 |
| dev / Equipment | 39.4 | 33.6 | 4.7 |
| dev / AvatarSkill | 1653.0 | 1622.1 | 8.0 |
| built / Avatar | 68.0 | 55.2 | 8.5 |
| built / Equipment | 43.4 | 37.8 | 9.5 |
| built / AvatarSkill | 1663.1 | 2038.8 | 5.4 |
| packaged / Avatar | 32.3 | 32.3 | 5.0 |
| packaged / Equipment | 27.2 | 26.2 | 3.9 |
| packaged / AvatarSkill | 1210.7 | 1103.3 | 4.3 |

Root commit 为 activate 发起至 active store 发布；首 view 为该发布后至 Controller/DOM ready，不等于剥离 IPC/DOM 后的 query latency。导航整段 sequence 包含多个动作，不是单次 navigation。Explorer 本轮三态 synthetic 5010 logical / 34 mounted rows，End 聚焦末项后 33 mounted，scrollTop 119582.4；真实目录 5258 logical / 33 mounted，仍经 C 的 controller/virtualization 路径。两新增 fixture 改变了 C 历史的 5008 总行数。

真实数据首次 smoke 曾以 generic 5 秒 polling 报 SETTLE_TIMEOUT。最小只读 RawDataService 探针记录 TextMap root 4347ms / first children 3954ms、代表 baked root 3671ms / children 4054ms，证明某些合法路径超过该人为 UI 窗口；首次失败没有记录来源，因此不声称确定是哪个来源导致。harness 改为 Controller completion subscription，保留现有 work/IPC/runner timeout，不增加 production deadline。记录 root commit、首 view after root、scalar navigation、翻页、segment 和 Inspector update；首 view 时点不是单独 service query benchmark。

## 15. Dev / Built / Packaged

Windows x64，Node 24.21.0 / npm 11.16.0 / Electron 44.5.1 / Svelte 5.57.1，dependencies/lockfile 未改变。最终三态均 PASS：

| Mode | report measuredAt（UTC） | 实际 UI / real-data / security |
| --- | --- | --- |
| dev | 2026-10-03T12:20:49.650Z | PASS |
| built | 2026-10-03T12:21:38.053Z | PASS |
| packaged | 2026-10-03T12:22:45.820Z | PASS |

三态 consoleErrors=[]；normal packaged guard diagnostics=false，Node Browser/Explorer/localization 可调用 harness 均不暴露。

1280×800 / 900×600 实际 capturePage 截图已检查：Explorer 保留，中央 table/scalar 独立滚动，长 preview 省略，窄窗 table 本地横滚，Inspector 本地纵滚/折叠。125% DPI 物理截图尺寸大于逻辑窗口。双 requestAnimationFrame 后 capture 防止捕获前一个 loading frame。ignored artifacts/node-browser-{dev,built,packaged}{,-narrow}.png 保存最终证据。

## 16. Validation Runner

最终命令 `npm run validate:foundation -- --real-data`，在同一次 invocation 完成 11 阶段，exit 0，production build 恰一次（第 8 阶段）；不是分步拼接。本轮只有这一次完整 runner invocation，无 runner 自动重试。阶段日志为 ignored artifacts/slice-d-runner.log，汇总为 slice-d-validation.json。完整 runner 后只补文档结果并复核链接/diff，没有变更生产源码/测试输入。

执行序列：offline i18n compile → format → typecheck → ordinary tests → docs → real-data → dev → production build → built → builder → packaged。先局部回归、普通 tests 和 dev 集成，失败定位 stage/最小证据后修改。记录过 NAVIGATION_FOCUS selector bug、Copy 权限失败、SETTLE_TIMEOUT 和 native input 早断言；分别修正目标 selector、延期可选 Copy、观察 Controller 完成和 native input 状态，无自动 retry 或 timeout 增长。

## 17. Bundle / Package Impact

没有新增依赖、没有升级 package/lockfile、没有改生产 IPC/RawDataService。UI 文件只进 Renderer bundle。最终与 Slice C 同口径对比（bytes）：

| 项目 | Slice C | Slice D | 增量 |
| --- | --- | --- | --- |
| Renderer JS | 424497 | 518830 | +94333 |
| Renderer gzip | 89572 | 103813 | +14241 |
| app.asar | 1385891 | 1487748 | +101857 |
| win-unpacked 文件总和 | 413617857 | 413719714 | +101857 |

包括正式 UI、catalog 和扩展 smoke；没有为了缩小这次增量引入 premature optimization。

既有三态 guards 保留 BrowserWindow sandbox=true、contextIsolation=true、nodeIntegration=false；packaged 检查普通模式 harness 不暴露、SQLite native 在 ASAR 外真实加载、外部数据/catalog source/compiler cache/未编译 UI 库不进入 ASAR。最终 built/packaged isolation、packageContents runtimeOnly/externalDataExcluded/nativeUnpacked/compilerExcluded/pluginCacheExcluded/catalogsRendererOnly/explorerRendererOnly 全部 true。

## 18. macOS Status

**Slice A/B/C/D cumulative macOS arm64 validation is NEXT，尚未执行、未豁免。** 需要在原生 Apple Silicon 执行同一 runner、三态真实数据、keyboard/focus/locale、窄窗、ASAR/native 和 cleanup；不能借用旧 Foundation gate，也不能宣称 Source Browser 跨平台完成。

本轮没有 Windows-specific clipboard workaround；Copy 功能延期，macOS clipboard 状态 pending。已有源码/fixtures/runner 参数可复用；收到独立授权后执行累计 gate，完成 review + Mac gate 前不进入 Slice E。

## 19. Known Limitations

- stale 只保留旧内容并阻止新结构读取，Reload UX pending；LOCATION_MISSING UX pending；不提供 History/跨 revision restoration。
- Copy Pointer 可选功能延期，Windows 权限拒绝；built/packaged/macOS clipboard 未通过，不能因 dev 可见按钮假定功能成立。
- 大来源读取受既有 parser/work/resource budgets；long segment 一次只读 4096 code points，不保证任意 huge scalar 可用。
- 没有 screen reader/manual platform gate、FPS/RSS/冷启动 SLA、发布签名/公证或安装器。

## 20. Final Diff

新增 browser/NodeBrowserController、model、SourceHeader、Breadcrumb、ChildrenTable、ScalarValueView、NodeBrowser、Inspector，Node Browser smoke harness 与 controller/real-adapter tests。AppShell 接入新中央/Inspector、移除过时 SourcePlaceholder；WorkspaceController 创建 browser；SourceSession 增加 root scalar / validated / guarded stale。

Renderer smoke bootstrap、Main 临时 fixtures/原生键盘/截图与 smoke-worker gate 扩展；messages en/zh-CN 增加正式消息；同步 README、PROJECT、STATUS、ARCHITECTURE、ROADMAP、PERFORMANCE、DEVELOPMENT-PROCESS、docs README 和本报告。未改 dependencies/lockfile/RawDataService/ADR。没有提交或建分支。

## 21. Cleanup

外部数据全程只读，临时 mutation 只在应用 runner fixture；每态正常/失败路径均清理所属进程树和临时目录。最终 app HEAD 保持 8daa7808bbe88449791a34479166e7217251c67f，仅本轮可审查源码/文档 changes；未提交、未建分支。external HEAD/status/六样本指纹与三态前后结果一致，外部 status 为空；最终 process inventory 无项目 Node/Electron/RefAtlas 进程，TEMP 中无 refatlas-* fixture/run 目录。系统 proxy registry 保持 ProxyEnable=0 / ProxyServer 空，未改全局配置；公开联网仍只经 shell 7890 显式代理。截图/JSON/build/package 为 ignored review evidence，不提交大型产物。没有更改全局 npm/git/system proxy；本轮 shell 明确使用 127.0.0.1:7890。
