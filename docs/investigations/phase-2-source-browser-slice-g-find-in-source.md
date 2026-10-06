# Source Browser Slice G — Find in Source 调查与实现

日期：2026-10-06；baseline：`f76b31b3a1728574276c51061db0360480b45797`，开始时干净。状态：IMPLEMENTED / Windows x64 必要 gates 累计 VALIDATED / macOS arm64 NOT YET RUN / AWAITING REVIEW。本文实现细节是本轮证据，已接受原则仍以 ADR 为准。

## 1. 授权、范围与停止点

本轮明确授权调查、production implementation 与 Windows x64 验收；变更留当前工作树，不 commit、建分支、push、PR 或 issue。Find 声明 scope 为唯一 active registered source + current revision。workspace content search / S1 / SQLite content index / FTS-trigram / dedicated Search Utility 仍 DEFERRED，compact hash DROP。Dataset Contract、Reference Resolver、父表 reveal、Replace、Tabs/History 未实现，无依赖或 accepted ADR 修改。交付后 STOP / WAIT FOR REVIEW，下一架构焦点为另行授权的 Phase 3A。macOS F/G 与 FEFF 不自动阻塞 Phase 3A architecture investigation；依赖 TextMap fidelity 的 production resolver 前须单独处理 FEFF。

## 2. 现有 parser / Browser 调查

原 scanJson 使用 @streamparser/json 0.0.26、LexemeTokenizer、TokenParser grammar、自己的 Pointer/range/accounting adapter；成熟库负责 token/grammar，原数值以 lexeme 保留。SourceSession 在 root read 后验证整源，NodeBrowserController 通过现有窄 read/children/segment 导航。选择 child 只更新 Inspector，navigate 才改 current Node。Find 不 acquire/release source、不复制 Browser 分页/读取逻辑。

实现前只读 token-observer 探针：AvatarSkill 全扫约 1.04s、TextMapCHS 约 2.50s；TextMap query `1` 约 470,278 个事实命中。观察不是生产 Find gate，未控制 OS cache/负载。完整物化和每页重扫前缀会放大 broad query 成本，因此采用共享可暂停 walk + forward cursor，而非索引/spool/全结果数组。

## 3. 最终 structured raw-fact semantics

区分大小写的 literal Unicode Contains。原始 query 不 trim、不 Unicode normalization、不 numeric conversion。事实为 decoded object key、semantic string、原始 number lexeme、`true` / `false` / `null`。每个事实计一次，即重复 substring 不增加 occurrence；同 property key/value 可分别命中。同源事实序中 key 在对应 value 前，ordinal 是命中次序。

这服务可导航 Node，而不是 raw editor punctuation/quote/格式空白搜索；容器没有 scalar 文本，容器 property key 可命中。key → property value NodeAddress；scalar → 自身 NodeAddress，特殊 key 复用 escapePointer。unsafe integer、`-0`、`1.00`、exponent 保持 lexeme，中文/emoji 使用原 decoder semantic string。既有 FEFF defect OPEN，未改变 decoder，未使用 TextMapJP defect 作为本轮成功样本。

## 4. Parser 受控重构

从 scanJson 抽取 createJsonWalk；scanJson 继续通过同一入口扫完。保留 tokenizer/grammar、numeric lexeme、Pointer/range、duplicate-key detection、BOM 与 decoder；额外暴露 fact/node hooks 和 step/position/result。每 step 最多完整 4 KiB feed；EOF 才完成 end/grammar/stack/hash 校验。没有 JSON.parse 全源、regex tokenizer 或新 parser。chunk 边界 Unicode/range 回归覆盖 1/2/3/7/4096 bytes；普通 Raw tests 继续验证原语义。

## 5. Protocol / batch / continuation

新增 findInSource 与 closeSourceFind，经已有 narrow Preload → trusted Main → Utility MessagePort / owner RequestBroker。exact runtime validation 保持 requestId/source/expectedRevision/query/limit/cursor 边界；locale 不入协议。FindResult 为 source/revision/query、matches、scannedBytes/sizeBytes、nextCursor、complete；match 仅 NodeAddress、key/value kind、ordinal，没有列表 preview 或 parent record。

