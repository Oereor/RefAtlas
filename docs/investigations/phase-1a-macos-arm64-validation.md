# Phase 1A：macOS arm64 原生验证报告

日期：2026-10-02（UTC+8）。应用基线为 main `694a506`；本任务修改未提交。正式平台范围已收敛为 Windows x64 与 macOS arm64，当前 Apple Silicon Mac 的开发态、构建态、ASAR 打包态及九阶段完整验收均已通过。此前代理不可用导致的阻断保留在失败记录中，不再是当前 gate 阻碍。

## 1. Mac 环境

| 项目 | 结果 |
| --- | --- |
| Mac | MacBook Air，型号 Mac14,2 |
| 芯片与内存 | Apple M2，8 核（4 性能 + 4 能效），16 GiB |
| macOS | 27.0.1，Build 26A434 |
| 架构 | `uname -m`: `arm64`；Node: `darwin/arm64` |
| Node | `v24.19.0`，符合 `>=24 <25` |
| npm | `11.17.0` |
| Electron / Chromium | `44.5.1` / `152.0.7977.130` |
| Electron 内 Node | `24.21.0`，Main 与 Utility ready handshake 结果一致 |
| N-API | shell Node 与 Electron runtime 均为 `10` |
| Node ABI | shell Node ABI `137`；Electron runtime ABI `149` |
| better-sqlite3 / SQLite | `13.0.3` / `3.53.4` |
| Xcode 工具 | `/Library/Developer/CommandLineTools` 可用 |

当前 shell 已通过现有 `nvm` 切换到 `v24.19.0`；没有安装新版本，也没有修改全局 shell、npm 或 git 配置。

smoke 的 `environment.os` 来自 Node `os.release()`，记录为 `27.0.0`；它与 `sw_vers` 的产品版本字段不是同一口径。本报告 macOS 产品版本以 `sw_vers` 为准。`file` 检查确认 Electron 可执行文件、打包后的 RefAtlas 可执行文件与实际 native addon 都为 Mach-O arm64，没有使用 Rosetta 或交叉打包。

## 2. 环境准备

初始工作区使用 Node `v26.5.0`，不符合项目引擎范围；机器已有 `nvm` 和 `v24.19.0`，因此仅切换版本。`node_modules` 初始不存在。

仓库要求所有公网访问经本机 7890 HTTP(S) 代理。最初 shell、npm 与 `scutil --proxy` 均没有可确认的设置，因此停止联网。用户接通 7890 后，确认本机进程监听 `127.0.0.1:7890`；获准的代理探测收到 HTTP CONNECT 成功和 npm registry HTTP 200，确认其支持 HTTP 代理。系统代理查询仍为空，不能依赖自动继承，故仅给当前命令显式配置 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 为 `http://127.0.0.1:7890`，并设置 `NO_PROXY=localhost,127.0.0.1` 和 `NODE_USE_ENV_PROXY=1`。项目脚本继续使用已有 fail-closed 检查，没有直连回退或修改全局 npm/git/网络配置。

按当前 lockfile 执行 `npm ci --cache .cache/npm --no-audit --no-fund`，通过显式代理安装 381 个包；随后执行 `npm run install:electron` 下载 Electron 44.5.1 arm64 二进制。`npm ls --depth=0 --offline` 通过，无 peer/engine 错误，版本均与锁文件一致。

npm 11.17.0 提示五个包的 install scripts 尚未批准，另有传递依赖弃用提示。没有执行 `npm approve-scripts`、native rebuild、`npm update`、`npm audit fix`、`--force` 或 `--legacy-peer-deps`；better-sqlite3 包内已有 `prebuilds/darwin-arm64.node`，Electron 使用仓库显式下载器。后续类型检查、真实 SQLite smoke 和打包证明当前预构建路径可用，不用警告作为擅自升级依赖的理由。package 与 lockfile 的依赖版本未变化，未安装完整 Xcode。

外部 `TurnBasedGameData` 仅核对 Git 状态与 HEAD，没有扫描数据；起止 HEAD 均为 `724b139d8c9c32d12552eb95745a4fee72bfe48b`，工作树均干净。没有写入、索引、格式化或复制数据。

## 3. 平台支持范围变更

正式支持目标：

- Windows x64
- macOS arm64

不支持目标：

- macOS x64

新增并接受 [ADR-0005](../decisions/ADR-0005-macos-platform-scope.md)。ADR-0003 的 SQLite 驱动方向仍有效，但其历史 Windows x64、macOS x64、macOS arm64 三目标 gate 已由 ADR-0005 部分替代为 Windows x64 与 macOS arm64；ADR-0003 原文未被重写。

移除 `package:mac:x64`；打包与 smoke allowlist 仅保留 `win32-x64`、`darwin-arm64`。完整 runner 复用打包 allowlist，无需增加另一套平台配置。管线测试移除 Intel Mac 参数化目标，当前 6 文件 / 42 项测试；不是为 coverage 调整测试数量。

## 4. 开发态结果

