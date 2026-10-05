# RefAtlas 项目文档

中文权威项目文档位于 `RefAtlas/docs/`，与应用代码纳入同一 Git 仓库。外层 `RefAtlas-Project/` 只是本地工作区容器；同级 `TurnBasedGameData/` 仍为只读外部数据。

Search Round 2 的定向 Electron ACL/execution-lane 收尾见 [报告](investigations/phase-2-search-execution-lane-validation.md)；候选建议等待 review，不自动进入 Search Foundation。当前阶段真相见 STATUS。

## 权威模型

| 文档 | 唯一职责 |
| --- | --- |
| [PROJECT](PROJECT.md) | 稳定产品定义、原则与非目标，不记录进度 |
| [ROADMAP](ROADMAP.md) | 阶段范围，不存详细实验结果 |
| [STATUS](STATUS.md) | 当前状态、待审事项、下一步 |
| [ARCHITECTURE](ARCHITECTURE.md) | 当前已接受约束，不纳入未决方案 |
| [PERFORMANCE](PERFORMANCE.md) | 口径、基线、性能政策 |
| [DEVELOPMENT-PROCESS](DEVELOPMENT-PROCESS.md) | 工作、验证、维护流程 |
| [decisions](decisions/README.md) | 已接受决定及替代历史 |
| [investigations](investigations/README.md) | 历史证据、候选与局限，非规范架构 |

信息在所属文档维护，其他文档链接引用。重大任务先读 PROJECT → STATUS → ARCHITECTURE → 相关 ADR/调查；性能任务再读 PERFORMANCE。结束更新当前状态与权威文档。

Phase 1 与 Phase 1A 均已完成并关闭，见 [收尾记录](investigations/phase-1a-closeout.md)；electron-vite + electron-builder 路线已由 [ADR-0006](decisions/ADR-0006-electron-build-and-packaging-toolchain.md) 接受，不永久冻结版本。具体版本、验证命令、打包策略和局限仍保留在 [Windows 交付报告](investigations/phase-1a-foundation.md) 与 [macOS 原生报告](investigations/phase-1a-macos-arm64-validation.md)；开发入口见 [应用 README](../README.md)。Phase 2A investigation 已 CLOSED / REVIEWED，已确认原则进入 ADR-0007–0010，见 [评审收尾](investigations/phase-2a-review-closeout.md)；[原始调查](investigations/phase-2a-data-access-architecture.md) 保留历史候选与证据。当前架构由权威文档/ADR 表达，Phase 2 production implementation 已 STARTED，Raw Access Foundation 已完成并待本轮评审，见 [实现报告](investigations/phase-2-raw-access-foundation.md)；不自动开始下一块。

## 版本管理

Source Browser Slice A 历史实现与 Windows 验收见 [报告](investigations/phase-2-source-browser-slice-a-directory-lifecycle.md)及 [STATUS](STATUS.md)；Slice A 已评审并明确授权 Slice B；历史延期的 macOS gate 已由本轮累计报告验证。Slice B 的 localization、生成流程与 Windows/macOS 状态见 [报告](investigations/phase-2-source-browser-slice-b-localization-foundation.md)，没有正式 Source Browser UI。

2026-10-02 Phase 0 收尾时，文档整体从工作区外层迁入本仓库 `docs/`，保留调查与证据，不另建文档仓库。迁移、四份已接受 ADR 和文档更新已纳入 `809a4a5 Closeout Phase 0`；后续实现与相关文档继续一起审查。

影响架构、状态、路线图或性能事实的代码与权威文档在同一审查变更中演进；不影响文档事实的琐碎实现不要求无意义文档修改。迁移前的版本管理情况是历史事实，保留于 [Phase 0 调查](investigations/phase-0-feasibility.md)，不代表当前布局。

Source Browser Slice C 已建立正式 shell、工作区、managed/virtualized Explorer 和最小 source activation，Node Browser/Inspector 已由 Slice D 接入；验收与平台状态见 [Slice C 报告](investigations/phase-2-source-browser-slice-c-source-explorer.md)及 STATUS。

Source Browser Slice D 已实现当前 revision 的 Node Browser 与 Inspector；完整 Windows runner 与可选 Copy Pointer 延期证据见 [报告](investigations/phase-2-source-browser-slice-d-node-browser-inspector.md)。Slice A/B/C/D macOS arm64 累计原生验收已 PASS WITH FIXES，见 [累计报告](investigations/phase-2-source-browser-macos-arm64-validation.md)；共享 watcher Windows native preflight 已在 Slice E 完成。Slice E 新实现与位置恢复、窗口 monitoring 和跨平台范围见 [报告](investigations/phase-2-source-browser-slice-e-change-reload-integration.md)；Slice E 新 diff 的 [macOS 定向验收](investigations/phase-2-source-browser-slice-e-macos-arm64-validation.md) 已 PASS WITH FIXES，仅 harness 修改；原生 minimize 限台前调度关闭，开启组合保留限制。A/B/C/D/E generic browsing foundation 平台 gate 在该范围关闭；下一节点为报告 review，不自动进入 Search。
