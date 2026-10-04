# Phase 2 Source Browser Slice E：Change / Reload / Integration

日期：2026-10-04（UTC+8），Windows x64。依据用户指定的 Slice E prompt 与明确批准的实施计划；遵守 ADR-0007–0010。本报告不授权下一阶段。

## 1. 执行摘要

Slice E 已实现 active source polling、唯一 SourceSession stale、显式 Reload、新 revision 同 Pointer 恢复、application-level LOCATION_MISSING 和 Return to Root。仅恢复 current Node Pointer，没有 logical entity inference。

Windows A/B/C/D shared watcher regression 已在 Slice E production 修改之前关闭：定向 82 项通过，修复 Explorer keyboard smoke 时序后，单次 11 阶段 preflight exit 0、production build 恰一次。最终版本单次 11 阶段 Windows native runner exit 0、production build 恰一次：230 ordinary tests、独立真实数据、dev/built/packaged、native/ASAR/Renderer-only guards 全部通过。Mac 新 diff targeted regression required / pending。

没有新增 dependency、RawBridge/IPC/RawCode、parser/search/index、安全权限或数据集语义。普通产品与 smoke 窗口改用 Electron 默认后台节流，三态原生证据确认 Page Visibility 能表达隐藏/最小化；底层 watcher/RawDataService 未修改。

## 2. Windows preflight 回归关闭

基线 HEAD `2abb3107f8951084c14e243ac959225b0dacb42d`；应用工作树干净。Windows win32/x64、Node 24.21.0、npm 11.16.0。

`raw-directory`、`raw-lifecycle`、`source-session`、`node-browser` 定向 82 项通过，包括无变化 watcher hint、实际 mutation、release/reacquire、same-address retirement barrier、共享 watcher owner 和 workspace reset。首次普通沙箱因 esbuild 父目录读取限制未启动，获准本机执行后通过；不属于产品失败。

首次完整 preflight 前六阶段通过，第七阶段 dev 的 UP_DOWN_RETURNS_CHILD 失败，exit 1，生产构建次数 0。检查发现 Main 发出 Down 后立即断言，Renderer 的 tick 不保证 native input 已交付。最小修复为 Up 和 Down 分别等待实际 DOM focus 与 ExplorerController.focusedId，删除固定 20ms 等待。分类为 test harness 时序缺陷；未改产品键盘行为、timeout 或 watcher。

修复后先执行定向 dev smoke，通过；随后完整 `npm run validate:foundation -- --real-data` 在单次 invocation 全部 11 阶段 exit 0，202 ordinary tests、独立只读 real-data、dev/built/packaged 与 native/ASAR guards 均通过，production build 恰一次。证据为 ignored `artifacts/slice-e-preflight-fixed-runner.log` 与 `artifacts/slice-e-preflight/`。此前失败保留于 `slice-e-preflight-runner.log`，不拼接两轮结果。

因此 A/B/C/D normal Source Browser browsing path 在当前基线 revision 已有 Windows x64 与 macOS arm64 原生验证；不将该结论套用于 Slice E 新 diff。

## 3. 基线与仓库状态

应用仍在原分支、原 HEAD；没有 commit、branch、fetch/push 或远程操作。外部 TurnBasedGameData HEAD `724b139d8c9c32d12552eb95745a4fee72bfe48b`，status 空。package/lockfile 未修改。

普通沙箱使用不同 Windows 账户，系统代理查询返回 disabled；没有依据该结果联网。获准本机只读复核确认实际用户 ProxyEnable=1、ProxyServer=127.0.0.1:7890，端口可用。本机 runner 网络访问使用进程级 HTTP(S) 代理与 localhost bypass，未永久修改系统/npm/git 配置。调查中误调用一次不能配置本机代理的 web search 工具，仅返回 Electron 文档索引；没有据此下载或改变应用。该调用不满足仓库代理规则，后续仅依据本地 Electron types 和原生证据。

## 4. 本轮范围

完成 generic Source Browser change/recovery 生命周期；保留 Renderer → typed narrow Preload → Main → Utility Process → RawDataService。外部仓库全程只读，所有 mutation/delete fixtures 位于 app-owned temporary directories。

不包含 Search、SQLite search index、Dataset Contract、References、Graph、Tabs、History、Pin、Compare、Diff、Copy Pointer、raw editing 或视觉 redesign。

## 5. 外部变化监控

SourceSession 只轮询当前 active source 的 getSourceInfo。每次 settled 后约 1000ms 调度下一次，不使用重叠 setInterval，不扫描 workspace，不 hash/parse source。可见即工作，失焦继续；隐藏/最小化清 timer 并 abort poll，恢复可见立即检查。旧取消请求尚未 settled 时，立即检查排到其完成之后，仍至多一个 poll。

