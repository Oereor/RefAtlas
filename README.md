# RefAtlas

面向开发者、逆向研究者和配置维护者的桌面原始配置与显式引用调查工作台。

当前为 **Phase 0：引导与可行性调查**，尚未创建生产 Electron/Svelte 应用。`tools/investigation/` 仅用于非生产实验。

## 开始阅读

- [文档入口](../docs/README.md)：职责与阅读顺序。
- [产品定义](../docs/PROJECT.md)、[当前状态](../docs/STATUS.md)、[架构约束](../docs/ARCHITECTURE.md)。
- [调查工具](tools/investigation/README.md)：实验复现。

`../TurnBasedGameData/` 是只读数据，不复制、不修改、不作为子模块。`../docs/` 为同级项目文档，当前未受 Git 管理，克隆本仓库不会获得这些文档；不得擅自移动目录或初始化仓库。

偏好 Electron、Svelte 5、TypeScript，具体工具链需评审。目标 Windows/macOS，通过 GitHub Releases 分发，不是网页服务。

贡献前阅读 [AGENTS.md](AGENTS.md)。保留 [MIT 许可证](LICENSE)。

