# RefAtlas

面向开发者、逆向研究者和配置维护者的桌面原始配置与显式引用调查工作台。

**Phase 0、Phase 1、Phase 1A 均已关闭；Phase 2A investigation：CLOSED / REVIEWED；Phase 2 production implementation：STARTED；Raw Access Foundation：COMPLETE / AWAITING REVIEW。** Phase 2A 已确认原则写入 ADR-0007–0010，见 [评审收尾报告](docs/investigations/phase-2a-review-closeout.md)；[原调查](docs/investigations/phase-2a-data-access-architecture.md) 保留历史候选与实测。Windows x64 与 macOS arm64 的 native/package gate 均已通过，electron-vite + electron-builder 长期路线已接受，当前版本不永久冻结；macOS x64 不属于支持范围。见 [Phase 1A 收尾](docs/investigations/phase-1a-closeout.md) 与 [macOS 原生验证](docs/investigations/phase-1a-macos-arm64-validation.md)。本轮已实现只读 raw Data Service、revision、统一 parser 和有界 query primitives，见 [实现与验收报告](docs/investigations/phase-2-raw-access-foundation.md)。`tools/investigation/` 保持独立非生产；Source Browser Slice E 已独立授权实现 change/reload/location recovery；当前验收和跨平台范围见 [Slice E 报告](docs/investigations/phase-2-source-browser-slice-e-change-reload-integration.md)。

## 开始阅读

Source Browser Slice A 已评审，可继续开发；其新实现 macOS arm64 已由本轮累计 Source Browser gate 验证。Slice B 已实现 Renderer-only localization foundation，Windows 完整验收结果见 [Slice B 报告](docs/investigations/phase-2-source-browser-slice-b-localization-foundation.md) 和 [STATUS](docs/STATUS.md)。Slice C 已实现正式 Source Explorer shell，Windows 11 阶段单次完整验收 exit 0，见 [Slice C 报告](docs/investigations/phase-2-source-browser-slice-c-source-explorer.md)。

- [文档入口](docs/README.md)：职责与阅读顺序。
- [产品定义](docs/PROJECT.md)、[当前状态](docs/STATUS.md)、[已接受架构](docs/ARCHITECTURE.md)、[ADR](docs/decisions/README.md)。
- [调查工具](tools/investigation/README.md)：实验复现。

`../TurnBasedGameData/` 是只读外部数据，不复制、不修改、不作为子模块。权威项目文档位于本仓库 `docs/`，与应用代码使用同一 Git 仓库；工作区外层只是本地容器。

已接受 Electron、Svelte 5、TypeScript，以及 Utility Process 数据服务、Phase 1 首选 better-sqlite3 和 [electron-vite + electron-builder 工具链](docs/decisions/ADR-0006-electron-build-and-packaging-toolchain.md)。路线已在 Windows x64 与 macOS arm64 验证，具体版本由 package/lockfile 管理；通过 GitHub Releases 分发，不是网页服务。正式发布工作流、签名与公证不属于本次接受范围。

## 开发与验证

在本仓库根目录使用 Node 24.x。Windows 验证使用 Node 24.21.0 / npm 11.16.0，macOS arm64 使用 Node 24.19.0 / npm 11.17.0；Electron 内部 Node 均为 24.21.0，与 shell Node 独立。当前验证组合精确锁定于根级 package 与 lockfile，不是永久架构要求。

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

该命令按当前 OS/Node 架构顺序执行 i18n offline compile → format:check → typecheck → test → docs:check → smoke:dev → 一次生产 build → smoke:built → builder → smoke:packaged，任何失败都停止。开发态构建不能复用为生产产物，因此仍保留。运行期间不要修改源码，也不要并行运行会覆盖 `out/` 或 `dist/` 的命令。

独立使用 `npm.cmd run package:win:x64` 仍会先重新 build，再打包，不信任已有产物；`smoke:built` 和 `smoke:packaged` 单独执行时要求已有对应最新产物。日常按变更选择最小验证层级，不为每次局部修改运行完整链路，详见 [开发流程](docs/DEVELOPMENT-PROCESS.md)。

