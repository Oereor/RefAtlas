# 高层路线图

进度见 [STATUS](STATUS.md)，阶段推进需评审，不自动执行。

| 阶段 | 高层范围 |
| --- | --- |
| Phase 0 | 引导、规范、勘察、性能实验、生态调查；已完成评审并关闭 |
| Phase 1（当前 Phase 1A） | Windows x64 与 macOS arm64 gate 均通过，技术验证完成；长期工具链接受待评审，Phase 1 未自动关闭 |
| Phase 2 | 源浏览、记录视图、搜索、标签页/历史、有界 JSON |
| Phase 3 | Dataset Contract、出入引用、导航、局部图 |
| Phase 4 | 固定/比较、diff、高级搜索、性能与体验 |
| Phase 5 | 可选 Agent，作为 Query API 客户端，先读与调查 |

## 下一步：Phase 1A — 桌面基础与架构验证

本阶段范围如下；两个正式平台 gate 均已验证，长期工具链待评审状态以 STATUS 为准：

- 最小 Electron/Svelte 应用，Renderer/Preload/Main/Utility Process 拓扑与有界类型化 IPC。
- Utility Process 生命周期、请求取消、崩溃/重启行为及基本渲染响应。
- Windows 开发/构建冒烟，以及 Windows x64、macOS arm64 打包后 better-sqlite3 加载冒烟。
- 验证构建工具集成与打包配置，建立后续测试/CI 基础；接受的栈不等于接受具体版本矩阵。

Phase 3–5 仅为方向，不设计详细接口。本轮仅实现明确授权的 Phase 1A 基础；后续数据模型、产品功能和阶段推进仍需独立授权。