| 检查 | 结果 |
| --- | --- |
| Node/OS/架构检查 | 通过，`darwin/arm64` |
| 本地 allowlist 检查 | 通过，Windows x64 与 macOS arm64 可构造；macOS x64 被拒绝 |
| 脚本语法检查 | 通过，`package.mjs`、`smoke-worker.mjs`、`validate.mjs`、`smoke.mjs` |
| `npm ls --depth=0 --offline` | 通过，锁定依赖树完整 |
| `npm run docs:check` | 通过，20 份 Markdown 链接/锚点 |
| `npm run format:check` | 通过，受管文件符合仓库 Prettier 样式 |
| `npm run typecheck` | 通过，Svelte 0 errors / 0 warnings |
| `npm test` | 通过，6 文件 / 42 项；含本地 SQLite 与子进程检查 |
| `npm run smoke:dev` | 通过，真实 `darwin/arm64`，packaged=false |

dev smoke 通过隐藏窗口的 Renderer → sandbox Preload → Main → Utility Process → MessagePort 链路。检查包括 renderer-no-node、窄 bridge、输入边界、ready handshake、请求匹配/重复 ID、SQLite、取消、带 pending 请求的崩溃、显式重启和模拟任务响应性。真实安全配置为 `contextIsolation=true`、`nodeIntegration=false`、`sandbox=true`。

## 5. Build 结果

`npm run build` 通过：Main CJS、Preload 自包含 CJS、Renderer 与 Utility bundle 正常生成。`npm run smoke:built` 通过；生产产物中的进程链路、native load、SQLite 与上述基础生命周期检查均成功。

dev 与 built 均不在 ASAR 中运行，因此其 SQLite 结果 `nativeUnpacked=false` 正常，不应误判为打包失败；两种模式各三次 SQLite 均 `cleaned=true`。

## 6. Packaged result

`npm run package:mac:arm64` 成功，独立命令先执行 production build 再执行 builder。产物为：

```text
/Users/wh3atl3y/RefAtlas-Project/RefAtlas/dist/mac-arm64/RefAtlas.app
```

electron-builder 26.15.3 使用本地 Electron 44.5.1 arm64 distribution，`npmRebuild=false`，`--dir`、`--publish never`、`mac.identity=null`。日志确认跳过 macOS code signing；不公证、不发布、不生成 DMG，没有改变正式签名配置。

`npm run smoke:packaged` 实际启动 `.app/Contents/MacOS/RefAtlas`，结果 `ok=true`、`packaged=true`、`platform=darwin`、`arch=arm64`：

- Utility ready handshake 报告 Electron/Node/N-API/ABI，与 Main runtime 一致；MessagePort、窄 IPC 和 Preload 安全边界通过。
- better-sqlite3 实际创建临时数据库、建表、写入两行、SELECT 读回、close 并删除临时目录，不以文件存在代替 native load。
- 三次 SQLite 返回 `rows=2`、SQLite `3.53.4`，Unicode `基础设施🙂` 与大整数文本 `16752756560315677817` 完整往返，`cleaned=true`、`nativeUnpacked=true`。
- `app.asar` 的 header 标记 native 文件为 unpacked，实际物理文件为 `Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/prebuilds/darwin-arm64.node`，`file` 确认其为 arm64 bundle。
- `packageContents` 报告 `runtimeOnly=true`、`externalDataExcluded=true`、`nativeUnpacked=true`；ASAR 包含生产入口与运行依赖，没有调查工具或外部数据。
- smoke 模式通过取消、崩溃/显式重启；另一次普通 packaged 启动通过 `normal-packaged-diagnostics-denied` 与 `normal-packaged-probe`，`diagnostics=false`，未开放 test-only fault injection。
- 结束后获准的只读进程检查没有匹配本项目 Electron distribution、RefAtlas.app 或 RefAtlas Helper 的残留进程；SQLite 临时目录清理由实际 smoke 结果证明。

### 完整验收与证据

针对性检查成功后执行一次 `npm run validate:foundation`，九阶段全部通过：format:check → typecheck → test → docs:check → smoke:dev → production build → smoke:built → builder → smoke:packaged。完整 runner 的生产构建只执行一次，任何失败仍会阻止后续步骤；没有添加重试或 skip-build 入口。

最终成功报告来自该轮完整验收，保存于被忽略的本地目录：

| 模式 | 报告 | 生成时间（UTC+8） |
| --- | --- | --- |
| Dev | `artifacts/foundation-dev-darwin-arm64.json` | 2026-10-02 21:32:28 |
| Built | `artifacts/foundation-built-darwin-arm64.json` | 2026-10-02 21:32:31 |
| Packaged | `artifacts/foundation-packaged-darwin-arm64.json` | 2026-10-02 21:32:38 |

只根据本次命令成功退出与新报告判定通过，未使用旧报告冒充成功。报告原始 UTC 时间分别为 `2026-10-02T13:32:28.302Z`、`13:32:31.648Z`、`13:32:38.309Z`。依赖、cache、数据库、out/dist、artifacts 不纳入提交。

