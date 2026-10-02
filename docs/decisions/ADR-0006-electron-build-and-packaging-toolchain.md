# ADR-0006：Electron 构建与打包工具链

- 状态：已接受。
- 日期：2026-10-02（UTC+8）。
- 适用阶段：Phase 1A 收尾及后续桌面开发维护；不授权下一产品阶段。

## 背景

Phase 0 调查过 electron-vite + electron-builder、Electron Forge + Vite plugin 及 Forge + 独立 Vite，但没有接受具体工具链。Phase 1A 随后使用 electron-vite + electron-builder 建立独立生产基础，完成 Windows x64 与原生 Apple Silicon macOS arm64 的真实开发、构建及 ASAR 打包验证。用户现明确接受该路线作为 RefAtlas 当前长期构建与打包工具链。

## 决定

- 接受 electron-vite 负责 Main build、sandbox Preload build、Renderer/Vite 集成、Utility Process 生产入口与 bundling，以及 development workflow。
- 接受 electron-builder 负责 Windows x64 与 macOS arm64 packaging、ASAR、native addon unpack，以及后续 release packaging 的基础。
- 正式支持平台遵循 [ADR-0005](ADR-0005-macos-platform-scope.md)：Windows x64、macOS arm64。macOS x64 不支持，不要求 Intel macOS 或 Rosetta gate。
- 保持 [ADR-0001](ADR-0001-desktop-stack-and-process-model.md) 的 Renderer → Preload 类型化窄桥 → Main → Utility Process → Data Service 边界；工具链选择不放宽 sandbox/context isolation、有界 IPC 或数据库进程所有权。

## 版本与升级

本 ADR 接受的是工具链类别与职责边界，不永久 pin 当前 Phase 1A 版本矩阵。Electron 44.5.1、electron-vite 5.0.0、Vite 7.3.6、electron-builder 26.15.3 等只是当前已验证组合；具体可复现版本继续由 package/lockfile 精确锁定，未来允许正常维护升级。

重大 Electron/build/native/packaging 升级应重新核对 Node engines、peer dependencies、Electron runtime、N-API/native addon、Utility Process entry、Preload sandbox 和 ASAR/native unpack，并对受影响的正式支持平台重新执行必要 package smoke。按风险和 [Validation Cadence](../DEVELOPMENT-PROCESS.md#validation-cadence) 决定验证范围，不要求所有 patch/minor 更新无条件完整跨平台重验。

## 验证依据与后果

- Windows x64 已验证 dev、production build、ASAR 目录包、Utility Process、sandbox Preload、better-sqlite3 native load、真实 SQLite 往返/清理、取消/崩溃/恢复及 foundation validation pipeline。
- macOS arm64 已在原生 Apple Silicon、非 Rosetta 环境启动实际 `.app`，验证 Utility/MessagePort/sandbox、ASAR unpack、darwin-arm64 native addon、SQLite 真实读写与清理，以及普通打包模式 diagnostics protection。
- 双平台证据覆盖当前桌面基础与原生打包风险，足以支持路线接受；不等价于真实数据负载、签名发布或产品功能验收。

后续桌面开发沿用这一路线，减少构建/打包选择的不确定性；仍须维护 peer/engine 与原生运行时兼容性。如出现实质阻碍，应通过新的评审/ADR 复审路线，不把当前版本或配置当作永久不可变约束。

## 不在本 ADR 范围内

不决定 CI provider、GitHub Actions release workflow、Windows code signing、macOS Developer ID、notarization、DMG/installer 最终形式、auto-update 或 release cadence。不冻结包版本，也不开始 Query API、RawRecord、Dataset Contract、生产索引、搜索或产品 UI。

## 证据

- [Phase 0 可行性与工具链调查](../investigations/phase-0-feasibility.md)。
- [Phase 1A Windows 桌面基础交付与验证](../investigations/phase-1a-foundation.md)。
- [Phase 1A 工程规范与工具链清理](../investigations/phase-1a-development-policy-cleanup.md)。
- [Phase 1A macOS arm64 原生验证](../investigations/phase-1a-macos-arm64-validation.md)。
- [Phase 1A 正式收尾](../investigations/phase-1a-closeout.md)。