目录包位于 `dist/win-unpacked/RefAtlas.exe`；`--dir` 保留 ASAR，不生成安装器、不发布、不签名。正式启动显示 Source Explorer；Foundation 诊断保留在受保护 harness。smoke 通过应用自己的临时 fixture 验证 raw 与 UI，常规 smoke 使用与产品一致的初始可见窗口，键盘阶段聚焦，保持 120 秒总超时、明确退出码和自动清理；可重复报告保存于被忽略的 `artifacts/`。

macOS arm64 在对应原生 Apple Silicon 机器使用相同安装步骤（确认当地系统 7890 代理后设置当前 shell 的 HTTP_PROXY、HTTPS_PROXY、NO_PROXY），执行 `npm run package:mac:arm64`，再执行 `npm run smoke:packaged`。脚本要求 OS 和 Node 架构与目标一致；macOS x64 不提供正式打包入口，不新增远程 workflow。

Phase 1A Mac 验收时确认的代理为 `http://127.0.0.1:7890`，不能假定其他机器也相同。以下只修改当前 shell；如使用 nvm，可先切换已有的 Node 24，不需要修改全局默认版本：

```sh
nvm use 24.19.0
export HTTP_PROXY='http://127.0.0.1:7890'
export HTTPS_PROXY="$HTTP_PROXY"
export NO_PROXY='localhost,127.0.0.1'
export NODE_USE_ENV_PROXY=1
npm ci --proxy="$HTTP_PROXY" --https-proxy="$HTTPS_PROXY" --cache .cache/npm --no-audit --no-fund
npm run install:electron
npm run validate:foundation
```

Mac 目录包位于 `dist/mac-arm64/RefAtlas.app`，本轮不签名、不公证、不生成 DMG。受限沙箱可能禁止 localhost 监听或 Electron 启动，需要获准的本地执行环境；这不要求关闭应用的 Preload sandbox。

[Phase 1A 交付与局限](docs/investigations/phase-1a-foundation.md)、[性能口径](docs/PERFORMANCE.md)。

[工程规范与工具链清理](docs/investigations/phase-1a-development-policy-cleanup.md)记录 formatter、测试审阅和验证编排，不改变平台 gate 或已接受架构。

贡献前阅读 [AGENTS.md](AGENTS.md)。保留 [MIT 许可证](LICENSE)。

## Raw Access Foundation 验证

`window.raw` 是正式窄桥，提供 workspace open/close + displayName、单目录 listDirectory、source info/reload/release、Node read、children page、scalar segment 和取消。workspace root 由 Main 原生对话框选择；客户端不得提交绝对路径。info/reload 显式 acquire，Node 请求带 expectedRevision，release 后不隐式重新注册；source 变化后先 stale，再显式 reload。Raw Access 不提供文件编辑。正式 Explorer 由 Renderer Controller 接入。

普通 `npm test` 验证临时 fixture，并跳过外部来源 gate。明确验证六个真实只读样本时执行：

```powershell
npm.cmd run test:raw-data
```

该命令按固定六样本及 root、ExcelOutput、Config/Level/Mission 目录运行 production service，验证分页/排序/response bounds、零自动注册、取消与 release/reacquire。前后 streaming hash/size/mtime 与外部 HEAD/status 必须一致，报告写入被忽略的 `artifacts/raw-real-data.json`。没有全工作区扫描；需要本机同级 TurnBasedGameData。需要将此 gate 纳入完整原生平台验收时执行 `npm run validate:foundation -- --real-data`，保持单次 production build，真实 gate 失败阻止 smoke/打包。

Source Browser Slice A 的实现与平台状态见 [报告](docs/investigations/phase-2-source-browser-slice-a-directory-lifecycle.md)。macOS arm64 新目录/lifecycle/localization/Explorer gate 已累计 PASS WITH FIXES，不使用既有 Raw Foundation gate 冒充通过；Slice C 已接入正式 UI，Slice D 已接入当前 revision 的 Node Browser 与 Inspector；累计证据见 [Mac 报告](docs/investigations/phase-2-source-browser-macos-arm64-validation.md)，共享 watcher Windows native 补验已在 Slice E preflight 完成；Slice E 新 diff 已由 [Mac 定向报告](docs/investigations/phase-2-source-browser-slice-e-macos-arm64-validation.md) 验证，minimize 通过范围为台前调度关闭，开启组合保留限制。

