# 开发与文档流程

**ARCHIVED — 历史开发流程，2026-10-06。** Standalone RefAtlas 已停止开发，当前决定见 [STATUS](STATUS.md)。下文保留开发时期的验证、维护和阶段规则，用于理解历史代码及用户明确请求的极小维护；不授权恢复实现、open investigations、平台验证、清理或依赖现代化。历史“待授权”“下一节点”不构成 active backlog，除非用户明确要求重新激活 standalone，否则不启动 active-development workflow 或平台 gates。

本次纯文档归档维护只执行 `npm run docs:check` 与 `git diff --check`；Markdown 不在 formatter 范围。不运行 production tests、build、package、Electron smoke、validate:foundation、real-data gates、Mac F/G validation 或 Search benchmarks。下文历史 Validation Cadence 不扩大本次任务范围。

权威文档位于本仓库 `docs/`，与代码使用同一 Git 仓库。重大工作前按 [入口](README.md) 阅读 PROJECT、STATUS、ARCHITECTURE 与相关 ADR/调查，核实 AGENTS、现有修改和外部仓库状态。**调查或收尾任务不意味着生产实现授权。**

## 工作规则

- 外部数据只读，不增加 submodule、不复制或重构数据。
- 分开事实/观察/假设以及推荐/已接受决定。
- 官方文档/仓库核对版本，注明日期与局限。
- 实验依赖/产物隔离，试验 schema 不成为生产真相。
- 先小范围测试再扩展，不能因基准便利损坏整数。
- 新说明中文，必要标识符保留原文。

Phase 2A 接受范围见 [评审收尾](investigations/phase-2a-review-closeout.md) 和 ADR-0007–0010；当前 V1 搜索范围由 [ADR-0011](decisions/ADR-0011-search-scope-and-reference-first-direction.md) 部分替代 ADR-0009。后续实现区分 Node 地址、Structural Record 浏览角色和显式契约实体；source workspace 只读，外部变化使旧范围/索引/视图失效。parser 各路径统一 raw semantics；完整性、进度、部分结果和取消约束声明的查询范围，不要求当前 V1 全工作区内容索引。

Search investigation line 已 completed / retained as historical evidence；旧 OPEN / UNKNOWN / AWAITING REVIEW 不能自动触发继续调查、compact follow-up 或 Search Foundation。Workspace discovery 仅要求 source filename / relative-path locator，raw find 限 active source；Reference Resolver 与 Incoming References 来自显式契约，不退化为 unconstrained global search 或 raw equality。FEFF 保持独立 Raw Access correctness task。Source Locator、Find、FEFF 修复与 Phase 3A 契约架构/调查都需单独授权；收尾后停止等待评审。

从第一批 Phase 2 production UI 起，用户消息通过集中、类型化 localization layer；内部稳定 code 由 presentation 翻译，locale 不传入 Data Service。raw 字段/值/数值词法/路径/地址不翻译或按 locale 改写；APP 自有格式通过共享 `Intl.*` formatter。message sources 为权威，generated artifact 不手工维护；当前采用 Renderer-only Paraglide 与 en/zh-CN，配置和边界见 ARCHITECTURE。[ADR-0010](decisions/ADR-0010-ui-localization-boundary.md)

## 桌面基础验证流程

先确认系统 7890 代理协议/地址，并仅在当前 shell 配置；包下载、官方查询、Electron 下载和打包工具可能的网络访问均不得直连回退。联网脚本会检查代理配置与本机端口，包版本/ABI/N-API 变化必须重新验证。

完整验收在应用仓库根目录执行 `npm run validate:foundation`：format:check → typecheck → test → docs:check → smoke:dev → production build → smoke:built → builder → smoke:packaged。命令和安装说明见应用 README；每个目标在对应原生机器运行，不用交叉产物或 Rosetta 成功冒充另一架构的原生验收。

smoke 通过真实窗口/Preload bridge（常规 smoke 与产品同样初始可见，keyboard 阶段聚焦，guard smoke 隐藏） 运行，120 秒总超时；父 runner 清理自身进程树和已核实边界的临时目录。报告含目标身份、安全配置、运行时、SQLite 清理与 ASAR native 证据；打包态另验普通模式拒绝故障注入。失败须报告非零退出码，不以残留旧成功报告替代当前结果。