## 7. Platform Matrix

| Target | Dev | Package | Utility | better-sqlite3 | SQLite smoke |
| --- | --- | --- | --- | --- | --- |
| Windows x64 | 已有通过证据 | 已有 ASAR 目录包通过证据 | 已有通过证据 | 已有通过证据 | 已有开发/构建/打包态通过证据 |
| macOS arm64 | 通过 | ASAR .app 目录包通过 | 通过 | native 实际加载通过 | 开发/构建/打包态通过 |

Windows 结果沿用 [历史报告](phase-1a-foundation.md) 与 [工程清理验收](phase-1a-development-policy-cleanup.md)，本轮未重跑 Windows。macOS x64 已由平台范围 ADR 移出支持矩阵，不再列为 gate。

## 8. 失败、调查与处理

| 阶段 | 症状 | 根因 | 修复/处理 | 验证 |
| --- | --- | --- | --- | --- |
| 环境版本 | 当前 Node 为 `26.5.0` | 超出项目 `>=24 <25` | 切换到已有 `nvm` Node `24.19.0` | `node --version` 与 `process.arch` 通过 |
| 初始代理 | `npm ci` 未启动 | shell/npm/system proxy 均为空 | 按 fail-closed 停止；用户接通后确认监听与 HTTP CONNECT，只注入当前命令 | 代理恢复后安装与全部 gate 通过 |
| 代理探测 | nc `Operation not permitted`，curl 无法连接 localhost | 沙箱限制，端口实际已监听 | 获准执行探测，无直连 | 经 7890 返回 registry HTTP 200 |
| 初始 cheap tier | prettier/tsc/vitest/electron-vite `command not found` | 当时未安装项目依赖 | 代理恢复后按 lockfile 安装 | 各检查及 build 均通过 |
| dev smoke | Vite `listen EPERM 127.0.0.1:5173` | 沙箱禁止本地监听，development build 已成功 | 改为获准的本地执行，不降低应用 sandbox | 同命令及完整 runner 通过 |
| built smoke | Electron 退出码 null，无成功报告 | 在受限沙箱启动异常，未证实应用层错误 | 相同产物改为获准执行，未改代码或 timeout | built smoke 与完整 runner 通过 |
| npm 安装提示 | pending install scripts 与传递依赖弃用警告 | 当前 npm 策略及锁定依赖提示，非 native/package 失败 | 不批准额外脚本、不升级依赖 | 包内预构建、显式 Electron 下载与真实 SQLite/package 成功 |

没有无新信息机械重跑、无限重试或持续延长超时。没有出现需修改生产源码、ASAR 配置或 SQLite 驱动的 macOS 适配问题；重新执行只因代理接通或执行权限改变。

## 9. 性能

本轮不新增性能基线。沿用 smoke 时序采集，仅作为本地可重复的功能证据：每模式 Probe 预热 5 次后采集 100 次，另有初始 ready 与三次恢复/取消/SQLite。后台负载、OS 缓存、磁盘和热状态未控制，不推导跨机器优劣。

dev/built/packaged 模拟任务时 50 ms 心跳各前进 27 次，合成点击各 13 次，证明有界任务期间 renderer 仍能更新与交互；隐藏窗口 rAF 不证明人工可见窗口帧率。没有读取真实数据、建立索引、测量内存高水位、正式分发/Gatekeeper 体验或签名/公证。

## 10. 文档更新

- 新增 `ADR-0005-macos-platform-scope.md`，记录正式支持范围。
- 更新 `README.md`、`PROJECT.md`、`ARCHITECTURE.md`、`STATUS.md`、`ROADMAP.md`、`DEVELOPMENT-PROCESS.md` 与 `PERFORMANCE.md` 的当前平台范围。
- 更新 `ADR-0003` 和决策索引，保留其历史决定并链接 ADR-0005。
- 更新调查入口，并在历史 Phase 1A 报告增加范围补记。
- README 补充 Mac 当前 shell 的 Node/代理/安装/验收命令与 `.app` 路径；STATUS、ROADMAP 与 ARCHITECTURE 同步两个 gate 已通过、技术验证完成及工具链待评审边界。
- DEVELOPMENT-PROCESS 补充原生验收与沙箱权限处理；PERFORMANCE 只同步验收状态与口径，不追加基准数字。
- 本报告替换初始阻断结论，保留原因和后续验证。没有 commit、push、新分支、远程 PR/issue/workflow、release、正式签名或公证。

## 11. Phase 1A 状态

Windows x64 与 macOS arm64 两个正式支持目标的 Phase 1A native/package gate 均已通过，Phase 1A 技术验证完成。macOS x64 已不属于正式支持范围，因此不构成未完成 gate。

electron-vite + electron-builder 是否正式接受为长期工具链，仍待用户评审。本轮没有新增工具链已接受 ADR，不自动关闭整个 Phase 1，也不进入 Phase 2 产品功能开发。
