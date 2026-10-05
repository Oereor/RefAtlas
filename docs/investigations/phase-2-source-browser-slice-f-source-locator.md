# Phase 2 Source Browser Slice F：Workspace Source Locator

日期：2026-10-05（UTC+8），Windows x64。应用基线 `c6e88cacab4669582563ad832353f0c0bd2728e6`（Revise application architecture），起始工作树干净。用户明确批准 Slice F 调查、production implementation 与本机验证；不授权后续 slice。

**Source Locator：IMPLEMENTED / AWAITING REVIEW。Windows x64 必要 gates 累计通过，production build 恰一次；完整runner曾在旧可见性gate失去窗口focus后失败，复用同一build恢复built/package/packaged通过，详见第13节。macOS arm64 validation = NOT YET RUN。** 不借用A–E历史平台证据。

## 1. 范围与架构调查

已阅读 AGENTS、PROJECT/ARCHITECTURE/STATUS/ROADMAP/DEVELOPMENT-PROCESS、ADR-0007/0010/0011、Slice A/C/E 与 Search scope closeout。现有 RawDirectory 提供单目录 snapshot/paging，RawDataService 持有 canonical root/generation，metadata queue 两槽、parser queue 单槽；resolveRawPath 逐组件 lstat、realpath confinement 与 file/directory 检查可直接复用。SourceSession 是唯一 info/root/commit/release/stale owner；失败 B 保留 A。Renderer requests 提供取消控制、workspace/controller epoch 与有界队列，Paraglide 管 presentation。

Source Locator 只定位 filename / relativePath。没有 JSON 内容 indexing/search、scalar/field/ID occurrence、persistent DB、S1/FTS/trigram、Dedicated Search Utility 或第二套 SourceSession。Explorer 保持 lazy single-directory tree，不过滤整树，不 reveal 未物化祖先。

## 2. 窄调查与方案选择

外部只读 TurnBasedGameData path-only probe：137,916 JSON，15,212 directories，153,129 direct entries，排除 1 个 `.git`，链接 0，最大路径 UTF-8 162 bytes，总路径 10,111,116 bytes。逐 child lstat、目录前后安全复核耗时 16,977.05ms；比较键生成约 17ms；raw/key/base object JSON 约 28.44MB，非 GC-controlled heap 增量约 50.35MB。event-loop p99/max 10.67/14.93ms；该数字不包括随后单次同步 query 的阻塞。

probe 查询 AvatarSkill/MonsterSkill/TextMapCHS 分别 13/4/1 项、约 9.45/11.28/7.44ms；json/Config/a 取 top 50，完整 envelope 约 10.5KB。另一次同进程 traversal 下 production RawDataService directory 77–89ms、AvatarSkill acquire 0.38–0.42ms、root 907–956ms；无 traversal 对照 92/1.02/955ms，所有调用成功。没有读取 JSON 来构建路径 catalog；内容读取仅来自正常 SourceSession 等价 activation 验证。没有控制 OS cache 或建立 SLA。

选择工作区打开后异步建立，避免第一次 Quick Open 等待完整遍历。最终使用 Raw Utility 内一个 Node builtin worker 执行同步 metadata I/O，每64项 yield；不增加进程、依赖或 background framework。production 另有全 visited-directory 发布前复核、metadata 计费与查询 yield，不能用 probe 成绩冒充最终性能。

## 3. Catalog ownership 与接口

RawDataService 内部 RawSourceCatalog 持有 workspace-lifetime path metadata。每项为原始 path/name 与 locale-independent lowercase key/base；workspaceId 存在 shared build context，不保存 JSON、Pointer 或 source revision。