现有 dev/built/packaged smoke 和 `validate:foundation` 已包含 raw 进程链路验收；fixture 由 Main/runner 在自身临时目录管理。Raw Access Foundation 已在 Windows x64 与 macOS arm64 验证，Mac 的 filesystem/watcher/stat 回退、真实数据与 ASAR runtime 证据见 [原生验证报告](docs/investigations/phase-2-raw-access-macos-arm64-validation.md)。接口、资源上限和边界见 [实现报告](docs/investigations/phase-2-raw-access-foundation.md)；首片仍待 review，整个 Phase 2 未完成。

## Localization Foundation

支持 `en` / `zh-CN`，英文为 base/fallback。Main `app.getSystemLocale()` 将 `zh*` 归为中文，其余为英文，仅经 readonly `window.appPresentationConfig.initialLocale` bootstrap 传递；Renderer 挂载前选择有效 `refatlas.locale` 存储值 → bootstrap → 英文。切换无 reload，以 Svelte locale store 驱动 messages、ARIA/title 和 html lang/dir；存储不可用不阻断启动。

`project.inlang/settings.json` 与 `messages/*.json` 为 tracked source of truth。Paraglide compiler 2.25.4 是 devDependency，仅 Renderer 构建使用。message-format 4.4.0 插件按固定 URL/哈希准备到 `.cache/i18n`，之后编译读本地文件，不使用 SDK 的 network-first URL cache。准备时需要已核实的 7890 HTTP(S) 代理；未准备且代理不可用会失败，不直连。

```powershell
npm.cmd run i18n:prepare
npm.cmd run i18n:compile
npm.cmd run i18n:compile -- --offline
```

dev/typecheck/test/build 和 dev smoke 有自动生成前置步骤；独立 package 与完整 validation 自动准备插件。新 checkout 安装依赖后可直接运行，不需要记住手工生成步骤。generated modules/declarations 与 SDK project metadata ignored，不手改、不格式化。`--offline` 禁止 fetch，并确认零可解析网络地址请求；SDK 对相对模块路径的无效 fetch 探测不会发出 HTTP 请求。

组件只消费统一 `src/renderer/src/i18n` 入口及 reactive locale。`formatUiCount` / `formatByteSize` 仅用于应用 metadata，`formatRawError` 将稳定 code 映射成 presentation，不翻译或重写 raw field/string/lexeme/path/Pointer/revision。Foundation 中文诊断页保持历史范围并隔离；Slice C 工具栏提供正式语言 selector，无 settings 系统。macOS arm64 已累计 PASS WITH FIXES，证据见 [Mac 报告](docs/investigations/phase-2-source-browser-macos-arm64-validation.md)。

## Source Explorer

打开工作区后仅显示普通目录和精确 `.json` 来源；不特别隐藏 `.git`，不跟随链接。单击 JSON 选择，双击或 Enter 激活；方向键、Home/End 和 Space 可浏览和选择。目录按需分页，尾部自动加载，也可显式加载更多；失败可重试，过期 cursor 必须刷新。刷新 Explorer 保留 active source。

Zag 管理交互/ARIA，ExplorerController 管理异步/缓存，TanStack Virtual 管理固定 24px 行和 overscan 5；缓存起点 10,000 entries / 8 MiB metadata。中央现由 Slice D Source Header、Breadcrumb、direct children 表格和 scalar Value View 组成，右侧 Inspector 默认展开 280px、折叠 32px。NodeBrowserController 复用 RawBridge/SourceSession，不新增生产 IPC、依赖或 Data Service API；只保留一页 children 或一段 scalar、最多 128 项 cursor metadata。`--real-data` 完整验收同时覆盖真实 Electron Explorer/controller/virtualization，前后核对外部仓库与样本指纹。Slice A/B/C/D macOS arm64 已累计 PASS WITH FIXES；A/B/C/D/E generic browsing foundation 已在两个支持平台验证（Mac minimize 限台前调度关闭）；下一节点为 Slice E Mac 报告 review。Slice D 结果见 [报告](docs/investigations/phase-2-source-browser-slice-d-node-browser-inspector.md)；stale 保留旧内容并禁用结构读取；Slice E 提供显式 Reload、同 Pointer 恢复、LOCATION_MISSING 和 Return to Root，只有 current Pointer 跨 revision 恢复；没有 History。Copy Pointer 可选按钮因现有权限策略实测拒绝而延期。
