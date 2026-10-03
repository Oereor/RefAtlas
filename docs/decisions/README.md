# 架构决策记录

这里保存明确接受的决定，证据放在 [investigations](../investigations/README.md)。当前结论见 [ARCHITECTURE](../ARCHITECTURE.md)，产品原则见 [PROJECT](../PROJECT.md)。

## 已接受决策

| 编号 | 决策 | 状态 |
| --- | --- | --- |
| [ADR-0001](ADR-0001-desktop-stack-and-process-model.md) | 桌面栈与 Renderer/Preload/Main/Utility Process 边界 | 已接受 |
| [ADR-0002](ADR-0002-lossless-raw-data-and-bounded-access.md) | 无损原始数据、物理/逻辑身份与有界混合访问 | 已接受 |
| [ADR-0003](ADR-0003-phase-1-sqlite-driver.md) | Phase 1 首选 better-sqlite3，保留历史打包验证门槛 | 已接受，目标范围由 ADR-0005 部分替代 |
| [ADR-0004](ADR-0004-deterministic-search-semantics.md) | 确定性检索语义，最终 FTS 加速方案未决 | 已接受 |
| [ADR-0005](ADR-0005-macos-platform-scope.md) | 正式支持 Windows x64 与 macOS arm64 | 已接受 |
| [ADR-0006](ADR-0006-electron-build-and-packaging-toolchain.md) | electron-vite + electron-builder 长期构建与打包路线，不永久冻结版本 | 已接受 |
| [ADR-0007](ADR-0007-node-addressing-and-source-lifecycle.md) | NodeAddress、Structural Record 浏览角色、只读来源与 revision invalidation | 已接受，细化 ADR-0002 地址条款 |
| [ADR-0008](ADR-0008-parser-capability-contract-and-source-ranges.md) | 可替换 parser 能力契约、一致 raw semantics、版本绑定可重建 SourceRange | 已接受，补充 ADR-0002 |
| [ADR-0009](ADR-0009-search-completeness-and-optional-acceleration.md) | 搜索完整性、可重建 SQLite、可观察回退与 optional accelerator | 已接受，补充 ADR-0004 |
| [ADR-0010](ADR-0010-ui-localization-boundary.md) | UI-only 类型化 localization、raw/protocol 边界与测试原则 | 已接受，从首批 Phase 2 production UI 起 |

## 维护约定

文件采用 `ADR-0001-英文短名.md` 起的顺序编号；内容采用中文，包含状态、日期、背景、决定、后果、替代/推迟方案与证据链接。已接受方向不等于实现完成，版本快照与候选方案不自动成为决定。

候选不冒充已接受 ADR。变更时新增记录，旧记录标为被替代并链接，不改写历史，不以改写调查报告代替决策。

Phase 1 与 Phase 1A 已关闭；ADR-0005/0006 与 [双平台收尾](../investigations/phase-1a-closeout.md) 证据继续有效。Phase 2A 已评审并关闭，用户确认的原则进入 ADR-0007–0010，见 [评审收尾](../investigations/phase-2a-review-closeout.md)。[历史调查](../investigations/phase-2a-data-access-architecture.md) 中的候选不会自动成为决定；本轮用户授权实现的 raw types、parser、revision 和预算见 [Raw Access Foundation 报告](../investigations/phase-2-raw-access-foundation.md)，属于 ADR 内的工程实现，不新增或改写 ADR。搜索/schema/accelerator 等仍为候选。