AppShell 只传 document.visibilityState 并管理监听；Session 管 timer/request。activation、reload、reset、dispose 停止旧 polling；新 active 成功后重新建立 eligibility。普通 poll 错误不清 view、不替换用户错误，后续继续检查。不同 revision 的信息只使旧 view stale，不静默混入新 metadata。

## 6. Stale 生命周期

SourceSession 是唯一 stale truth。poll stale info / SOURCE_CHANGED / revision mismatch，以及 readNode、children、segment 的 SOURCE_CHANGED，均通过 source/revision guard 标 stale。保留旧 rendered scalar/children/segment、metadata 和 selection；新结构读取、Breadcrumb、分页和 Open Node 被禁止。用户可查看旧内容，没有自动 Reload。

## 7. Reload 事务

SourceSession.reload 复用既有串行 source intent drain：reloadSource → readNode(root, new revision) 验证 → 发布新 active。成功的 same-address reload 不 release 自己的新 registration；失败/取消的候选在现有串行清理屏障内 release，保留旧 stale presentation。文件缺失、不可访问、invalid JSON 不发布 fake revision。

NodeBrowserController.reload 的 promise 等待 Session 和位置恢复，重复调用合并；UI loading/disabled 覆盖事务。新 source/workspace 意图使旧事务失效；旧 promise/finally 不会清理新事务。

## 8. 同 Pointer 恢复

同 source revision 更替时只捕获已提交 current Node Pointer；pending navigation 不作为目标。非根位置 readNode 使用新 revision；根位置复用 Session 已验证的新 root，再请求第一页/段。

只恢复 current Pointer；selection、page、cursor history、scalar segment、parent context、scroll 均不恢复。Controller 清空旧 revision payload/range/cursors，组件以 revision 为 key 重建可滚动 value/table；Inspector 回到新 current Node。不存在任何 AvatarID/字段/value/相似度匹配。数组插入后旧 /0 仍读 /0，即使原 id 移到 /1。Logical entity inference：**No**。

## 9. LOCATION_MISSING 行为

只有 recovery 目标 readNode 的 NOT_FOUND 可进入此应用状态；再次 getSourceInfo 确认同一新 revision 仍 current 后，展示 LOCATION_MISSING，保留原 Pointer，不显示旧 revision Node，也不自动跳根。用户点击 Return to Root 才打开 `""`，初始化第一页。

Raw protocol 仍是 NOT_FOUND，没有新增 LOCATION_MISSING machine error。文件可能在 verify/open 间消失，额外 metadata 复核会返回 stale/错误，此时进入 stale/recovery error，不能伪装为位置消失。此边界仍依既有 stat 检测，不宣称 strict snapshot isolation。

## 10. Controller 与状态所有权

WorkspaceController 管 workspace lifetime/dispose；ExplorerController 管目录树；SourceSession 管 source acquire/release/stale/reload/monitoring；NodeBrowserController 管 Node、bounded page/selection 和位置恢复状态；components 负责 presentation。Session 不理解 Pointer/table/Inspector，没有合并为大 controller。

## 11. 竞态与取消处理

Session 延续 epoch/lifetime、AbortController 和串行 drain；poll 捕获 source/revision/epoch/lifetime，过期结果不能提交。NodeBrowser 延续 RequestQueue(1)、epoch/revision/source 检查，旧 request/result/finally 不覆盖新状态。重载候选先 settled/cleanup 后处理最新 source intent；跨 source 的旧 recovery 不阻挡新 source Reload。

确定性覆盖 poll/reload 的 source/workspace switch、重复 reload、旧 revision 请求迟到、pending navigation 与 committed Pointer 的区别，以及旧 SOURCE_CHANGED 不使新 source stale。

## 12. 本地化

en/zh-CN typed catalogs 增加 Reload、Reloading、location missing、Return to Root，更新 stale 告知；Reload error 带操作上下文和 localized 前缀；NOT_FOUND 明确表达源文件消失；位置恢复错误另有 localized 上下文，其余复用 RawError mapper。ARIA/title 经同一层。raw key/string/number lexeme/path/Pointer/revision/code 原样保留。

实际 UI 在 Stale、LOCATION_MISSING、Reload error 下连续切换语言，保持 Session/Node state、raw payload、Pointer、error 和 Inspector open/collapse；没有页面导航、BrowserWindow reload 或 Session reset。

## 13. 新增与扩展测试

SourceSession deterministic fake-timer/deferred 回归：no overlap、hidden/resume、普通 error、stale/mismatch、dispose cleanup、旧 poll、reload 合并、source/workspace switch、validation failure/candidate cleanup/retry。