Utility 最多保留一个 Find session，绑定 workspace object/generation、registration token、revision 与 raw query；不共享跨源状态。cursor 单向、opaque UUID，每批轮换，已消费/错误上下文/过期为 STALE_CURSOR。close 只匹配 source/revision/cursor，迟到旧 close 不清新 query。每批 ≤32，query serialized bytes ≤1 KiB，pending metadata ≤8 MiB；完整 request/response 16/64 KiB。装不下的 matches 保留待交付，单项不能装则明确 RESOURCE_LIMIT；不会缩页丢项。

## 6. 扫描、资源与完整性

匹配 block 一出现即可交付；无匹配约 100ms 返回 progress。批次完成释放 parser queue、关闭句柄；续扫重新打开并复核安全路径、revision 与 handle stat。已注册、已完整校验且 current 才允许 Find。readBytes/tokens/depth/tokenBytes/key/address 沿 Raw guards；累计工作最多 15s，暂停时间排除，续扫不重置累计 read/token/time。

首匹配交付不意味着 EOF，也不宣布 total。complete 仅 EOF 校验成功且 pending matches 全交付。已知变化或解析失败清会话；资源/权限/服务错误用稳定 code 呈现。stat-based revision protection 是已有 best effort，非严格 filesystem snapshot isolation。

## 7. Controller、query 与导航

NodeBrowserController owns FindController；Find 保存 query、有界 matches/cursor/progress/error。150ms debounce，输入变化立即清旧结果并 abort 旧查询/Find 自身在途导航。所有提交检查 signal/epoch/source/revision；请求串行，Enter 可立即 flush debounce。首批自动调用既有 navigate，preserveFocus 标记抑制 Browser 自动 focus，Find input 保持焦点。

Renderer ≤128 matches /512 KiB；Previous 使用已加载历史；Next 消耗已加载结果，耗尽才续扫。no-match progress 自动继续，到首命中/EOF/取消/失败；ready 后不自动扫完整源。边界停止、不循环；历史淘汰与普通导航取消后需要新扫描时提供 Restart。普通 Node 导航立即取消在途 Find，有效历史保留；Find 导航不取消自身。未来 result list/父表 reveal 不在本轮。

## 8. Source/revision/stale lifecycle 与取消

same-source close 保留 query，reopen 重新查找；source/workspace 切换清 query/结果并关闭。stale/reload/revision 变更取消、清结果；same-source Reload 保留 query、不恢复旧 match identity、不自动查找，须明确 Restart/Next。取消覆盖 query、close、source、workspace、stale、reload、dispose 与 service exit。旧响应/旧关闭不会覆盖或释放新查询。SOURCE_CHANGED 通过唯一 SourceSession.markStale，不制造第二份 stale state。

## 9. UI、shortcut、focus 与 accessibility

Node Browser 顶部 compact Find bar、显式入口、Previous/Next/Close 和必要时 Restart。Renderer 接管 Ctrl/Cmd+F preventDefault；Locator modal 打开时不在下方打开。Enter 为 Next、Shift+Enter 为 Previous、Escape 为 close；无新 Main menu/globalShortcut 权限。打开/关闭不改变 Node、selection、分页或 Inspector。关闭恢复 connected 原焦点，否则依次 scalar/segment、当前表格、Breadcrumb 内容。

en/zh-CN message、ARIA、title、polite status 使用 Paraglide，raw query/fields/value/Pointer 不本地化。locale switch 保留 query/history/navigation/focus。状态区分 searching、ready、no-match、incomplete、历史边界、restart 和失败；未到 EOF 不显示“没有更多匹配”。使用原 semantic table/Inspector；本轮不是完整 screen-reader/accessibility audit。

## 10. 定向测试与故障调查

