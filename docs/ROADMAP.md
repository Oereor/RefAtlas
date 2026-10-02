# 高层路线图

进度见 [STATUS](STATUS.md)，阶段推进需评审，不自动执行。

| 阶段 | 高层范围 |
| --- | --- |
| Phase 0 | 引导、规范、勘察、性能实验、生态调查；已完成评审并关闭 |
| Phase 1（Phase 1A 已关闭） | Phase 1A 桌面基础已完成并关闭；两个正式平台 gate 与工具链决定齐备，不自动关闭整个 Phase 1 |
| Phase 2 | 源浏览、记录视图、搜索、标签页/历史、有界 JSON |
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

Phase 2／后续阶段未启动。下一阶段需由用户单独授权；Phase 1A closeout 本身不授权后续数据模型或产品功能实现。保持既有阶段结构，Phase 3–5 仍仅为方向，不设计详细接口。
