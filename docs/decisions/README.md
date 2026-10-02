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

## 维护约定

文件采用 `ADR-0001-英文短名.md` 起的顺序编号；内容采用中文，包含状态、日期、背景、决定、后果、替代/推迟方案与证据链接。已接受方向不等于实现完成，版本快照与候选方案不自动成为决定。

候选不冒充已接受 ADR。变更时新增记录，旧记录标为被替代并链接，不改写历史，不以改写调查报告代替决策。

Phase 1A 已完成并关闭；ADR-0005 决定正式平台范围，ADR-0006 正式接受 electron-vite + electron-builder 长期路线。六项决定与既有平台证据齐备，当前版本组合不成为永久架构要求；见 [收尾记录](../investigations/phase-1a-closeout.md)、[Windows 验证报告](../investigations/phase-1a-foundation.md) 与 [macOS 验证报告](../investigations/phase-1a-macos-arm64-validation.md)。后续阶段未启动，需单独授权。