macOS arm64 的脚本路径必须在原生 Apple Silicon 环境验证；macOS x64 不属于正式 gate。electron-vite + electron-builder 路线已由 [ADR-0006](decisions/ADR-0006-electron-build-and-packaging-toolchain.md) 接受；版本升级按该 ADR 与现有 Validation Cadence 选择必要的兼容性和平台验证，不要求每次 patch/minor 无条件完整跨平台重验。正式发布、签名、公证和 release workflow 仍需后续独立授权。

2026-10-02 的 Apple M2 原生九阶段验收已通过，见 [macOS 报告](investigations/phase-1a-macos-arm64-validation.md)。受限执行环境可能禁止 localhost 监听或 Electron 启动，应走获准的本地执行路径，不降低应用 sandbox/context isolation，也不更改 timeout 掩盖权限错误。

## Formatter 与测试维护

`npm run format` 主动应用仓库 formatter，`npm run format:check` 只检查；两者范围一致且不隐式进入 build。受管范围是生产 src、tests、scripts 与 package/生产配置，`.prettierignore` 排除 Markdown、lockfile、docs、tools、node_modules、缓存、out/dist、artifacts/coverage。不格式化外部数据，不因首次整理重排历史调查或证据。具体版本只维护在 package/lockfile，配置维护在仓库 formatter 配置。

测试按风险、可观察行为、边界和回归价值安排，不按 LOC、函数数、test count 或 coverage quota 分配。相似输入优先 `it.each`；真正 bug 的合理 regression 应能重现问题，typo/文案无需机械补测。普通测试验证逻辑、validation、状态机，不验证私有步骤或第三方库自身能力。

除非测试目标是 localization，不以具体翻译文案作为功能行为的核心 assertion；优先 semantic state、machine-readable error code、role、稳定 DOM/data identifier、可观察行为、控件可用性和 request/result state。例如 source-change 测试验证 stale 状态与 reload 行为，不依赖“重新加载”译文。专门 localization tests 验证 message 存在、参数生成、locale switch、fallback、formatter 和 raw 数据边界。UI wording / 翻译修改不应导致大量无关功能测试失败，仍按风险选测，不新增数量或 coverage quota。

纯逻辑单测与真实边界证据分开：当前 `npm test` 还包含极小的本地 SQLite 和子进程检查，保持离线和有界；它们不等价于 Electron Utility、MessagePort、native/ASAR 的真实 smoke。源码字符串 guard 仅用于必要的安全/build/package 不变量，优先结构化配置或运行时断言；不能通过文本没有出现目录名就声称该目录未打包。

## Validation Cadence

| 层级 | 何时运行 | 最小命令 |
| --- | --- | --- |
| Tier 1 — Local / Cheap | 频繁局部修改 | `npm run format:check`、`npm run typecheck`、`npm test -- tests/<相关文件>`；文档变更加 `npm run docs:check` |
| Tier 2 — Application Build | 模块基本稳定、构建配置/入口变更 | `npm test`、`npm run build` |
| Tier 3 — Integration | 进程、IPC、取消、SQLite/native、smoke 编排变化 | `npm run smoke:dev`，随后 `npm run build`、`npm run smoke:built` |
| Tier 4 — Packaging | packaging config、Electron/native、ASAR、发布/平台边界变化或阶段验收 | 对应 `npm run package:<platform>`、`npm run smoke:packaged`；完整验收使用 `validate:foundation` |

普通 UI 局部修改无需无条件运行 Tier 4；最小有效验证优先，最终验收仍可运行完整链路。独立 package 命令总会重新生产构建；完整 runner 在同一轮生产构建之后执行 built smoke 和 builder，消除重复生产构建。development build 与 production build 不合并；不提供可独立使用的 skip-build/from-build 命令、不建立缓存或 mtime 状态。

验证期间不并发修改输入、不并行覆盖 out/dist。完整 runner 的任何前置失败都阻断后续打包，不用存在的旧产物或旧报告宣称通过。日志显示当前步骤；共用正式打包参数仍保持 `--dir`、`--publish never`、本机原生目标、ASAR 与既有 native 策略。

## 昂贵命令、失败与超时

