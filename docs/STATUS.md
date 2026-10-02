# 当前状态

更新日期：2026-10-02（UTC+8）。

**Phase 0 已关闭／已接受。下一步为 Phase 1A：桌面基础与架构验证，尚未开始实施。** 当前没有生产桌面脚手架。

## 已完成

- 核实实际目录 TurnBasedGameData，外部仓库初始干净。
- 项目文档整体迁入应用仓库 `docs/`，外层旧目录已移除，证据保留；本次收尾变更尚未提交。
- 建立产品边界、文档权威模型与实验隔离规则。
- 完成全数据集规模/前 30 大文件统计、15 个代表结构、ID/引用形态调查。
- 完成 42 个重复基准：完整解析、流式与两种 SQLite 驱动；样本指纹和仓库状态一致。
- 完成 Windows x64 Electron 44.5.1 utilityProcess 双驱动/FTS5/BigInt 探针。
- 完成官方版本/兼容范围、构建工具、UI 候选与跨平台发布文档调查。
- 交付中文报告、性能基线与紧凑历史证据；针对性测试通过。
- 评审并接受四项 ADR，更新当前架构、文档路径和维护规则；历史调查只增加收尾补记及必要链接修复。

## 已接受决策

- [ADR-0001](decisions/ADR-0001-desktop-stack-and-process-model.md)：Electron/Svelte 5/TypeScript 与 Utility Process 数据服务，初始无 Worker Threads。
- [ADR-0002](decisions/ADR-0002-lossless-raw-data-and-bounded-access.md)：无损类型/词法/出处、物理与逻辑身份分离、有界混合访问。
- [ADR-0003](decisions/ADR-0003-phase-1-sqlite-driver.md)：Phase 1 首选 better-sqlite3，保留三个目标打包验证门槛。
- [ADR-0004](decisions/ADR-0004-deterministic-search-semantics.md)：确定性搜索语义独立于 FTS 加速。

## 剩余 Phase 1A 门槛

- 选择并验证构建工具集成、具体 Vite/打包配置；未批准 Phase 0 的版本矩阵。
- 验证 Windows x64、macOS x64/arm64 打包后 better-sqlite3 原生加载与访问。
- 验证有界类型化 IPC、MessagePort、取消/请求生命周期、utility 启动/崩溃/恢复与 renderer 响应。
- 后续设计原始记录/IPC 类型、源地址、契约/索引 schema、大小阈值，并评估中文短词与 FTS/子串回退；本次不创建这些接口。

未测：全量生产索引、源字节范围、增量刷新、IPC/UI 性能、生产构建、macOS 两架构与签名/公证。它们不是已完成能力；测量口径见 [PERFORMANCE](PERFORMANCE.md)。

## 下一步

本次收尾结束后停止。Phase 1A 属于后续独立实施任务；签名凭据、发布配置和正式性能预算在对应阶段处理。文档与应用使用同一 Git 仓库，不再维护外层项目文档。
