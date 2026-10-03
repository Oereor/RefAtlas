# RefAtlas 项目文档

中文权威项目文档位于 `RefAtlas/docs/`，与应用代码纳入同一 Git 仓库。外层 `RefAtlas-Project/` 只是本地工作区容器；同级 `TurnBasedGameData/` 仍为只读外部数据。

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

Phase 1 与 Phase 1A 均已完成并关闭，见 [收尾记录](investigations/phase-1a-closeout.md)；electron-vite + electron-builder 路线已由 [ADR-0006](decisions/ADR-0006-electron-build-and-packaging-toolchain.md) 接受，不永久冻结版本。具体版本、验证命令、打包策略和局限仍保留在 [Windows 交付报告](investigations/phase-1a-foundation.md) 与 [macOS 原生报告](investigations/phase-1a-macos-arm64-validation.md)；开发入口见 [应用 README](../README.md)。Phase 2A investigation 已 CLOSED / REVIEWED，已确认原则进入 ADR-0007–0010，见 [评审收尾](investigations/phase-2a-review-closeout.md)；[原始调查](investigations/phase-2a-data-access-architecture.md) 保留历史候选与证据。当前架构由权威文档/ADR 表达，Phase 2 产品实现仍 NOT STARTED，需单独授权。

## 版本管理

2026-10-02 Phase 0 收尾时，文档整体从工作区外层迁入本仓库 `docs/`，保留调查与证据，不另建文档仓库。迁移、四份已接受 ADR 和文档更新已纳入 `809a4a5 Closeout Phase 0`；后续实现与相关文档继续一起审查。

影响架构、状态、路线图或性能事实的代码与权威文档在同一审查变更中演进；不影响文档事实的琐碎实现不要求无意义文档修改。迁移前的版本管理情况是历史事实，保留于 [Phase 0 调查](investigations/phase-0-feasibility.md)，不代表当前布局。