普通测试包含事实映射、大小写/Unicode/numeric lexeme、同 Node 双命中、Pointer、duplicate key/invalid JSON、暂停无遗漏/重复、宽查询、response 缩页、累计执行与暂停排除、取消/cursor、controller latest query/debounce/history、stale/reload/workspace/dispose 与旧响应/close。真实 bridge 复用生产 Data Service；不是仅 mock list。最终普通套件 286 passed / 1 opt-in real-data skipped，其中 Find 专项 33 项；另外的只读真实数据 gate 已实际执行通过。最后补充普通导航取消已加载历史/迟到批次的回归，仅修改测试；production build 后无产品源码变更。

最早并行 ordinary/真实 gate，以及之后串行真实 gate，均在旧 Raw cold read 阶段触发 WORK_MS，后者明确为 baked Floor，尚未进入 Find。未扩大 15s budget。调查检查进程、HEAD/current parser、catalog 并发和完整 Data Service；独立 Node Floor HEAD/current 相同 read/token，耗时 2.10/5.74s 与并发 catalog 2.49/2.29s；完整 service Floor 2.19s，Vitest parser 对照总 4.26s。失败原因未完全隔离，不能宣称 catalog 是已证实唯一根因。最终测量等 catalog ready，明确隔离 Raw/Find 与 catalog I/O；目录 building discovery 和 native early activation 检查仍保留。

dev 定向 gate 曾在 Escape focus 断言失败。排查记录实际焦点为 Breadcrumb：selector 列表按 DOM 顺序而非预期 priority 取首项。修复打开时只保存一次焦点、关闭时按显式内容顺序回退，并等待 native/DOM 完成。修复后的 dev native gate 通过；失败 logs 保留在 artifacts，不放宽 timeout。最终 runner 第一次在 dev 阶段主动停止（尚无 production build），复核发现取消后的成功 response 会被通用 request wrapper 丢弃，需先关闭其中新 cursor。新增迟到成功 close/new query 回归，修复 response cleanup 后重新执行最终 runner；旧 close 仍只匹配自身 cursor。修复后的完整 runner 在既有 catalog CATALOG_BUILD_MS 60s处失败（sources丢弃、尚未Find/prod build）；进程与内存检查无遗留RefAtlas、可用约16GiB，独立未修改catalog worker 15.43s完成137916来源/15212目录，形成一次受控完整复验的新证据。根因未完全隔离，不改Slice F、不扩大60s保护。受控复验 catalog 在17.69s ready，随后旧 Raw Floor 再触发 WORK_MS、尚未 Find；停止完整重试，没有以新 timeout 掩盖失败。已通过的 real-data 阶段位于最初最终 runner（UTC 01:03:40.037Z），当时 parser/service/协议与最终版本相同；随后修复仅 Renderer 迟到 response cleanup，最终三态 native 验证该版本。完整 runner 日志的失败不是成功的单次11阶段记录。

## 11. 真实数据测量

生产 Find 测量限定 AvatarConfig、AvatarSkillConfig、MonsterConfig、TextMapCHS 与 P10401_F10401001_Baked Floor。字段、1001、1407、140701、semantic 普通字符串、broad `1`、late 与 no-match；采样首批与完整 EOF 场景分别标识，不将 sample-only 视为完整计数。记录首批/首匹配/完成耗时、actual read/token、完整 envelope、process memory、cancellation、正常 Node 读取等待与 first pointer。冷 service cache 不等于磁盘冷读；Utility 工作与 native navigation 耗时分开。定向 gate（UTC 2026-10-06T00:59:31.511Z）已通过，隔离 catalog ready 后测量；最终通过的 runner real-data 阶段（UTC 2026-10-06T01:03:40.037Z）值另列于下表和紧凑证据。示例：AvatarID 首匹配 2.68ms / EOF 92.09ms /94 matches；Avatar 1001 首匹配 2.38ms / EOF 31.24ms /39。AvatarSkill 1407 首匹配 65.81ms / EOF 1021.43ms /279；140701 首匹配 65.05ms / EOF 974.77ms /35；首 target 都为 `/496/SkillName/Hash`，literal Contains 不猜为 SkillID。TextMap late key 首匹配 1003.41ms / EOF 2192.59ms /1，no-match EOF 2179.12ms。Floor GroupList 首匹配 1.67ms / EOF 2236.32ms /18；首次 container navigation 2172.34ms，沿用 Browser cold range 访问成本，不是 Find首批耗时。broad `1` 五样本首批 2.20–2.70ms，均最多32、incomplete，不声明总命中数。

