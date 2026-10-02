# 当前状态

更新日期：2026-10-02（UTC+8）。

**Phase 0 已关闭／已接受；Phase 1A 的 Windows x64 桌面基础已实现并通过开发态、构建态及 ASAR 打包态验证。** macOS x64／arm64 gate 尚未验证，因此不宣布整个 Phase 1A 或 Phase 1 完成。

## 已完成

- 核实实际目录 TurnBasedGameData，外部仓库初始干净。
- 项目文档整体迁入应用仓库 `docs/`，外层旧目录已移除，证据保留；收尾已提交为 `809a4a5 Closeout Phase 0`。
- 建立产品边界、文档权威模型与实验隔离规则。
- 完成全数据集规模/前 30 大文件统计、15 个代表结构、ID/引用形态调查。
- 完成 42 个重复基准：完整解析、流式与两种 SQLite 驱动；样本指纹和仓库状态一致。
- 完成 Windows x64 Electron 44.5.1 utilityProcess 双驱动/FTS5/BigInt 探针。
- 完成官方版本/兼容范围、构建工具、UI 候选与跨平台发布文档调查。
- 交付中文报告、性能基线与紧凑历史证据；针对性测试通过。
- 评审并接受四项 ADR，更新当前架构、文档路径和维护规则；历史调查只增加收尾补记及必要链接修复。

## 本轮 Phase 1A 已实现与验证

- 独立生产 package/lockfile、electron-vite + Svelte 5 + TypeScript + electron-builder 工具链；兼容证据见 [报告](investigations/phase-1a-foundation.md)。工具链仍是已验证候选，不自行接受新的长期 ADR。
- sandbox / context isolation 窄 Preload bridge、Main 来源与输入校验、Utility ready handshake、MessagePort 和请求匹配。
- 最多 16 KiB 消息、32 个未完成请求（含一个取消控制槽）、批次取消、超时、窗口销毁、异常退出与显式重启；不自动重放请求。
- Utility 内临时 SQLite：Unicode 和大整数文本往返、close/cleanup；Windows ASAR 目录包实际加载预构建 `.node`，普通打包态拒绝故障注入。
- 基础交付时 35 项自动测试、类型检查、开发态/构建态/打包态 smoke、基础响应性与测量；工程清理后的当前测试结果见下节。验证使用 synthetic probe，不证明真实数据产品性能。
- AGENTS 加入所有公网操作经系统 7890 代理的长期规则；修复当前文档过时状态，历史调查仅追加带日期补记。

## 工程规范清理

工程卫生清理（2026-10-02）：引入受限范围的 Prettier、长期 formatter/test/昂贵命令政策和分层验证；调整配置 guard、补充打包编排行为验证，并提供单次生产构建的完整验收入口。当前 6 文件 / 43 项测试、类型检查和 Windows 九阶段完整验收通过，独立打包仍重新构建。具体执行结果与失败修正见 [清理报告](investigations/phase-1a-development-policy-cleanup.md)。这是开发流程改进，不改变 Phase 或跨平台 gate。

## 已接受决策（仍为四项）

- [ADR-0001](decisions/ADR-0001-desktop-stack-and-process-model.md)：Electron/Svelte 5/TypeScript 与 Utility Process 数据服务，初始无 Worker Threads。
- [ADR-0002](decisions/ADR-0002-lossless-raw-data-and-bounded-access.md)：无损类型/词法/出处、物理与逻辑身份分离、有界混合访问。
- [ADR-0003](decisions/ADR-0003-phase-1-sqlite-driver.md)：Phase 1 首选 better-sqlite3，保留三个目标打包验证门槛。
- [ADR-0004](decisions/ADR-0004-deterministic-search-semantics.md)：确定性搜索语义独立于 FTS 加速。

## 剩余 Phase 1A 门槛

- macOS x64 与 macOS arm64 的原生开发／打包／Utility／better-sqlite3／SQLite smoke 均未验证；已提供本地可重复脚本，不用 Windows 成功替代 macOS 证据。
- 待用户评审是否把已验证的 electron-vite + electron-builder 路线接受为长期工具链决定；本轮没有新增已接受 ADR，也没有接受 Phase 0 版本矩阵。

| Target | Dev | Package | Utility | better-sqlite3 | SQLite smoke |
| --- | --- | --- | --- | --- | --- |
| Windows x64 | 通过 | ASAR 目录包通过 | 通过 | 通过 | 开发/构建/打包态通过 |
| macOS x64 | 未验证 | 未验证 | 未验证 | 未验证 | 未验证 |
| macOS arm64 | 未验证 | 未验证 | 未验证 | 未验证 | 未验证 |

后续尚未设计／实现：正式 Query API、原始记录与身份模型、源字节范围、Dataset Contract、索引 schema、全量索引、增量刷新、中文短词/FTS 策略。真实数据负载、可见窗口帧率、macOS 两架构与签名/公证未测；基础 IPC 测量见 [PERFORMANCE](PERFORMANCE.md)。

## 下一步

本轮只实施用户授权的 Phase 1A；签名凭据、发布配置和正式性能预算在对应阶段处理。文档与应用使用同一 Git 仓库，不再维护外层项目文档。
