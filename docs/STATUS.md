# 当前状态

更新日期：2026-10-03（UTC+8）。

**Phase 0：CLOSED；Phase 1：CLOSED；Phase 1A：CLOSED；Phase 2A investigation：CLOSED / REVIEWED；Phase 2 production implementation：STARTED；Raw Access Foundation：COMPLETE / AWAITING REVIEW。** 首个 production slice 已通过 Windows x64 的完整验收，见 [实现报告](investigations/phase-2-raw-access-foundation.md)；2026-10-03 的原生 [macOS arm64 验证](investigations/phase-2-raw-access-macos-arm64-validation.md)也已通过。**Raw Access Foundation validated on Windows x64 and macOS arm64.** Phase 1A 的平台 gate 和 ADR-0006 仍有效；Phase 2A 原则由 ADR-0007–0010 约束，历史调查保持原样。


**Source Browser Slice B：IMPLEMENTED；Windows x64 VALIDATED（11 阶段证据齐备，ASAR guard 修正后末阶段单独复验）；AWAITING REVIEW。** Renderer-only Paraglide、en/zh-CN、窄 system bootstrap、持久化/no-reload reactive 切换、错误 presentation 和 metadata formatter 已实现。148 项普通测试、类型检查、生成目录为空后的自动恢复、只读真实数据及 dev/built/packaged smoke 已通过；全程一次 production build；当前验证与平台状态见 [Slice B 报告](investigations/phase-2-source-browser-slice-b-localization-foundation.md)。macOS arm64 为累计 Source Browser validation deferred，不是 waived；不自动推进 Slice C。

## 已完成

**Source Browser Slice A：Windows x64 IMPLEMENTED / VALIDATED；REVIEWED，可继续开发；macOS arm64 cumulative validation DEFERRED（未豁免）。** 本轮只实现底层目录发现、metadata 调度和 source 生命周期；106 项普通测试、三目录/六样本真实 gate、dev/built/ASAR packaged smoke 与含真实数据的十步完整验收通过。详细范围、stat 检测边界与清理见 [Slice A 报告](investigations/phase-2-source-browser-slice-a-directory-lifecycle.md)。

- 核实实际目录 TurnBasedGameData，外部仓库初始干净。
- 项目文档整体迁入应用仓库 `docs/`，外层旧目录已移除，证据保留；收尾已提交为 `809a4a5 Closeout Phase 0`。
- 建立产品边界、文档权威模型与实验隔离规则。
- 完成全数据集规模/前 30 大文件统计、15 个代表结构、ID/引用形态调查。
- 完成 42 个重复基准：完整解析、流式与两种 SQLite 驱动；样本指纹和仓库状态一致。
- 完成 Windows x64 Electron 44.5.1 utilityProcess 双驱动/FTS5/BigInt 探针。
- 完成官方版本/兼容范围、构建工具、UI 候选与跨平台发布文档调查。
- 交付中文报告、性能基线与紧凑历史证据；针对性测试通过。
- Phase 0 / Phase 1A 已接受 ADR-0001–0006；Phase 2A 评审新增 ADR-0007–0010，更新当前架构和维护规则，历史调查只增加带日期补记。

## Phase 1A 已实现与验证

- 独立生产 package/lockfile、electron-vite + Svelte 5 + TypeScript + electron-builder 工具链；兼容证据见 [报告](investigations/phase-1a-foundation.md)。工具链路线已由 ADR-0006 接受，当前精确版本不成为永久架构要求。
- sandbox / context isolation 窄 Preload bridge、Main 来源与输入校验、Utility ready handshake、MessagePort 和请求匹配。
- 最多 16 KiB 消息、32 个未完成请求（含一个取消控制槽）、批次取消、超时、窗口销毁、异常退出与显式重启；不自动重放请求。
- Utility 内临时 SQLite：Unicode 和大整数文本往返、close/cleanup；Windows x64 与 macOS arm64 ASAR 目录包均实际加载预构建 `.node`，普通打包态拒绝故障注入。
- 基础交付时 35 项自动测试、类型检查、开发态/构建态/打包态 smoke、基础响应性与测量；工程清理后的当前测试结果见下节。验证使用 synthetic probe，不证明真实数据产品性能。
- AGENTS 加入所有公网操作经系统 7890 代理的长期规则；修复当前文档过时状态，历史调查仅追加带日期补记。

