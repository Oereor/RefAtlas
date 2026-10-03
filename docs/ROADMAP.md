# 高层路线图

进度见 [STATUS](STATUS.md)，阶段推进需评审，不自动执行。

| 阶段 | 高层范围 |
| --- | --- |
| Phase 0 | 引导、规范、勘察、性能实验、生态调查；已完成评审并关闭 |
| Phase 1：CLOSED（Phase 1A：CLOSED） | 桌面基础、两个正式平台 gate 与工具链决定齐备，无剩余 Phase 1 子阶段 |
| Phase 2：产品实现 NOT STARTED | Phase 2A 先调查原始数据访问与记录模型；后续源浏览、记录视图、搜索、标签页/历史、有界 JSON 需评审后授权 |
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

Phase 1 整体已关闭，无剩余 Phase 1B 或其他子阶段。Phase 2 产品实现未启动，需要评审与单独授权；Phase 3–5 仍仅为方向。

## Phase 2A — 原始数据访问与记录模型调查

调查已完成／待评审，见 [中文架构报告](investigations/phase-2a-data-access-architecture.md)。覆盖真实结构、raw value、物理地址、结构记录、Query API、SQLite、确定性搜索、parser/源范围与有界访问；实验工具明确非生产。

报告提出后续数据服务／索引基础 → Source Browser → Record View／有界 JSON → 搜索 → tabs/history 的顺序建议，名称与拆分尚未接受。不因此进入 production src，不提前实现 Dataset Contract 或引用。