NodeBrowser + real RawDataService temporary fixtures：实际 polling mutation、同 Pointer 新值、missing/Return Root、array insertion 不迁移、deleted/invalid JSON、page/selection/context/cursor reset、scalar segment restart、文件在 recovery 期间消失，以及旧 revision/source/workspace completion。ACCESS_DENIED 使用明确 bridge failure 注入，不冒充 Windows ACL native 验证。

ordinary tests 当前 230 passed / 1 opt-in real-data skipped，types 0 errors / 0 warnings。新增及扩展参数化普通测试净增 28 项，按风险组织，测试数量不作为质量指标。三类 request-time stale 均通过真实 RawDataService fixture 验证；既有 mock race/error 与 raw lifecycle 回归保留。

## 14. 真实数据验证

六代表路径保持：AvatarConfig、EquipmentConfig、AvatarSkillConfig、TextMapCHS、P10401_F10401001_Baked、SoundBankLookUp。真实仓库只读，stale/reload mutation 不在真实仓库制造。独立 gate 与三态浏览沿用既有 production path，前后核对 HEAD/status 与样本 SHA-256/size/mtime。

preflight、最终独立 real-data、最终三态 UI 和收尾独立 streaming fingerprint 均 unchanged。外部 HEAD 保持上述值、status 空；六来源 SHA-256、size、mtime 与 preflight 完全一致。详情保留在 artifacts/slice-e-validation.json，未解析真实数据副本或向外部仓库写入。

## 15. Dev / Built / Packaged 验收

最终版本在 10:32–10:34（UTC+8）单次运行 npm run validate:foundation -- --real-data，全部 11 阶段 exit 0，production build 恰一次。证据：artifacts/slice-e-final-runner.log、slice-e-validation.json，以及本轮 foundation-{dev,built,packaged}-win32-x64.json；measuredAt 分别为 02:33:20、02:33:56、02:34:35 UTC。

| 阶段 | 本轮结果 |
| --- | --- |
| 1 i18n offline compile | PASS，实际网络请求 0 |
| 2 format:check | PASS |
| 3 typecheck | PASS，0 errors / 0 warnings |
| 4 ordinary test | 230 passed / 1 opt-in real-data skipped |
| 5 docs:check | 37 Markdown / anchors PASS |
| 6 test:raw-data | 独立 gate PASS |
| 7 dev smoke | PASS |
| 8 production build | PASS，恰一次 |
| 9 built smoke | PASS |
| 10 builder | Windows x64 ASAR 目录包 PASS |
| 11 packaged smoke | PASS，包括 normal guard |

前一轮 10:28 完整 runner 也曾通过，保留于 slice-e-interim-complete-runner.log；随后复核补充恢复错误文案和三类真实 request-time stale，已重新验收最终版本。不将前一轮结果拼入本轮。

普通产品与 smoke 从创建时统一使用 backgroundThrottling=true（Electron 默认值）。常规 smoke 改为与产品一致的初始可见窗口，guard smoke 隐藏。初始隐藏 smoke 即使 true 仍在 minimize 后报告 visibility=visible；初始可见的定向 dev 已通过真实 minimize/hide/resume，不以 controller boundary 假造 native 结论。

三态均实际证明 sandbox=true、contextIsolation=true、nodeIntegration=false、console errors=[]；每态浏览六代表真实来源。packaged SQLite 三轮均 nativeUnpacked/cleaned=true；ASAR 实际清单的 runtimeOnly、externalDataExcluded、nativeUnpacked、compilerExcluded、pluginCacheExcluded、catalogsRendererOnly、explorerRendererOnly 全 true；normal packaged diagnostics denied，未暴露 harness。没有签名、发布或扩大 permissions。

已查看本轮 dev/built/packaged 正常/窄窗及 stale、LOCATION_MISSING、Reload error 截图：primary Reload、disabled reads、缺失 Pointer 与 Return to Root、新 revision Inspector、文件消失 localized error、旧 scalar 保留均清楚可见。窄窗使用内部表格水平滚动/Inspector 垂直滚动，无 shell 溢出。截图为 artifacts/node-browser-{dev,built,packaged}{,-narrow,-stale,-location-missing,-reload-error}.png。

## 16. 性能与资源观察

每个 poll 只进行 active source metadata 检查；~1s 是 engineering cadence，不是 SLA。parser queue、work/IPC budgets、单页 100 children、单段 4096 code points、128 cursor metadata 均未变。不控制 OS cache，不比较跨平台性能或引入性能重构。

最终 dev/built/packaged 每种 native minimize/hide 均观察 calls 1 → hidden 1200ms 维持 1 → visible 恢复 2。实际调用窗口 minimize/hide；controller fake timers 独立验证立即调度、迟到取消和无重叠，不能相互替代。