`locateSources({requestId, workspaceId, query, limit, catalogGeneration})` 返回 workspaceId/catalogGeneration/query、building 或 ready、items `{name, source}`、truncated。初次 generation 可为 null；指定旧 generation 为 STALE_CURSOR。`refreshSourceCatalog({requestId,workspaceId})` 立即返回新 catalog generation，后台重建。两者走固定 RawCommand、exact input/result validation、可信 Main frame/URL、Preload、broker wire ID/owner/timeout/cancel 和 MessagePort；没有任意路径或预算修改入口。请求 16KiB、完整 response 64KiB 不变。

building 成功响应只有空 items/truncated=false，是明确准备状态；失败走现有 RawResult/RawCode，不冒充 0 results。Raw lookup/rebuild 任务没有 sourceKey，不进入 acquire/control/watchers，真实数据全部返回项在 acquire 前 release=false。

## 4. Filesystem 与完整性

opendir + child lstat，不 follow symlink/junction/special files，只接受 regular exact `.json`，保留原始 Unicode/case/spelling。各层 `.git` 大小写变体均在 child metadata 操作前排除，其他 hidden directories 不忽略。目录安全解析、地址预算与 relative-path 验证复用现有 helper；activation 仍独立重验路径和 regular-file 要求。

每目录前后 dev/ino/size/mtimeNs/ctimeNs stamp（排除 atime）；发布前再次安全解析并复核全部 visited directories。任何已知变化、目录消失、权限或资源失败都丢弃整次 entries；稳定 code + localized catalog operation context 提示显式刷新重试，无自动重扫循环。source contents 在扫描期间变化不会被当成路径完整性错误，最终 activation 负责当前来源校验。

最终实现由 RawDataService-owned catalog 启动一个 worker thread，复用 resolveRawPath 同一逐组件 lstat/link、realpath confinement 和 stat 类型策略的同步 helper。worker 逐目录 opendirSync/readSync/child lstatSync，目录前后及全部 visited 最终复核，每64项 yield，最多一个目录 handle。主 Utility event loop 不执行同步遍历，普通 IPC 与 parser/metadata queues 保持可用。

worker 每包最多64项且完整 packet ≤64KiB，发送后等待 owner ACK，最多一个在途 packet。owner 只在 building 私有 entries 中积累；最终复核成功、worker 实际退出且代次仍有效才发布 ready。失败清空全部条目。SharedArrayBuffer/Atomics 加 cancel message 唤醒 ACK 等待，每个 I/O/await 边界复核取消/时间；旧 worker finally 关闭 handle、退出后才启动下一代。计费固定1MiB临时 packet/clone/路径/metadata余量，Worker runtime基础开销不计入accounted，owner heap与整体进程RSS另报。Main 只通过已有 bootstrap handshake 传入 Vite 编译的 worker 绝对路径，不持有 canonical workspace root、不进行扫描，也不暴露 Renderer path/worker 入口。
这是完成 traversal 的 best-effort metadata snapshot，未证明 filesystem atomic snapshot、恶意同-stat 修改、网络盘或任意 TOCTOU 严格隔离。OS 单次 metadata syscall 不可硬中断，返回后检查取消/预算；与既有 Raw discovery 相同边界，不扩大安全策略。

## 5. Build / freshness / cancellation

open 成功后生成 catalog，setImmediate 后开始，open reply 不等待遍历。单 build 不占 parser/metadata queue；每次异步边界复核 current build 与 AbortController。刷新同步失效旧 generation，旧 handle finally 完成后才开始新 build；workspace switch/close/reset/dispose 取消、移除 catalog 并等待扫描收尾，旧结果不能发布。

catalog 无 TTL、持久存储或全工作区 watchers。关闭 Locator 只取消 query/poll，不取消共享 build；重新打开复用该 catalog。外部 new/deleted paths 通过 Locator 的“刷新文件列表”获得新列表，与 Explorer refresh 独立；过期路径的 activation 失败保持旧 active source。新 workspace 总是建立新 catalog。

## 6. Matching 与结果边界

