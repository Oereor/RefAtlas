# RefAtlas

面向开发者、逆向研究者和配置维护者的桌面原始配置与显式引用调查工作台。

**Phase 0 已关闭／已接受，Phase 1A 尚未实施。** 尚无生产 Electron/Svelte 应用；`tools/investigation/` 仅用于可复现的非生产实验。

## 开始阅读

- [文档入口](docs/README.md)：职责与阅读顺序。
- [产品定义](docs/PROJECT.md)、[当前状态](docs/STATUS.md)、[已接受架构](docs/ARCHITECTURE.md)、[ADR](docs/decisions/README.md)。
- [调查工具](tools/investigation/README.md)：实验复现。

`../TurnBasedGameData/` 是只读外部数据，不复制、不修改、不作为子模块。权威项目文档位于本仓库 `docs/`，与应用代码使用同一 Git 仓库；工作区外层只是本地容器。

已接受 Electron、Svelte 5、TypeScript，以及 Utility Process 数据服务和 Phase 1 首选 better-sqlite3。具体构建/打包工具与版本仍需 Phase 1A 验证；目标 Windows/macOS，通过 GitHub Releases 分发，不是网页服务。

贡献前阅读 [AGENTS.md](AGENTS.md)。保留 [MIT 许可证](LICENSE)。