完整扫 read/token：Avatar 240469/21821，AvatarSkill 11438928/1597850，Monster 4534608/616682，TextMap 52399649/1896773，Floor 29480189/3048925。多出的3bytes是既有 BOM sniff；暂停不重扫前缀。TextMap/Floor cancellation 0.81/0.61ms，排队正常root读取 102.49/102.59ms（未主动取消情形；主动 Node 导航取消由 controller/native gate验证）。首批完整 envelope 最大8538bytes。process heapUsed/RSS 包含 catalog/Vitest/parser/range/指纹/GC，不等于 pending guard或独立 Find内存：本轮观察约64.8–156.7MB /283.7–355.2MB，未forced GC；每次query UI only boundedmetadata。

最终已通过的 real-data 阶段（catalog 11,536.88ms ready 后测量）：

| 来源 / query | 首匹配 ms | EOF ms | 命中数 / scope |
| --- | --- | --- | --- |
| Avatar / AvatarID | 3.03 | 92.20 | 94 / complete |
| Avatar / 1001 | 1.63 | 29.54 | 39 / complete |
| AvatarSkill / 1407 | 66.52 | 1033.53 | 279 / complete |
| AvatarSkill / 140701 | 62.02 | 1014.31 | 35 / complete |
| TextMapCHS / late key | 971.58 | 2131.71 | 1 / complete |
| Floor / GroupList | 1.69 | 2203.88 | 18 / complete |

最终 broad `1` 五源首匹配 2.04/2.54/2.03/2.01/2.19ms，均32项/incomplete；no-match EOF 20.45/972.06/367.47/2128.51/2277.31ms。TextMap/Floor取消0.86/0.57ms，未主动取消时正常root请求等待102.14/102.21ms。最大完整 envelope仍8538bytes，完整 read/token 不变。Floor首次容器导航2149.50ms，仍需沿用已有冷 range 读取。最终 query 结束 process heapUsed 74.70–156.64MB、RSS 289.07–356.69MB（十进制MB）；包含整个测试进程与其他服务，不是 Find 专用内存。取消记录中的 work 是后续 root 读取，不代表取消 Find 消耗为零。

完整数值、scope、fingerprints 与三态 native proof 见 [紧凑证据](evidence/phase-2-source-browser-slice-g-measurements.json)。

## 12. Windows x64 验收

Windows x64 必要 gates **累计 VALIDATED**：offline i18n、format/types/普通测试/docs、production real-data、dev、一次 production build、built、Windows x64 ASAR package、packaged 与 normal guard 均已通过。完整 runner 先后因上述既有 catalog/Raw 预算失败；因此**不是单次11阶段 invocation exit 0**。依照失败调查政策，不再机械重复 full runner，以已验证同一后端的 real-data gate 加最终前端/同一 build 的后三态 gate保留明确验收范围。最终剩余步骤调用既有 runner 的7–11阶段，未增加可独立 skip-build API，也未修改 runner 预算。

剩余阶段首次 dev 在旧 monitor-paused:minimize 检查中窗口被恢复；最小 sandboxed Electron 探针验证 minimize/restore/hide 状态正常，用户明确确认“有人在操作窗口”。这是环境变化证据；待用户不操作窗口后同代码执行7–11阶段全部 exit 0，无 monitor 产品修复或 timeout 扩大。日志 `artifacts/slice-g-remaining-gates-no-window-interaction.log` 保留阶段顺序和恰一次 production build。前置失败/主动停止均在该 build 前。完整 runner 的 catalog/Raw 超时原因仍未隔离，不归因于窗口操作。