原 query 不 trim、不 locale rewrite、不 NFKC；comparison 仅 toLowerCase literal。ranking：basename exact（含 `.json`）→ basename prefix → basename contains → relativePath contains → 原始 relativePath UTF-16 code-unit tie-break。没有 fuzzy/regex/glob/pinyin/AI。真实 AvatarSkill/MonsterSkill/TextMapCHS names 与此规则一致。

query 单遍维护 top-N；默认/最大 50，不为所有 matches 建数组或全排序。精确 envelope byte guard 可进一步缩减，存在更多 matches 时 truncated；单项无法容纳为 RESOURCE_LIMIT/RESPONSE_BYTES。空字符串不匹配/返回路径，UI 显示输入提示；没有 totalMatches、分页、spool、recent/history。

## 7. Resource limits

| 保护 | 默认值 |
| --- | --- |
| JSON sources / scheduled directories / scanned dirents | 1,000,000 / 100,000 / 2,000,000 |
| Accounted catalog / traversal metadata | 128MiB |
| Build work / query work | 60s / 1s |
| Build / query yield cadence | 64 / 1,024 entries |
| Active build / open directory handle | 1 / 1 |
| Result items / request / full response envelope | 50 / 16KiB / 64KiB |
| Path address | 现有 serialized 4KiB |

计费包含 raw/comparison UTF-16 strings、192-byte entry object 余量、stack/visited/path/stamp 元数据与其他余量；单调计费 traversal 高水位，不等于实际 JS heap/RSS，ready 后 visited metadata 可回收。与 256 acquire source cap 独立。超过预算明确失败，不悄悄漏来源。工程起点不是永久规模 SLA。

## 8. Renderer 与 activation

WorkspaceController 持有 SourceLocatorController。input/refresh 是 latest-intent 串行 drain，取消旧请求并等待 settled，再执行最新意图；workspace/request epoch 与 catalogGeneration 防旧 result/finally 污染。每 keystroke 无 source handle。building 状态只在 dialog 打开时约 250ms poll；ready 后查询最新 query，不 replay 中间输入。无 debounce。

每次打开清空 query，Escape/关闭按钮只关闭 Locator，恢复原 DOM focus，Explorer/Node/Inspector/session 内容不变。选择有效 result 立即关闭，再调用唯一 SourceSession.activate；pending 与失败继续由现有 NodeBrowser presentation 显示，invalid JSON/不存在等失败保留旧 active。正常 source switch 后已物化 Explorer entry 的 active indicator 自然更新。

## 9. UI / keyboard / localization

工具栏显式 Quick Open、Ctrl/Cmd+P（始终 preventDefault，仅 workspace open 时打开）；AppShell 生命周期注册/清除 Renderer handler，preventDefault，无 Main/Menu accelerator 改造。native dialog、named combobox、listbox/options、aria-selected/active-descendant、busy 与 polite status。输入获 focus，上下键有界移动、Enter/click 激活、Escape 关闭；Tab/Shift+Tab 环绕 dialog 的 input/buttons。options 不进入 Tab 顺序，mouse down 保持输入 focus。

en/zh-CN 集中 typed catalogs 提供标题、输入/placeholder、结果 label、building/empty/truncated、refresh、关闭、快捷键与 catalog error context。locale runtime switch 无导航，query/raw paths/items/focus 保留。无 UI library 或 dependency 变更。

## 10. Tests

新增 source-catalog/source-locator 行为测试：nested/duplicate/hidden/.git、junction confinement、regular exact suffix、raw names、无内容 open、确定 ranking、case-insensitive/path matching、空 query、wide bounded/full envelope shrinking、资源失败、observable directory change/rebuild、旧代次/query cancellation、active handle close、workspace close、无 source registration。

Renderer 回归覆盖 latest intent/drain、building polling、关闭/reopen/workspace switch、error/truncated/refresh、selection bounds；真实 RawDataService + WorkspaceController integration 覆盖取消保持 Explorer/Node/session、invalid JSON 保留 A、选择 B 根读取成功。localization message tests 与 native raw continuity 分开。