Renderer JS 从 preflight 519309 增至 545478 bytes（+26169），gzip 103852 → 107587（+3735）。最终 app.asar 1517026 bytes，win-unpacked 合计 413748992 bytes；未在 preflight 保存 package size，不制造同基线差值。包含显式 smoke harness，不将 bundle 大小解释为产品延迟。

## 17. 失败分类与修复

| 失败/发现 | 分类 | 修复/证据 |
| --- | --- | --- |
| esbuild 父目录 access denied | 环境/sandbox | 获准本机执行，没有调整产品安全配置 |
| preflight UP_DOWN_RETURNS_CHILD | test harness | 分别等待 Up/Down 的实际 focus/controller，定向与完整 preflight 通过 |
| 新 test 缺少 vi import | test harness | 修正 import 并完善 fixture dispose；回归通过 |
| 最小化仍 visibility=visible | 窗口配置 / smoke 初始隐藏 | 默认后台节流启用；runtime toggle、创建时 true 的隐藏窗口均复现；失败证据 minimized=true / visible=false / document=visible。改为与产品一致初始可见后定向 dev 通过 |
| 最终 runner format gate | 格式化漏项 | source-session test 受管格式修正；此前失败 exit 1、无 production build |
| 最终 runner dev visibility gate | test harness / 原生观察 | 保留失败 log；先记录窗口诊断再验证上述新假设；此前失败 exit 1、无 production build |
| 跨 source 的旧 reload promise 阻挡新 reload 风险 | controller race | 切换 lifetime 时解除旧 coalescing，仅相同事务 finally 清自身；deterministic regression 通过 |

没有机械重试、扩大 timeout、新增 Raw protocol 或修改 watcher。第一轮 visibility smoke 失败不计通过。

## 18. 剩余限制

仍是单窗口/source owner、stat-based change detection；恶意同-stat 修改、网络盘、strict snapshot isolation、任意巨大 scalar、完整 accessibility audit、Copy Pointer、签名/公证/正式发布均未验证或未实现。poll error 不主动销毁 view，服务恢复后继续检查；用户可通过既有 workspace 生命周期恢复。

## 19. 跨平台状态

| Target | A/B/C/D 基线 | Slice E 新 diff |
| --- | --- | --- |
| Windows x64 | preflight native closure 完成 | IMPLEMENTED / native full gate VALIDATED / AWAITING REVIEW |
| macOS arm64 | 已有 cumulative PASS WITH FIXES | 未执行 native targeted regression |

旧 Mac gate 不覆盖新 Renderer lifecycle 或 backgroundThrottling 配置。

## 20. macOS 回归要求

**Yes。** 至少原生 targeted 验证 polling、minimize/hide/resume、same Pointer reload、LOCATION_MISSING/Root、file-level failure、locale continuity 与新 UI。没有修改 macOS-sensitive watcher/path/fs、RawDataService、parser 或公共协议，因此不因本 diff 强制再修 watcher；窗口后台节流是 shared Electron 行为，需 Mac 原生验证。不能用 Windows 自动测试或此前 Mac gate 宣称新 diff 已完成跨平台验收。

## 21. 最终 diff

生产：Renderer SourceSession/NodeBrowserController、recovery UI、AppShell visibility/Workspace dispose、en/zh catalogs；Main 普通窗口后台节流。测试/harness：SourceSession/NodeBrowser/localization tests、Explorer native key synchronization、三态 NodeBrowser recovery/visibility 和 smoke result guards。文档：本报告及必要权威文档/索引。

RawDataService、RawBridge、Preload、parser、package/lockfile、ADR、安全权限与外部数据未修改。最终共 27 文件：26 个已跟踪文件修改及 1 新增本报告；其中 production 11、tests/harness 6、文档 10。生成目录与 artifacts/dist/out 仍 ignored。

## 22. 清理

所有 mutation/delete 在 runner 或 test-owned temp fixtures；runner 清理所属进程树和 verified temp boundary，Session/组件清理 timer/listener/request。JSON/log/PNG/build/package 保持 ignored，不提交大型产物。

10:35 收尾独立 streaming hash/size/mtime 与 HEAD/status 复核 unchanged；应用 HEAD 保持 2abb310，外部 status 空。Get-CimInstance 查询本项目 node/Electron/RefAtlas 进程为 0；实际用户 TEMP 的 refatlas-* fixture 目录为 0；未删除或终止无关用户资源。最终 runner format/types/tests/docs 全过；报告事实补齐后再次检查 docs links、format 与 git diff --check。没有 commit/push/PR。

## 23. 建议下一步

本轮已停止实现，等待 review 和 macOS arm64 targeted regression。generic browsing foundation 功能完成不等于整个 Phase 2 或未来功能完成；跨平台 Slice E 验收保留 Mac pending。Search、Dataset Contract、References、Graph、Tabs、History、Compare/Diff 等仍需独立授权，不自动进入下一阶段。
