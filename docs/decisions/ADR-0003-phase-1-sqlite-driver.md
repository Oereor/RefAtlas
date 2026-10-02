# ADR-0003：Phase 1 SQLite 驱动

- 状态：已接受，保留打包运行时验证门槛。
- 日期：2026-10-02（UTC+8）。
- 适用阶段：Phase 1 存储实现方向。

范围补记（2026-10-02，UTC+8）：下述历史三目标 native/package gate 已由 [ADR-0005](ADR-0005-macos-platform-scope.md) 部分替代为 Windows x64 与 macOS arm64，macOS x64 不再构成 gate。SQLite 驱动方向及其他边界仍有效；原决定正文保留。

## 背景

Phase 0 比较了 node:sqlite 与 better-sqlite3。better-sqlite3 的成熟 API、当前生态以及 Windows Electron Utility Process 探针支持其可用性；代表性查询表现良好，测试工作负载中的插入更快。node:sqlite 在调查版本中仍是 release-candidate API。

## 决定

- Phase 1 首选 better-sqlite3；接受驱动方向，不将实验锁定版本直接规定为永久生产版本。
- SQLite 属于 Data Service，通过窄内部存储边界隔离驱动，不引入 ORM；本次不设计 IndexStore 或其他生产 API。
- 原始类型与大整数规则遵循 [ADR-0002](ADR-0002-lossless-raw-data-and-bounded-access.md)，不能因驱动选择改成 Number/signed INTEGER 全覆盖。
- 必须在 Windows x64、macOS x64、macOS arm64 的打包应用中验证原生模块加载与实际数据库访问。

## 后果

需要管理原生模块、打包解包与签名环境。Windows 未打包探针成功不证明三个目标的发布包成功。只接受方向，不宣称驱动在所有工作负载中更快。

## 替代与复审条件

node:sqlite 保留为已调查替代方案，当前不是 Phase 1 首选。如果打包验证存在实质困难，可复审存储实现而保持高层 Query API 语义不变；不要未经评审静默切换驱动。FTS 和正式索引 schema 仍需后续设计。

## 证据

- [SQLite 调查与原生探针](../investigations/phase-0-feasibility.md#10-sqlite-驱动评估)。
- [代表性索引基线](../PERFORMANCE.md#3-sqlite-代表性索引)。
- [历史运行时证据](../investigations/evidence/phase-0-measurements.json)。
