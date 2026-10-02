# ADR-0001：桌面技术栈与进程模型

- 状态：已接受。
- 日期：2026-10-02（UTC+8）。
- 适用阶段：Phase 1 起；本记录不表示应用已实现。

后续补记（2026-10-02，UTC+8）：Phase 1A 桌面基础与正式平台 gate 已完成；electron-vite + electron-builder 路线现由 [ADR-0006](ADR-0006-electron-build-and-packaging-toolchain.md) 接受，具体版本及正式发布配置不在该接受范围内。下文保留本 ADR 当时的决定与推迟事项，当前状态见 [STATUS](../STATUS.md)。

## 背景

RefAtlas 是 Windows/macOS 开发者桌面工作台。数据规模、重型解析和索引不能由 UI 或生命周期主进程承担。Phase 0 的 Windows Electron utilityProcess 数据探针已提供初始可行性证据。

## 决定

- 接受 Electron、Svelte 5、TypeScript，桌面优先，通过 GitHub Releases 分发，不计划网页部署。
- 初始拓扑为 Renderer → Preload 类型化窄桥 → Main → Utility Process → Data Service。
- Renderer 仅负责展示与交互，不直接任意读取工作区文件、不拥有 SQLite、不解析巨大数据集或持有整份巨大原文。
- Preload 只暴露窄类型 API，不暴露 unrestricted IPC、ipcRenderer 或 Node API。
- Main 管理生命周期、窗口、对话框、工作区编排和数据进程生命周期，不成为重型数据引擎。
- Data Service 位于 Utility Process，负责未来扫描、解析/流式、索引、SQLite、搜索、记录访问和引用查询。
- Worker Threads 不属于初始架构；只有测量表明具体需要时再评审引入。

## 后果

数据服务有独立进程和消息边界，带来进程内存及生命周期管理成本。Phase 1A 需验证有界类型化 IPC、启动/取消/崩溃/重启和打包入口，不能把单探针当作完整进程架构验收。

## 推迟的方案与细节

具体 Query API、IPC 线格式、取消与恢复协议均未设计。electron-vite、Vite 版本、electron-builder/Forge 集成及发布配置待 Phase 1A 验证；不接受 Phase 0 提议的具体版本矩阵为永久架构。child_process 仍用于隔离调查，不是生产默认拓扑。

## 证据

- [Phase 0 进程模型与构建调查](../investigations/phase-0-feasibility.md#11-electron-进程模型)。
- [运行时与样本证据](../investigations/evidence/phase-0-measurements.json)。
- [性能口径](../PERFORMANCE.md)。