首轮新增/既有定向测试：62 项通过。完整普通测试：250 passed / 1 opt-in real-data skipped，typecheck 0 errors/0 warnings。旧 directory/lifecycle fault-injection fixture 增加等待 startup catalog 收尾，避免一次性 filesystem mocks 被独立扫描消费；没有关闭 production eager scan 或更改 watcher policy。

## 11. Production real-data measurements（早期串行版与最终worker版分列）

独立 gate `2026-10-05T11:59:21.159Z`（UTC），exit 0。137,916 sources / 15,212 directories / 153,129 scanned entries，`.git` excluded=1、links=0、pathTextBytes=10,111,116。包含最终目录复核与正常 Raw 访问并发的 build 为 34,360.20ms，accounted metadata 95,590,986 bytes。

| Query | 返回项 | ms | 完整 envelope bytes | Truncated |
| --- | ---: | ---: | ---: | --- |
| AvatarSkill | 13 | 18.09 | 2,363 | false |
| MonsterSkill | 4 | 9.27 | 906 | false |
| TextMapCHS | 1 | 9.96 | 404 | false |
| json | 50 | 80.70 | 10,327 | true |
| Config | 50 | 37.67 | 9,969 | true |
| a | 50 | 20.12 | 10,362 | true |

取消约 1.00ms，lookup parser calls=0；catalog 模块仅 import metadata APIs，临时测试直接拒绝 fs.open 并通过。JSON 读取来自既有六 source 正常 Raw gate，不是路径扫描。全部 root/ExcelOutput/Mission discovery 与六 source 的 lossless/range/root 检查发生于 building 且成功；AvatarSkill 根约 1,027ms，TextMapCHS 根约 2,454ms，不因 catalog 占住 scheduler。

gate 进程 heapUsed 起止 14.55→71.56MB、RSS 64.20→240.85MB/maxRSS 236,524KiB，含 Vitest、parser/range/cache、指纹、目录分页与 GC，不是独立 catalog memory；无 forced GC/OS cache control，不做冷读、跨平台或 SLA 声明。ignored `artifacts/raw-real-data.json` 保存完整紧凑数据。

早期串行版 runner 的 real-data 阶段在约 60s 触发 CATALOG_BUILD_MS，整次 catalog 丢弃，未进入 production build。检查扫描执行路径及进程状态后，以瞬时 I/O 波动为待验证假设；未改代码/预算的独立一次复测在 UTC `2026-10-05T12:14:09.616Z` exit 0，build 55,058.85ms，accounted/规模/payload 不变。六查询依次为 19.57/12.13/15.00/70.80/28.50/16.02ms，取消 0.64ms，lookup parser calls=0。heapUsed 14.56→80.81MB、RSS 64.18→246.19MB/maxRSS 246,172KiB；三目录 4.86/302.21/224.19ms，六来源仍全在 building 下完成，AvatarSkill/TextMapCHS cold root 1,607/4,303ms。根因未隔离，60s 接近该轮实测，不保证慢盘/负载下完成，RESOURCE_LIMIT 必须显式刷新恢复。失败与复测日志分别为 `slice-f-final-runner.log`、`slice-f-real-data-retry.log`，前一轮数字不覆盖这次失败。

最终版本完整runner的 real-data 阶段 UTC `2026-10-05T13:44:56.49Z` exit0：worker build **23,838.06ms**（含启动、metadata I/O、ACK、最终复核、退出），accounted **96,639,306bytes**；sources/directories/dirents/路径文本与探针一致。AvatarSkill/MonsterSkill/TextMapCHS 为13/4/1项，18.97/16.81/14.30ms，2,363/906/404bytes；json/Config/a 为50项且truncated，79.48/40.28/22.86ms，10,327/9,969/10,362bytes。query取消1.02ms、lookup parserCalls=0，发现来源 release=false。

