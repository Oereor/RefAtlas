# 高层路线图

进度见 [STATUS](STATUS.md)，阶段推进需评审，不自动执行。

| 阶段 | 高层范围 |
| --- | --- |
| Phase 0 | 引导、规范、勘察、性能实验、生态调查；已完成评审并关闭 |
| Phase 1：CLOSED（Phase 1A：CLOSED） | 桌面基础、两个正式平台 gate 与工具链决定齐备，无剩余 Phase 1 子阶段 |
| Phase 2：production implementation STARTED | Phase 2A CLOSED / REVIEWED；Raw Access Foundation COMPLETE；Source Browser Slice A Windows validated / awaiting macOS validation and review；后续 UI、搜索、标签页/历史需单独授权 |
| Phase 3 | Dataset Contract、出入引用、导航、局部图 |
| Phase 4 | 固定/比较、diff、高级搜索、性能与体验 |
| Phase 5 | 可选 Agent，作为 Query API 客户端，先读与调查 |

## 已完成：Phase 1A — 桌面基础与架构验证

本阶段已完成并关闭：两个正式平台 gate 均已验证，electron-vite + electron-builder 长期路线已由 [ADR-0006](decisions/ADR-0006-electron-build-and-packaging-toolchain.md) 接受；状态与证据以 STATUS 为准。已完成范围如下：

- 最小 Electron/Svelte 应用，Renderer/Preload/Main/Utility Process 拓扑与有界类型化 IPC。
- Utility Process 生命周期、请求取消、崩溃/重启行为及基本渲染响应。
- Windows 开发/构建冒烟，以及 Windows x64、macOS arm64 打包后 better-sqlite3 加载冒烟。
- 验证构建工具集成与打包配置，建立后续测试/CI 基础；接受的栈不等于接受具体版本矩阵。

## 下一阶段边界

Phase 1 整体已关闭，无剩余 Phase 1B 或其他子阶段。用户已授权并完成 Phase 2 Raw Access Foundation；本轮结束等待评审，不自动开始其他 production slices。Phase 3–5 仍仅为方向。

## Phase 2A — 原始数据访问与记录模型调查

调查与评审已 CLOSED / REVIEWED，见 [历史调查](investigations/phase-2a-data-access-architecture.md) 和 [评审收尾](investigations/phase-2a-review-closeout.md)。真实结构、类型/词法、查询/索引/范围及预算实验保持非生产；已确认原则进入 ADR-0007–0010，具体实现候选不自动接受。

首个 production slice **Data Service / Raw Access Foundation** 已按用户授权完成：NodeAddress、source revision、parser adapter、只读 source lifecycle、bounded query primitives。证据见 [实现报告](investigations/phase-2-raw-access-foundation.md)，不包含 full search、trigram、Source Browser UI 或 Dataset Contract。

用户已授权 Source Browser Slice A：Directory Discovery + Active Source Lifecycle；本轮实现底层目录发现与显式 source 生命周期，验收/评审状态见 [STATUS](STATUS.md)及 [报告](investigations/phase-2-source-browser-slice-a-directory-lifecycle.md)。没有正式 Source Browser UI。

后续 Slice B localization → Source Explorer shell → Node Browser/Inspector → change/integration 仍需独立授权；第一批正式 UI 必须建立 UI-only localization 基础。完整搜索、tabs/history 留后续 Phase 2 slices，Dataset Contract、显式引用和 graph 留在 Phase 3。