## 工程规范清理

工程卫生清理（2026-10-02）：引入受限范围的 Prettier、长期 formatter/test/昂贵命令政策和分层验证；调整配置 guard、补充打包编排行为验证，并提供单次生产构建的完整验收入口。清理验收时 6 文件 / 43 项测试、类型检查和 Windows 九阶段完整验收通过，独立打包仍重新构建。具体执行结果与失败修正见 [清理报告](investigations/phase-1a-development-policy-cleanup.md)。这是开发流程改进，不改变 Phase 或跨平台 gate。

## macOS arm64 收尾

2026-10-02 在 MacBook Air / Apple M2 / macOS 27.0.1 原生 `darwin/arm64` 完成 Node 24.19.0 / npm 11.17.0 环境准备。确认本机 7890 HTTP 代理后按 lockfile 安装依赖；Electron 44.5.1 内部 Node 24.21.0 / N-API 10 / ABI 149，better-sqlite3 13.0.3 / SQLite 3.53.4。

format/typecheck、6 文件 / 42 项测试、文档检查、dev/built/packaged smoke、独立原生打包及九阶段 `validate:foundation` 均通过。测试数量变化仅因移除了不再支持的 macOS x64 参数化目标。`RefAtlas.app` 与 native addon 均为 arm64；ASAR unpack、真实 SQLite 往返、清理和普通打包模式故障注入保护通过，结束后无项目进程残留。代理与沙箱权限失败均有记录，详见 [macOS 报告](investigations/phase-1a-macos-arm64-validation.md)。没有新增性能基线。

## 已接受决策

- [ADR-0001](decisions/ADR-0001-desktop-stack-and-process-model.md)：Electron/Svelte 5/TypeScript 与 Utility Process 数据服务，初始无 Worker Threads。
- [ADR-0002](decisions/ADR-0002-lossless-raw-data-and-bounded-access.md)：无损类型/词法/出处、物理与逻辑身份分离、有界混合访问。
- [ADR-0003](decisions/ADR-0003-phase-1-sqlite-driver.md)：Phase 1 首选 better-sqlite3；历史三目标门槛由 ADR-0005 部分替代。
- [ADR-0004](decisions/ADR-0004-deterministic-search-semantics.md)：确定性搜索语义独立于 FTS 加速。
- [ADR-0005](decisions/ADR-0005-macos-platform-scope.md)：正式支持 Windows x64 与 macOS arm64，macOS x64 不属于支持目标。
- [ADR-0006](decisions/ADR-0006-electron-build-and-packaging-toolchain.md)：接受 electron-vite + electron-builder 为当前长期构建/打包路线，不永久冻结版本或决定正式发布配置。
- [ADR-0007](decisions/ADR-0007-node-addressing-and-source-lifecycle.md)：Node 物理地址、结构浏览角色、只读来源及 revision 失效。
- [ADR-0008](decisions/ADR-0008-parser-capability-contract-and-source-ranges.md)：可替换 parser 能力契约、一致 raw semantics 及版本绑定的可重建范围。
- [ADR-0009](decisions/ADR-0009-search-completeness-and-optional-acceleration.md)：完整搜索覆盖、可重建 SQLite、可观察回退与可选 accelerator。
- [ADR-0010](decisions/ADR-0010-ui-localization-boundary.md)：UI-only 类型化 localization、稳定协议 code、raw 数据不本地化及测试边界。

## Phase 1A 收尾与平台验收

- 桌面骨架、进程链路、有界类型化 IPC、生命周期/取消/崩溃/重启、better-sqlite3 和 foundation validation/test/formatter/工程规范均已留下实现与验证证据。
- 两个正式平台 native/package gate 已通过；平台范围 ADR-0005 与工具链 ADR-0006 均已接受，Phase 1A 无剩余收尾门槛，正式关闭。macOS x64 不属于支持目标，不再构成 gate。
- 详细收尾与明确未完成领域见 [收尾记录](investigations/phase-1a-closeout.md)；签名、公证及正式发布不属于本阶段验收。

| Target | Dev | Package | Utility | better-sqlite3 | SQLite smoke |
| --- | --- | --- | --- | --- | --- |
| Windows x64 | 通过 | ASAR 目录包通过 | 通过 | 通过 | 开发/构建/打包态通过 |
| macOS arm64 | 通过 | ASAR .app 目录包通过 | 通过 | 通过 | 开发/构建/打包态通过 |