最终gate同进程 heapUsed 16.84→82.60MB、RSS76.79→341.91MB、maxRSS457,040KiB；heapUsed只覆盖owner线程，RSS/maxRSS包含worker线程、Vitest、正常parser/cache、fingerprints和GC。accounted预算是metadata保护，不是RSS上限，也不是worker V8基础开销。root/ExcelOutput/Mission全在building下完成，3.92/360.02/300.87ms；AvatarSkill/TextMapCHS根1,804.20/5,877.24ms，前四样本在building，其余两样本已ready，全部成功。没有无catalog的受控最终对照，不宣称无性能影响、冷盘或SLA。Node gate使用production扫描引擎/worker和RawDataService；Electron真实IPC查询与native平台流程另列下一节。

## 12. Dev / built / packaged

定向 dev smoke 首次在旧 RAW_BRIDGE_SURFACE 精确白名单失败，新增两条已授权方法后通过（`2026-10-05T12:01:52.517Z`，UTC）。真实 native Ctrl+P 被 Renderer preventDefault，beforeprint=0；输入focus、Up/Down、Enter、Escape、click、refresh、invalid JSON 保留 A、自然 active indicator、locale/raw continuity 与正常/900×600 layout 均通过，console errors=[]。dev capturePage 正常/窄窗均人工检查，dialog/status/selected/滚动布局健康。

本机无 agent-browser CLI；按仓库既有 Electron capturePage/native input/console guard 路线验收，没有安装浏览器依赖或用 standalone web 页面冒充 Electron。最终 native gate 额外验证了Tab cycle、三代表真实source locator activation、built/ASAR packaged与普通packaged diagnostic guard；结果在下节。

## 13. 最终 Windows native gate

最终worker版 `npm run validate:foundation -- --real-data` 执行到第9阶段：offline compile、format/type、252 ordinary passed / 1 opt-in skipped、docs、real-data、dev及唯一production build通过。built首次在既有NodeBrowser monitor-visible失败，记录visible=true/minimized=false/focused=false/Renderer hidden；当时尚未进入Locator，不是扫描/快捷键错误。完整invocation exit1，不能宣称单次11阶段exit0。日志 `artifacts/slice-f-worker-final-runner.log`。

保留同一生产输出、阈值、安全和backgroundThrottling=true，通过 `validationSteps(...,true).slice(8)` 恢复built/builder/packaged三阶段，exit0，日志 `slice-f-worker-native-resume.log`；没有第二次production build或产品源码改动。独立Windows foreground观察/辅助只匹配本仓库exe，忽略hide/minimize；两次辅助记录focusCount=0，未实际抢焦点，随后收尾退出。复测窗口前台gate通过不等于该宿主失焦根因已隔离，保留这一native harness/环境限制。

| Windows x64 gate | 实际结果 / UTC时间 |
| --- | --- |
| format/type/tests/docs | PASS；252普通通过/1 opt-in skip；0 type/Svelte errors/warnings |
| real-data | PASS；2026-10-05T13:44:56.49Z |
| dev native | PASS；2026-10-05T13:46:22.241Z |
| built native（恢复） | PASS；2026-10-05T13:51:20.913Z |
| builder / ASAR packaged native / normal guard | PASS；2026-10-05T13:53:07.826Z |
| macOS arm64 | NOT YET RUN |

三态真实Ctrl+P `shortcuts=1/prevented=1/prints=0`；native input、上下键、Tab循环、Enter、Escape、刷新/成功/失败结果mouseDown/mouseUp、取消状态/focus恢复、en/zh切换与normal/narrow布局均通过，consoleErrors=[]。各态选择AvatarSkillConfig/MonsterSkillConfig/TextMapCHS后既有SourceSession根与NodeBrowser首children成功；Electron query/IPC/DOM观察依次dev22.8/22.5/22.4ms、built32.1/20.3/21.4ms、packaged25.4/21.5/20.7ms，不是冷盘或纯IPC基准。