- 下载/build/package/Electron/E2E/smoke 前先验证最小假设：例如 RequestBroker 修改先跑该测试，代理先核实配置，native 先确认当前版本与目标预构建文件。
- 已失败命令在代码、环境、参数或假设未改变时不得重跑；同类昂贵命令连续失败两次后停止重试，记录失败条件、调查根因、形成可验证的新假设，有新信息或实际修改后才重跑。
- 沙箱权限失败应走明确的批准/执行路径，不继续在同一环境重复等待；代理不可用立即停止，不直连回退。
- 超时先检查死锁、自己的子进程是否泄漏、网络/权限、native 阻塞与执行路径。只有实际耗时证据支持时才调整 timeout，不按 timeout → retry → increase timeout 循环处理。
- 保留现有单步骤有界超时与进程树/临时目录清理。scripts 无自动重试；未来确需 retry 时必须次数有限、条件明确、输出尝试序号，仍遵守代理 fail-closed。

## 结束规则（文档与仓库）

Source Browser Slice A 扩展 `test:raw-data`，仅枚举 root、ExcelOutput、Config/Level/Mission 并复用六个 Raw 样本，前后核对外部 HEAD/status 和文件指纹。`npm run validate:foundation -- --real-data` 显式把此 gate 放在 docs check 后、dev smoke 前；缺少同级数据或真实 gate 失败阻止后续打包。无参数仍保持增加 i18n offline compile 的十阶段流程、单次 production build，不隐式依赖外部数据。

Raw Access Foundation 的普通风险测试使用可写临时 fixture；`npm run test:raw-data` 明确启用六个外部只读来源的 production gate，普通 `npm test` 不隐式访问真实数据。前后 streaming SHA-256/size/mtime 需要一致，测量只写被忽略的 artifacts。冷 service cache 不代表磁盘冷读；统计 actual read/token 与 IPC 序列化成本分开。

既有 `smoke:dev`、`smoke:built`、`smoke:packaged` 已扩展真实 raw bridge 流程；临时 source 只在 runner 目录内由 Main 操作，不向 Renderer 暴露任意 source mutation。新增 parser dependency 或进程边界变更按风险重验 runtime/ASAR；不能将既有 macOS Phase 1A 结果冒充本轮 raw-path 验收。当前实现与局限见 [报告](investigations/phase-2-raw-access-foundation.md)。

更新 STATUS 与权威文档，性能变化更新 PERFORMANCE。明确接受才新增 ADR，旧 ADR 标记被替代。检查链接、一致性与矛盾 TODO。复核数据未变、测试、忽略规则和 Git 状态，清理临时输出。

影响架构、状态、路线图或性能事实的实现，应与相应权威文档在同一审查变更中更新。不影响文档事实的琐碎实现无需强制改文档。调查报告保留当时事实与结论；之后的接受/替代决定记录 ADR 和当前架构，可添加日期明确的历史补记，但不改写历史。

汇报实测、局限、未决事项与文件；未经请求不提交、不建分支、不推进下一阶段。阶段授权以用户明确请求为准，当前进度只在 STATUS 维护；所有公网操作遵守 AGENTS 的 7890 代理规则。

## Localization 生成与验收

Paraglide compiler 为 devDependency，仅 Renderer Vite plugin 使用。tracked settings/catalog 与 ignored generated output 分离；格式化只纳入 catalog/settings/编译配置，显式排除 generated 与 SDK metadata。dev/typecheck/test/build/dev smoke 前自动 compile；package/完整 runner 自动准备固定插件，不隐藏 fresh checkout 手工步骤。生成目录为空后 typecheck 必须仍可执行。

message-format 4.4.0 固定 URL 与 SHA-256，`i18n:prepare` 仅缺缓存时经现有 proxyEnvironment + Node env proxy 下载；校验失败停止，不静默使用或升级。缓存准备后编译读取本地 module。`i18n:compile -- --offline` 拒绝 fetch，忽略无法解析为 URL 的 SDK 本地 module 探测，要求零网络地址请求。SDK metadata、插件/cache 和 generated 不进入 runtime ASAR。

完整 runner 在 format/typecheck 前加入 offline compile gate，其余保留 cheap checks → 可选只读 real-data → dev → 单次 production build → built → builder → packaged，任何失败停止。三态 smoke 验证 readonly bootstrap、locale DOM/ARIA/title、无 runtime navigation、状态/raw 保真与三次明确的 persistence reload；显式 reload fixture 不计为 runtime switch。普通打包模式不暴露 localization smoke。macOS 新行为统一留累计原生验收，不以旧 gate 替代。

