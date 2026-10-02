# RefAtlas

面向开发者、逆向研究者和配置维护者的桌面原始配置与显式引用调查工作台。

**Phase 0 已关闭／已接受；Phase 1A Windows x64 桌面基础已验证。** macOS x64／arm64 gate 仍未验证，不能视为整个 Phase 1A 完成。`tools/investigation/` 保持独立的非生产实验工具。

## 开始阅读

- [文档入口](docs/README.md)：职责与阅读顺序。
- [产品定义](docs/PROJECT.md)、[当前状态](docs/STATUS.md)、[已接受架构](docs/ARCHITECTURE.md)、[ADR](docs/decisions/README.md)。
- [调查工具](tools/investigation/README.md)：实验复现。

`../TurnBasedGameData/` 是只读外部数据，不复制、不修改、不作为子模块。权威项目文档位于本仓库 `docs/`，与应用代码使用同一 Git 仓库；工作区外层只是本地容器。

已接受 Electron、Svelte 5、TypeScript，以及 Utility Process 数据服务和 Phase 1 首选 better-sqlite3。当前构建/打包候选已在 Windows 验证，长期工具链决定仍待评审；目标 Windows/macOS，通过 GitHub Releases 分发，不是网页服务。

## 开发与验证

在本仓库根目录使用 Node 24.x（本轮 24.21.0）和 npm（本轮 11.16.0）。当前验证组合精确锁定于根级 package 与 lockfile，不是永久架构要求。

先依据当前系统设置确认代理协议和地址。本轮 Windows 系统代理为 `http://127.0.0.1:7890`；以下只修改当前 PowerShell 环境，不能在代理不可用时直连：

```powershell
$env:HTTP_PROXY='http://127.0.0.1:7890'
$env:HTTPS_PROXY=$env:HTTP_PROXY
$env:NO_PROXY='localhost,127.0.0.1'
$env:NODE_USE_ENV_PROXY='1'
npm.cmd ci --proxy=$env:HTTP_PROXY --https-proxy=$env:HTTPS_PROXY --cache .cache/npm --no-audit --no-fund
npm.cmd run install:electron
npm.cmd run dev
```

Electron 44 的 npm 包没有自动下载二进制的 install hook，必须显式执行官方下载器。不要复用调查工具的 node_modules。

```powershell
npm.cmd run format:check
npm.cmd run typecheck
npm.cmd test
npm.cmd run docs:check
```

生产源码、测试、scripts 和根级受管配置使用仓库 Prettier 配置；主动整理执行 `npm.cmd run format`，不会自动夹进 build。Markdown、lockfile、历史调查、实验工具、证据和 generated artifacts 不参与格式化，不使用全目录 `prettier .`。

需要完整原生平台验收时执行：

```powershell
npm.cmd run validate:foundation
```

该命令按当前 OS/Node 架构顺序执行 format:check → typecheck → test → docs:check → smoke:dev → 一次生产 build → smoke:built → builder → smoke:packaged，任何失败都停止。开发态构建不能复用为生产产物，因此仍保留。运行期间不要修改源码，也不要并行运行会覆盖 `out/` 或 `dist/` 的命令。

独立使用 `npm.cmd run package:win:x64` 仍会先重新 build，再打包，不信任已有产物；`smoke:built` 和 `smoke:packaged` 单独执行时要求已有对应最新产物。日常按变更选择最小验证层级，不为每次局部修改运行完整链路，详见 [开发流程](docs/DEVELOPMENT-PROCESS.md)。

目录包位于 `dist/win-unpacked/RefAtlas.exe`；`--dir` 保留 ASAR，不生成安装器、不发布、不签名。开发／诊断页面只验证基础设施，不读取数据集。smoke 使用隐藏窗口、120 秒总超时、明确退出码和自动清理；可重复报告保存于被忽略的 `artifacts/`。

macOS 在对应原生 x64／arm64 机器使用相同安装步骤（确认当地系统 7890 代理后设置当前 shell 的 HTTP_PROXY、HTTPS_PROXY、NO_PROXY），分别执行 `npm run package:mac:x64` 或 `npm run package:mac:arm64`，再执行 `npm run smoke:packaged`。脚本要求 OS 和 Node 架构与目标一致；本轮未在 macOS 执行，不新增远程 workflow。

[Phase 1A 交付与局限](docs/investigations/phase-1a-foundation.md)、[性能口径](docs/PERFORMANCE.md)。

[工程规范与工具链清理](docs/investigations/phase-1a-development-policy-cleanup.md)记录 formatter、测试审阅和验证编排，不改变平台 gate 或已接受架构。

贡献前阅读 [AGENTS.md](AGENTS.md)。保留 [MIT 许可证](LICENSE)。