六张Locator capturePage截图（`source-locator-{dev,built,packaged}{,-narrow}.png`）已逐一检查；滚动区域、selected outline、输入focus、原始路径、状态与按钮无遮挡。smoke记录nominal900×600窄窗，实际capture受host DPI/最小窗口尺寸影响，不据截图推断CSS像素等于physical像素。安全sandbox/contextIsolation=true、nodeIntegration=false；normal packaged diagnostics denied/probe通过。runtime-only、外部数据排除、SQLite native unpack、compiler/plugin cache排除与locale/Explorer renderer-only guards通过；catalog worker在ASAR内真实运行。

Renderer JS587,502bytes / gzip114,766bytes，相对既有Slice E记录545,478/107,587为+42,024/+7,179。app.asar1,597,652bytes、win-unpacked413,829,618bytes，相对既有1,517,026/413,748,992均+80,626；unsigned dir package，无正式发布。final audit逐字节核对7个生产输出文件（含catalog worker）与ASAR一致，记录各SHA-256；`artifacts/slice-f-final-audit.json`保存结果。后续仅更新docs，不重建已验收的production源码。
## 14. 平台与剩余限制

Windows x64 本轮必要原生gates累计通过，完整runner失焦限制按第13节保留；macOS arm64 **NOT YET RUN**，后续须 Apple Silicon 定向 native gate。没有 cross-compile 或借用 Slice A–E 平台结论。未测屏幕阅读器完整 audit、network fs、strict snapshot isolation、正式签名/公证/发布。

catalog 是 workspace-lifetime 内存 snapshot，初建可能数十秒，明确 building 且普通浏览可继续；外部新增/删除需显式 refresh。大于工程预算的工作区明确 RESOURCE_LIMIT，不自动扩预算；path-only catalog 不证明 JSON 可解析，invalid JSON 在正常 activation 层处理。

## 15. 失败与修正

普通沙箱 esbuild 父目录 access denied，使用获准真实用户本机执行，没有降级应用 sandbox/context isolation。首次类型检查发现 branded DirectoryPath/RelativePath 交叉 narrowing，改为分别按 file/directory 分支验证；options 添加 tabindex=-1 消除 Svelte a11y warning。旧 directory/mock 和 watcher fixture 与后台扫描重叠，等待 catalog startup 后定向全通过，不增加 timeout。

首个 dev gate 精确 bridge whitelist 未增加方法，失败日志保留 `slice-f-dev-preflight.log`；修正后独立 dev exit 0，日志 `slice-f-dev-fixed-bridge.log`。任何旧报告不替代最终 runner。没有机械重复失败、增加无限重试或安全例外。

最终累计 runner 恢复首次在既有 Foundation 响应性检查失败（`slice-f-final-runner-resume.log`），此时尚无工作区/catalog。代码检查发现原 harness 仅在后续 Explorer native input 前显式 focus，而 Foundation 的前台计数测试未保证窗口 focus。将同一 show/focus/webContents.focus 放到非 guard smoke 入口，并为既有错误加入 heartbeat/click/frame/visibility 计数。修改限 smoke harness，backgroundThrottling=true、阈值与 timeout 不变；typecheck 0 errors/0 warnings。以该具体修正验证窗口聚焦假设，不将失败归因于 Locator 扫描。

focus 修正后 Foundation 响应性通过；新增 native Tab gate 在 tab-refresh 停住（`slice-f-final-runner-focus.log`）。Chromium 将可滚动结果容器纳入默认 Tab 顺序，原 controls trap 只处理首尾控件，没排除该隐式 stop。listbox 增加 tabindex=-1，使其保持 combobox active-descendant 管理；options 原有 tabindex=-1。没有隐藏测试、删除 Tab gate 或用合成 keydown 替代 native input。harness timeout diagnostics 改为状态/query/selection/focus 摘要，避免打印 50 条路径。后续 native 结果验证实际循环。

