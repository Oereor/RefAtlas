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

## 版本管理

2026-10-02 Phase 0 收尾时，文档整体从工作区外层迁入本仓库 `docs/`，保留调查与证据，不另建文档仓库。此次迁移、ADR 和文档更新尚未提交；提交应用仓库变更时应一起审查和纳入这些文档。

影响架构、状态、路线图或性能事实的代码与权威文档在同一审查变更中演进；不影响文档事实的琐碎实现不要求无意义文档修改。迁移前的版本管理情况是历史事实，保留于 [Phase 0 调查](investigations/phase-0-feasibility.md)，不代表当前布局。
