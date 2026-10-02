# 开发与文档流程

权威文档位于本仓库 `docs/`，与代码使用同一 Git 仓库。重大工作前按 [入口](README.md) 阅读 PROJECT、STATUS、ARCHITECTURE 与相关 ADR/调查，核实 AGENTS、现有修改和外部仓库状态。**调查或收尾任务不意味着生产实现授权。**

## 工作规则

- 外部数据只读，不增加 submodule、不复制或重构数据。
- 分开事实/观察/假设以及推荐/已接受决定。
- 官方文档/仓库核对版本，注明日期与局限。
- 实验依赖/产物隔离，试验 schema 不成为生产真相。
- 先小范围测试再扩展，不能因基准便利损坏整数。
- 新说明中文，必要标识符保留原文。

## 桌面基础验证流程

先确认系统 7890 代理协议/地址，并仅在当前 shell 配置；包下载、官方查询、Electron 下载和打包工具可能的网络访问均不得直连回退。联网脚本会检查代理配置与本机端口，包版本/ABI/N-API 变化必须重新验证。

完整验收在应用仓库根目录执行 `npm run validate:foundation`：format:check → typecheck → test → docs:check → smoke:dev → production build → smoke:built → builder → smoke:packaged。命令和安装说明见应用 README；每个目标在对应原生机器运行，不用交叉产物或 Rosetta 成功冒充另一架构的原生验收。

smoke 通过真实隐藏窗口/Preload bridge 运行，120 秒总超时；父 runner 清理自身进程树和已核实边界的临时目录。报告含目标身份、安全配置、运行时、SQLite 清理与 ASAR native 证据；打包态另验普通模式拒绝故障注入。失败须报告非零退出码，不以残留旧成功报告替代当前结果。

macOS arm64 的脚本路径必须在原生 Apple Silicon 环境验证；macOS x64 不属于正式 gate。electron-vite + electron-builder 路线已由 [ADR-0006](decisions/ADR-0006-electron-build-and-packaging-toolchain.md) 接受；版本升级按该 ADR 与现有 Validation Cadence 选择必要的兼容性和平台验证，不要求每次 patch/minor 无条件完整跨平台重验。正式发布、签名、公证和 release workflow 仍需后续独立授权。

2026-10-02 的 Apple M2 原生九阶段验收已通过，见 [macOS 报告](investigations/phase-1a-macos-arm64-validation.md)。受限执行环境可能禁止 localhost 监听或 Electron 启动，应走获准的本地执行路径，不降低应用 sandbox/context isolation，也不更改 timeout 掩盖权限错误。

## Formatter 与测试维护

`npm run format` 主动应用仓库 formatter，`npm run format:check` 只检查；两者范围一致且不隐式进入 build。受管范围是生产 src、tests、scripts 与 package/生产配置，`.prettierignore` 排除 Markdown、lockfile、docs、tools、node_modules、缓存、out/dist、artifacts/coverage。不格式化外部数据，不因首次整理重排历史调查或证据。具体版本只维护在 package/lockfile，配置维护在仓库 formatter 配置。

测试按风险、可观察行为、边界和回归价值安排，不按 LOC、函数数、test count 或 coverage quota 分配。相似输入优先 `it.each`；真正 bug 的合理 regression 应能重现问题，typo/文案无需机械补测。普通测试验证逻辑、validation、状态机，不验证私有步骤或第三方库自身能力。

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

更新 STATUS 与权威文档，性能变化更新 PERFORMANCE。明确接受才新增 ADR，旧 ADR 标记被替代。检查链接、一致性与矛盾 TODO。复核数据未变、测试、忽略规则和 Git 状态，清理临时输出。

影响架构、状态、路线图或性能事实的实现，应与相应权威文档在同一审查变更中更新。不影响文档事实的琐碎实现无需强制改文档。调查报告保留当时事实与结论；之后的接受/替代决定记录 ADR 和当前架构，可添加日期明确的历史补记，但不改写历史。

汇报实测、局限、未决事项与文件；未经请求不提交、不建分支、不推进下一阶段。阶段授权以用户明确请求为准，当前进度只在 STATUS 维护；所有公网操作遵守 AGENTS 的 7890 代理规则。
