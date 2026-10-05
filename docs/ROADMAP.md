# 高层路线图

进度见 [STATUS](STATUS.md)，阶段推进需评审，不自动执行。

| 阶段 | 高层范围 |
| --- | --- |
| Phase 0 | 引导、规范、勘察、性能实验、生态调查；已完成评审并关闭 |
| Phase 1：CLOSED（Phase 1A：CLOSED） | 桌面基础、两个正式平台 gate 与工具链决定齐备，无剩余 Phase 1 子阶段 |
| Phase 2：production implementation STARTED | Raw Access、Source Explorer、Node Browser/Inspector、source lifecycle / stale / reload；generic browsing foundation 双平台 gate 已验证（限制见 STATUS）；minimal Source Locator、active-source Find 与 FEFF correctness work 待独立授权；Search investigation line 已关闭，全库内容搜索 deferred |
| Phase 3 | Phase 3A Dataset Contract architecture / investigation → Dataset Contract → Forward Reference Resolution → Inspector reference preview → Incoming References → reference navigation / local graph；各阶段单独授权 |
| Phase 4 / 后续 UX | Tabs / History / 固定/Compare / Diff、性能与体验；Global Content Search 仅在真实需求触发范围复审后重新规划 |
| Phase 5 | 可选 Agent，作为 Query API 客户端，先读与调查 |

## 已完成：Phase 1A — 桌面基础与架构验证

本阶段已完成并关闭：两个正式平台 gate 均已验证，electron-vite + electron-builder 长期路线已由 [ADR-0006](decisions/ADR-0006-electron-build-and-packaging-toolchain.md) 接受；状态与证据以 STATUS 为准。已完成范围如下：

- 最小 Electron/Svelte 应用，Renderer/Preload/Main/Utility Process 拓扑与有界类型化 IPC。
- Utility Process 生命周期、请求取消、崩溃/重启行为及基本渲染响应。
- Windows 开发/构建冒烟，以及 Windows x64、macOS arm64 打包后 better-sqlite3 加载冒烟。
- 验证构建工具集成与打包配置，建立后续测试/CI 基础；接受的栈不等于接受具体版本矩阵。

## 下一阶段边界

Phase 1 整体已关闭，无剩余 Phase 1B 或其他子阶段。Phase 2 Raw Access Foundation、Source Browser A/B/C/D/E 已实现，双平台 generic browsing foundation gate 已验证（Mac minimize 限台前调度关闭），评审状态见 STATUS。

2026-10-05 的 [ADR-0011](decisions/ADR-0011-search-scope-and-reference-first-direction.md) 正式调整搜索产品范围。Workspace-wide raw content search 不再是进入 Phase 3 的 blocker；Tabs / History / Compare / Diff 也不是前置条件。minimal Source Locator 与 active-source Find 保留为小范围 Phase 2 UX 能力，分别授权，不自动启动。FEFF 是近期独立 Raw Access correctness task，与 TextMap/reference preview fidelity 相关，缺陷保持 OPEN。

本次收尾后 STOP / WAIT FOR REVIEW；预期下一架构焦点为 Phase 3A — Dataset Contract architecture / investigation，评审后另行授权，不自动进入任何实现。Search/S1/content cache/FTS-trigram/Search Utility 为 DEFER，compact hash 为 DROP from current V1 candidate set；历史技术未知项不因产品 defer 被宣称解决。

## Phase 2A — 原始数据访问与记录模型调查

调查与评审已 CLOSED / REVIEWED，见 [历史调查](investigations/phase-2a-data-access-architecture.md) 和 [评审收尾](investigations/phase-2a-review-closeout.md)。真实结构、类型/词法、查询/索引/范围及预算实验保持非生产；已确认原则进入 ADR-0007–0010，具体实现候选不自动接受。

首个 production slice **Data Service / Raw Access Foundation** 已按用户授权完成：NodeAddress、source revision、parser adapter、只读 source lifecycle、bounded query primitives。证据见 [实现报告](investigations/phase-2-raw-access-foundation.md)，不包含 full search、trigram、Source Browser UI 或 Dataset Contract。

用户已授权 Source Browser Slice A：Directory Discovery + Active Source Lifecycle；该片实现底层目录发现与显式 source 生命周期，验收/评审状态见 [STATUS](STATUS.md)及 [报告](investigations/phase-2-source-browser-slice-a-directory-lifecycle.md)。Slice A 自身没有正式 Source Browser UI；Slice C 状态见下文。

Slice B localization 已获独立授权并实现 UI-only 基础，验收/评审以 STATUS 为准；Slice C Source Explorer shell、Slice D Node Browser/Inspector、Slice E change/integration 已独立授权实现。A/B/C/D 累计 macOS arm64 Source Browser 验收已 PASS WITH FIXES，证据见 [累计报告](investigations/phase-2-source-browser-macos-arm64-validation.md)；共享 watcher Windows native preflight 已完成；Slice E 新 diff 的 [Mac 定向验收](investigations/phase-2-source-browser-slice-e-macos-arm64-validation.md) 已 PASS WITH FIXES，仅 harness 修改；A/B/C/D/E generic browsing foundation 平台 gate 在报告范围关闭，台前调度开启组合的 minimize 保留限制。当前 Phase 2 剩余方向为 Source Locator、Find in Source 与 FEFF raw correctness；Dataset Contract、显式引用和 graph 留在 Phase 3，tabs/history 留后续 UX，完整 workspace content search 已 defer。