Tab 修正后的 real-data smoke 触发既有 90s 总上限（`slice-f-final-runner-tab.log`），production build 尚未执行。新增真实 catalog 单独已测到 55s，并有60s work guard，叠加旧 native story 后需要额外合法时间；没有观察到相关进程泄漏，runner 自己回收超时进程树。仅 opt-in real-data 的 application/worker/step 上限改为150/180/210s，普通 smoke 仍90/120/150s，packaged normal guard 仍90s。增加 Locator 阶段计时以暴露超时执行位置，catalog/query 的60/1s保护不变。最终测试补全刷新、invalid JSON 和成功结果的原生 mouseDown/mouseUp，不再以 DOM .click() 充当这些操作的 native evidence。

150s 仍超时（`slice-f-final-native.log`），停止继续延长。增加 runner-owned `progress.json`，超时保留有界 stderr（旧 runProcess 超时分支丢弃该诊断），并在 real-data Locator 期间观察 query/status/error、pending source 与 browser busy。`slice-f-dev-progress.log` 显示原六来源阶段本轮约66s、所有 Locator synthetic/native mouse/Tab 阶段约2.4s完成，随后真实 Locator 等待。再为明确 catalog/query error 加 fail-fast，`slice-f-dev-fail-fast.log` 捕获实际失败：dialog 已关闭、status=idle、sessionError=null、browserBusy=true；不是 catalog RESOURCE_LIMIT。新 smoke 用默认3s等待 NodeBrowser 首 children，但既有六来源 gate 按 controller settled 等待。改为同一 completion 模型并检查 browser error，保留 IPC/Raw/runner 截止时间，不改变产品 activation、parser 或预算。

controller-settled 修正后的 native gate（`slice-f-final-native-settled.log`）明确捕获 CATALOG_BUILD_MS，而非 UI 等待问题；这是 serial metadata 在真实 Electron 并发链路的实际资源失败，不能仅按瞬时负载归类。当时采用固定4项 metadata/final verification 批处理（后续试验，最终已由worker方案替代），保持安全解析、单 handle、allSettled 收尾和60s保护；补充取消/刷新等待四个已开始 metadata 的回归，最高 handle=1。类型检查0 errors/0 warnings，四文件定向60项通过。最终完整 runner重新测量该生产修正，不使用此前34/55s成绩冒充新版本。

随后固定并发、目录预备/后验和严格 canonical-directory fast mode 试验仍在真实60s预算内失败；UV_THREADPOOL_SIZE=16 试验没有改善，均未作为最终方案。完整逐组件同步只读探针22,581.61ms成功扫描全部137,916来源/15,212目录，支持使用单worker避免逐次async FS开销并隔离普通IPC。最终worker独立真实gate UTC 2026-10-05T13:39:32.274Z exit0：build29,179.85ms，accounted96,639,306bytes；查询 AvatarSkill/MonsterSkill/TextMapCHS/json/Config/a 分别16.59/11.91/10.65/54.91/23.42/13.21ms，payload与旧版一致，取消0.58ms。普通Node测试worker使用native TypeScript transform和本地resolve hook；production由Vite编译，不依赖该loader。electron-vite嵌套modulePath不支持（dev编译前失败，无production build），改为Main顶层编译worker入口并随bootstrap传入Utility。所有旧serial/pipeline数值只作失败/设计证据，不代表最终production版。

## 16. 文档与 changed files

生产：shared raw 协议/limits/validators、RawDataService 与新增 RawSourceCatalog、固定 Main/Preload command 分派、WorkspaceController/AppShell/Toolbar、SourceLocatorController/dialog、en/zh messages。测试/harness：新增两份 catalog/locator tests、localization、旧 scoped fault-injection setup、真实数据 gate、新 Renderer locator smoke、Main native orchestration、raw bridge/normal-mode guards 与 smoke worker result guards。

文档：本报告、STATUS/ARCHITECTURE/PROJECT/ROADMAP/PERFORMANCE、docs/README 与 investigations/README。package/lockfile/dependencies、parser、accepted ADR 与旧 investigations/evidence/tools 保持原样；generated/out/dist/artifacts ignored。