现有 Electron harness 扩展实际 Ctrl+F/typing/Enter/Shift+Enter/Escape/按钮/source switch/stale/reload/locale/大源取消。每态 trusted shortcut=1、defaultPrevented=1、nativeFindCalls=0；scalar `/SkillID` 与容器 `/entries` 均沿用 Browser 导航，Breadcrumb、Node/table、Inspector 与 input focus 断言通过。console errors均为空；contextIsolation/sandbox=true、nodeIntegration=false。ASAR runtime-only/external-data exclusion/native-unpacked/compiler与plugin cache exclusion、Renderer-only catalog/Explorer guards通过；normal packaged diagnostics被拒绝、Find harness不可用。真实 mutation 仅 Main 操作 runner-owned fixtures。

| 最终状态 / UTC | AvatarID 首次导航 ms | Skill 1407 ms | TextMap 攻击 ms | 大源 Escape 取消 ms / frames |
| --- | --- | --- | --- | --- |
| dev / 01:17:22.320 | 8.4 | 66.9 | 15.2 | 1.9 / 28 |
| built / 01:18:26.986 | 9.9 | 68.2 | 11.3 | 1.0 / 26 |
| packaged / 01:19:50.578 | 8.5 | 65.5 | 12.7 | 1.1 / 28 |

这些是查询+IPC+实际导航/DOM的单次观察；real-data native结果仍incomplete，counts为2/2/5，不作为整源计数。frames从输入阶段计，包含debounce，非纯扫描fps。dev/built/packaged各normal/narrow共6张 `artifacts/find-{mode}{-narrow}.png` 已目视检查，布局、焦点、边界status与scalar/Inspector可读，无重叠或裁剪；native capture受DPI影响，不把物理像素等同CSS尺寸。日志、截图、三态JSON留在ignored artifacts，紧凑证据纳入审查文档。

最终 Renderer `index-CuhHT_fu.js` 637,095bytes / gzip121,754，相对实测Slice F baseline587,502/114,766增49,593/6,988。app.asar1,661,364bytes、win-unpacked413,893,330bytes。没有新依赖、第二次production build或额外签名/发布。

## 13. macOS 与局限

macOS arm64 Slice G **NOT YET RUN**；不能借 A/B/C/D/E 或 Raw Foundation 历史结果。Windows 也只证明本机 gate，非所有文件系统/后台负载、完整 accessibility audit 或性能 SLA。Find 时间 guard 可产生明确可恢复 RESOURCE_LIMIT，当前无 persistent content index；Previous 只在 bounded 历史内，淘汰需 Restart。FEFF 仍 OPEN，未实现 Replace/parent reveal/global content search/contract。

## 14. 变更文件

- parser/service：src/utility/raw-parser.ts、raw-service.ts；shared raw protocol、Main/Preload 窄桥。
- Renderer：新增 browser/find-controller.ts、FindBar.svelte；NodeBrowserController、NodeBrowser、AppShell、en/zh catalogs。
- 验收：新增 tests/find-in-source.test.ts、tests/helpers/find-real-data.ts、renderer/find-smoke.ts；扩展 real-data/localization/locator fixtures、raw/normal smoke、Main native harness、scripts/smoke-worker.mjs、source-explorer-data.mjs。
- 文档：本报告、STATUS/PROJECT/ARCHITECTURE/ROADMAP/PERFORMANCE/DEVELOPMENT-PROCESS、两个 README 索引、app README 与 evidence/phase-2-source-browser-slice-g-measurements.json。

无新依赖、lockfile/ADR/catalog production 优化修改；实验与 artifact 不进入源代码/ASAR runtime。

## 15. 外部只读审计与交付

TurnBasedGameData baseline HEAD `724b139d8c9c32d12552eb95745a4fee72bfe48b`，最终 HEAD相同，开始 status clean。gate 前后检查 HEAD/status 和 streaming SHA-256/size/mtime。Find 五样本加旧 Raw 样本；native snapshot 纳入 MonsterConfig，所有 external files 只读。测量写入 RefAtlas/artifacts，不向外部写缓存/索引/fixture。

最终独立只读复核 HEAD/status 与7样本 SHA-256/size/mtime 全部相同；app HEAD仍为baseline。仅当前工作树未提交变更，不 commit、建分支、push、PR 或 issue；外部始终只读。文档与紧凑证据已同步，STOP / WAIT FOR REVIEW。