完整 runner 的三个 smoke 阶段直接调用现有 scripts/smoke.mjs，准备/生成由此前 gate 保证；独立 npm smoke 入口保持原功能。这减少 npm wrapper，不提供跳过 build 的独立参数，不新增 retry。原生启动异常按事件/最小进程探针调查，无法确定根因时在报告如实记录。

## Source Explorer 验收

Slice C 在既有 smoke 内验证正式 Svelte shell、实际 Electron key events、5000-row fixture、loading collapse/late result、retry、双击/Enter、locale continuity 和 workspace switch。`validate:foundation -- --real-data` 将真实 Explorer gate 传入三态 smoke，使用同级只读数据、实际 Controller 与虚拟化；每态前后核对 HEAD/status 与六样本 streaming 指纹。普通 smoke 不依赖外部数据。

所有 picker substitution、目录延迟/错误组件 fixture 和可调用 smoke harness 仅用于明确 smoke mode；普通 packaged guard 确认不暴露。UI 依赖在 Renderer 打包，ASAR 实际清单检查排除 unbundled Zag/TanStack/Svelte，保留 SQLite native gate。最终状态与 known limitations 见 Slice C 报告；macOS A/B/C gate deferred 到 Slice D 后累计验收。

## Node Browser / Inspector 验收

Slice D 扩展现有三态 smoke：真实 Controller/桥、六种 root、特殊 key/Pointer、精确数值、children/segment Previous/Next、Inspector/折叠、stale 与窄窗。键盘使用 Electron sendInputEvent，检查等待实际 focus/selection/navigation 可观察状态；tick 不等于原生事件已送达。真实请求等待 Controller 完成，保留原有 work/IPC/runner deadline，不用任意 5 秒 UI polling 判定大来源超时。

--real-data 在三态 UI 内浏览六代表来源，外部仍全程只读；stale mutation 仅在 app runner 临时 fixture。正常 packaged guard 不暴露 Node Browser harness。Copy Pointer 在 Windows 真实点击下权限拒绝，按可选范围延期，不扩大现有 permissions/IPC。macOS A/B/C/D 累计 gate 为下一节点、未执行且未豁免；既有 Raw Foundation 结果不能替代。

## Source Browser change/recovery 验收

Slice E 的 shared watcher Windows preflight 必须在 production implementation 前关闭；完整 runner 仍要求单次全部阶段 exit 0、production build 恰一次。三态 smoke 扩展 polling 自动 stale、同 Pointer Reload、LOCATION_MISSING/Return to Root、file-deleted error/retry、locale continuity、实际 minimize/hide/resume。原生 keyboard 每次等待实际 focus/controller 状态，不以 tick 或固定 sleep 代替事件完成。产品与 smoke 从创建时统一使用 backgroundThrottling=true；常规 smoke 初始可见，避免 Electron initially-hidden painting 对 visibility 证据的影响。mutation 只在 app-owned temp fixtures，真实数据始终只读；新 diff 的 Mac targeted gate 必须独立记录，不能沿用此前 A/B/C/D 结果。

## Find in Source 验收

Slice G 扩展现有普通风险测试、real-data 与三态 Electron harness。真实 Find 样本限 AvatarConfig、AvatarSkillConfig、MonsterConfig、TextMapCHS 和代表 baked Floor；旧 Raw 六来源检查保留。目录 discovery 检查 catalog building，随后等 ready 再隔离测量 Raw/Find，明确记录不同口径，保留并发失败/调查证据；native harness 仍检查 building 期间激活来源。累计 read/token/work 与首批/EOF/payload/内存/取消/正常导航分开记录，不以单次数字声明 SLA。

实际 sendInputEvent/insertText 验证 Ctrl/Cmd+F defaultPrevented、Enter/Shift+Enter/Escape、按钮与 focus；findInPage instrumentation 验证 Chromium native find 未调用。只在 smoke mode 暴露 harness，normal packaged guard 检查不可用；capturePage 保存 normal/narrow 截图，保留 console/isolation/native-ASAR guards。source mutation 仅用 app-owned temp fixture，外部 HEAD/status/streaming 指纹前后必须相同。定向检查后完整 runner 保持一次 production build 与串行 gates；失败遵守既有调查政策，不放宽预算或盲目重跑。macOS Slice G 结果单列 NOT YET RUN，历史结果不代替本轮。