最终文件清单（应用仓库相对路径）：

- `docs/ARCHITECTURE.md`、`docs/PERFORMANCE.md`、`docs/PROJECT.md`、`docs/README.md`、`docs/ROADMAP.md`、`docs/STATUS.md`、`docs/investigations/README.md`、`docs/investigations/phase-2-source-browser-slice-f-source-locator.md`
- `messages/en.json`、`messages/zh-CN.json`
- `src/shared/raw.ts`、`src/utility/raw-service.ts`、`src/utility/raw-source-catalog.ts`、`src/utility/raw-filesystem.ts`、`src/utility/raw-catalog-scan.ts`、`src/utility/raw-catalog-worker.ts`、`src/utility/raw-catalog-worker-runner.ts`、`src/utility/index.ts`、`src/preload/index.ts`、`src/main/index.ts`、`src/main/data-service.ts`
- `src/renderer/src/components/AppShell.svelte`、`src/renderer/src/components/WorkspaceToolbar.svelte`、`src/renderer/src/state/workspace-controller.ts`、`src/renderer/src/locator/source-locator-controller.ts`、`src/renderer/src/locator/SourceLocator.svelte`
- `src/renderer/src/env.d.ts`、`src/renderer/src/main.ts`、`src/renderer/src/raw-smoke.ts`、`src/renderer/src/smoke.ts`、`src/renderer/src/source-locator-smoke.ts`、`scripts/smoke-worker.mjs`、`scripts/smoke.mjs`、`scripts/validate.mjs`、`scripts/process.mjs`
- `tests/localization.test.ts`、`tests/raw-directory.test.ts`、`tests/raw-lifecycle.test.ts`、`tests/raw-real-data.test.ts`、`tests/source-catalog.test.ts`、`tests/source-locator.test.ts`、`tests/helpers/source-catalog-loader.mjs`

## 17. 外部只读审计与清理

外部 HEAD 起点、路径探针终点及独立 gate 起止均 `724b139d8c9c32d12552eb95745a4fee72bfe48b`，status 空，六既有样本 SHA-256/size/mtime 未变。Git ownership 检查使用单次 `-c safe.directory=<绝对路径>`，未改全局配置。没有修改/touch/format/checkout/pull、复制大型数据或建立 submodule。

代理真实用户 HKCU ProxyEnable=1、ProxyServer=127.0.0.1:7890；后续 build/package 经现有 fail-closed proxyEnvironment，仅当前 process env，localhost bypass，不永久修改 npm/git/system 设置。所有 mutable fixtures 都在 test/runner-owned temp directories；进程树和已核实 temp 边界由原 runner 清理。最终packaged gate后及final audit（UTC 2026-10-05T13:58:36.834Z）复核外部HEAD/status/六指纹未变；runner临时目录和本轮Electron/Utility/worker/helper已清理，无相关进程残留。final audit核对同一production输出与ASAR；所有ignored logs/artifacts留作本机review证据。

## 18. 非目标与停止条件

workspace content search、Find in Source/Slice G、FEFF fix、S1/SQLite/FTS/trigram/hash/search process、fuzzy/regex/glob/pinyin/semantic/AI、recent/history/tabs、Dataset Contract、Resolver/incoming/graph、reveal-in-tree 均未实现。ADR-0011 原决定与旧 Search evidence 未改写，Find 仍未实现、workspace 内容搜索仍 deferred、FEFF 仍独立 OPEN。

没有 commit/push/branch/PR/issue/remote mutation。变更留当前 working tree。Windows本轮必要gates与报告齐备，Slice F标IMPLEMENTED / AWAITING REVIEW；macOS NOT YET RUN及失焦限制保留。现在 STOP / WAIT FOR REVIEW，不自动进入 Slice G、FEFF 或 Phase 3A。