Phase 2A 的 Node/浏览、parser/range、完整搜索及 UI localization 原则已接受；本轮已实现 raw types、窄 Query API、固定版 parser adapter、工程预算、source revision 与内存范围缓存。SQLite schema、搜索和 accelerator coverage 仍未实现。Dataset Contract、全量生产索引、增量刷新和产品 UI 尚未实现；可见窗口帧率与正式签名/公证未测。基础 IPC 口径见 [PERFORMANCE](PERFORMANCE.md)，真实采样与隔离传输实验保留在原调查报告。

## Phase 1 最终收尾与 Phase 2A 调查历史

- Phase 1 随 Phase 1A 正式关闭；`.gitattributes` 固定自动文本检测与 LF checkout，无 CRLF 例外，不改写历史调查。
- 21 个真实样本结构／词法与分布调查，15 个 Phase 0 指纹一致；外部 HEAD、工作树及所有采样文件未变。
- 受限 SQLite/Exact/LIKE/unicode61/trigram、source range／child summary、Node 与 Electron Main↔Utility 实验完成；八组针对性风险检查通过。
- 中文 [调查报告](investigations/phase-2a-data-access-architecture.md) 与 [紧凑证据](investigations/evidence/phase-2a-measurements.json) 已保存；新增依赖与工具仅在独立 investigation package。
- 调查交付时未改生产 src/package/lockfile，未建立生产索引／契约／关系／产品 UI，未新增已接受 ADR 或操作远程仓库；调查随后纳入 `e049ab4 Complete Phase 2A investigation`。

## Phase 2A 评审收尾

- 正式接受用户确认的原则，新增四份职责独立的 ADR；ADR-0002/0004 仅增加补记，历史决定正文保留。
- 明确 JSON Node ≠ Structural Record ≠ Logical Entity；SourceAddress + Pointer 为物理地址，SourceRange 为失效可重建的访问元数据。
- 接受 parser capability contract、raw 搜索完整覆盖、只读来源与 revision invalidation；不锁定库、schema、匹配选项、预算或 trigram 默认覆盖。
- 接受从第一批 Phase 2 production UI 起统一类型化 localization；更新功能测试与专项 localization 测试边界，本轮不实现 runtime。
- 同步产品、架构、流程和入口，原调查仅追加日期明确的评审补记。报告记录实际文档/格式/diff 验证及最终变更清单；未改生产代码、依赖、配置、工具和证据。

## Phase 2 Raw Access Foundation

- 受控 NodeAddress、只读 workspace/source、stale/reload、revision-bound range 和单任务可取消扫描已生产实现。
- `@streamparser/json@0.0.26` 经统一 adapter 保留六类型和 numeric lexeme；完整小值、摘要、children 分页及 scalar segment 有明确工作/IPC 预算。
- 普通测试 65 项通过，专用六来源只读 gate 通过；Windows x64 dev/built/ASAR packaged raw smoke 和九阶段完整验收通过。
- macOS 27.0.1 / Apple M2 原生 arm64：65 项普通测试、临时 filesystem/watcher/stat 回退探针、六来源真实数据 gate、dev/built/ASAR packaged raw smoke 均通过。parser runtime dependency 与 better-sqlite3 native unpack 实际可用；无 production bug 或源码修改，详见 [Mac 验证报告](investigations/phase-2-raw-access-macos-arm64-validation.md)。
- 未新增产品 UI、SQLite 持久化、search/trigram、Dataset Contract 或 source writes；更大 scalar/child-index 优化未做。两平台 gate 不代表所有文件系统、严格 snapshot isolation、正式性能 SLA 或整个 Phase 2 已完成。

## 下一步

Slice A 已评审，Slice B localization 已获授权并实现；最终 Windows gate 与评审状态见本页顶部及 [Slice B 报告](investigations/phase-2-source-browser-slice-b-localization-foundation.md)。两片新实现的 macOS arm64 验收 deferred 到累计 Source Browser 原生 gate，未豁免，不借用旧 Raw Foundation 结果。

本轮结束等待用户与 ChatGPT review，不自动开始 Slice C、Zag/TanStack Virtual、Source Explorer/Node Browser、搜索或 Dataset Contract。签名、发布与正式性能预算留在对应阶段。
