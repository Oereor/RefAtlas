# Phase 1A：桌面基础交付与验证报告

日期：2026-10-02（UTC+8）。基线：应用 main `809a4a5 Closeout Phase 0`；外部数据 HEAD `724b139d8c9c32d12552eb95745a4fee72bfe48b`。本报告是实现/验证证据，不自行接受新架构决定；当前状态见 [STATUS](../STATUS.md)。

## 1. 实施摘要

已建立独立的根级 production package/lockfile 和 Electron + Svelte 5 + TypeScript 骨架，实际进程链路为 Renderer → Preload → Main → Utility Process → minimal Data Service。

新增最小验证 UI、窄 typed bridge、有界输入/响应、MessagePort handshake、请求匹配、取消、超时、退出/重启、临时 SQLite smoke、三目标本地打包入口及隐藏窗口 smoke runner。没有读取/扫描/索引 TurnBasedGameData，没有创建 Dataset Contract、RawRecord、Query API、正式索引/搜索、编辑器或产品导航。

本轮 Windows gate 通过，macOS gate 未验证。没有 commit、push、创建分支、PR/issue、触发 workflow、签名、公证或发布；保持原 main 分支。

范围补记（2026-10-02，UTC+8）：后续平台决策见 [ADR-0005](../decisions/ADR-0005-macos-platform-scope.md)。macOS x64 已移出正式支持矩阵；macOS arm64 已通过原生 gate，见 [验证报告](phase-1a-macos-arm64-validation.md)。本报告中的三目标矩阵与命令保留为当时的历史证据，不代表当前仍需维护 Intel macOS gate。

## 2. 工具链与兼容性

安装后 `npm ls --depth=0 --offline` 无 peer/engine 错误。正式锁文件与调查 package 完全独立。官方包元数据通过系统代理重新查询，见 [来源快照](evidence/phase-1a-sources.json)。

| 包／运行时 | 当前实际验证版本 |
| --- | --- |
| Node / npm | 24.21.0 / 11.16.0 |
| Electron / electron-vite | 44.5.1 / 5.0.0 |
| Vite / @sveltejs/vite-plugin-svelte | 7.3.6 / 6.2.4 |
| Svelte / TypeScript | 5.57.1 / 6.0.3 |
| electron-builder / better-sqlite3 | 26.15.3 / 13.0.3 |
| Vitest / svelte-check | 5.0.3 / 4.7.6 |
| @types/node / @types/better-sqlite3 | 24.19.1 / 9.6.0 |

2026-10-02 查询的 Vite latest 为 8.3.2，Svelte 插件 latest 为 7.3.1，但 electron-vite 5 的 peer 只覆盖 Vite 5/6/7；插件 6.2.4 支持 Vite 7 和 Svelte 5，因此使用稳定兼容组合而非全部 latest。TypeScript latest 为 7.0.2，但 svelte-check 4.7.6 的 peer 为 TypeScript 5/6，因此选择 6.0.3。Vitest 5 支持 Vite 7/Node 24。没有 `--force` 或 `--legacy-peer-deps`。

Electron 44 npm 包没有自动安装二进制的 lifecycle hook，通过官方 `install.js` 显式下载；可重复命令为 `npm run install:electron`。Windows esbuild/Vite 在受限沙箱读取上层目录时被拒绝，实际构建/测试在获准的沙箱外完成；没有降低 Electron sandbox。

**当前验证版本不等于永久架构要求。** Electron/Svelte/TypeScript/Utility Process/better-sqlite3 方向来自既有 ADR；electron-vite + electron-builder 的长期接受仍待用户评审，不新增“已接受”ADR。

## 3. 进程职责

| 进程／边界 | 本轮实际职责 |
| --- | --- |
| Renderer | Svelte 状态/结果展示、50 ms 心跳、交互计数；只能调用窄 bridge |
| Preload | 自包含 CJS，运行时检查 sandbox/context isolation，预校验固定 Probe/ID，暴露六个固定方法 |
| Main | 窗口/来源校验、输入数量/大小/类型校验、服务生命周期、请求编排与小型 smoke 报告；不运行 SQLite 或批次计算 |
| Utility Process | 独立运行时与 MessagePort，处理请求、取消及主动故障注入 |
| Data Service | 有限 asynchronous Probe，以及专用临时 SQLite 模块；不是正式数据索引服务 |

BrowserWindow 始终 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；限制导航、新窗口和权限。Preload 关闭依赖 externalization，只将 Electron 保留为 runtime 引用；没有任意 channel API、ipcRenderer、Node/fs 或数据库暴露给 renderer。

## 4. IPC 与生命周期验证

六个方法为 `getServiceStatus`、`runCancelableProbe`、`cancelProbe`、`runSqliteSmoke`、`crashDataServiceForTest`、`restartDataServiceForTest`，都是基础设施接口，不是未来 Query API。

- Probe 只接受固定 UUID、整数步数与延迟，拒绝未知字段；上限 1,000 步与计划总时长 10 秒。Preload、Main 和 Utility 均有边界校验。
- 消息 16 KiB，最多 32 个未完成请求，其中一个槽保留给取消；普通任务最多 31。启动 10 秒、请求 20 秒超时。这些限制不是产品预算。
- Main/Utility 使用真实 MessageChannelMain/MessagePort，先握手再请求；每次发送独立 wire UUID，响应按 ID 和 operation 校验。复用调用方 ID 或重启时，旧响应不会完成新请求。
- Utility Probe 在批次间让出 event loop，不使用 busy loop。取消被接受后原请求返回 CANCELLED；完成后的重复取消返回 accepted=false。
- 主动异常退出后 Main 将 pending 请求返回 SERVICE_EXIT；退出期间新请求返回 SERVICE_UNAVAILABLE；显式重启产生新代次并恢复请求。不自动重放，不引入复杂 supervisor。
- 超时、窗口销毁和应用退出清理 pending/任务。runner 的 120 秒总超时在 Windows 清理自身进程树，在 POSIX 清理自身进程组，并核实临时目录边界后移除。
- 普通 packaged 模式另行自动验证 crash/restart 返回 TEST_ONLY，正常 Probe 仍可用。只有开发或显式诊断/smoke 才能故障注入。

## 5. SQLite 与 native / ASAR

只在 Utility 内 import better-sqlite3。每次 smoke 创建自己的临时目录和二行测试表，验证 Unicode `基础设施🙂`、大整数文本 `16752756560315677817`，执行 create → insert → select → close → cleanup；不构建任何生产 schema。

13.0.3 使用 node-addon-api，binding.gyp 指定 NAPI_VERSION=10，包内含按平台/架构命名的预构建。实际 Electron Utility 的 Node 为 24.21.0、N-API 10、Node ABI 149；开发态、构建态及打包态 SQLite 均通过。

初次采用 electron-builder 默认 `npmRebuild: true` 时，@electron/rebuild 转入 node-gyp，因本机缺少 Visual Studio 而失败。没有安装编译工具或换回 node:sqlite；依据驱动自带 N-API 预构建，改用官方 `npmRebuild: false`。打包脚本检查驱动版本/目标 `.node` 存在，用官方 electronDist 复用已安装的 Electron 分发，不自定义复制 native 文件。

ASAR 保持启用，官方 `asarUnpack` 覆盖 `node_modules/better-sqlite3/prebuilds/*.node`。Electron require.cache 中的逻辑路径仍可含 app.asar，因此验证其实际 `app.asar.unpacked` 文件存在并结合真正 SQLite 读写，而不是仅用路径字符串猜测。Windows packaged smoke 的 nativeUnpacked 为 true。

该配置只针对已验证的锁定组合；升级驱动、N-API 或 Electron 后必须重新验证。存在预构建不证明 macOS 包已通过。

## 6. 平台矩阵与复现

| Target | Dev | Package | Utility | better-sqlite3 | SQLite smoke |
| --- | --- | --- | --- | --- | --- |
| Windows x64 | 通过（本地 Vite 服务器 smoke） | 通过（ASAR --dir） | 通过 | 通过 | Dev/Built/Packaged 均通过 |
| macOS x64 | 未验证 | 未验证 | 未验证 | 未验证 | 未验证 |
| macOS arm64 | 未验证 | 未验证 | 未验证 | 未验证 | 未验证 |

开发/安装命令见 [应用 README](../../README.md)。macOS 必须在对应原生机器/Node 架构执行相同类型检查、测试、dev/built smoke，再执行 `package:mac:x64` 或 `package:mac:arm64` 和 `smoke:packaged`。runner 直接调用 `.app/Contents/MacOS/RefAtlas`；不增加 workflow，不远程触发验证，不把脚本已提供写成平台已验证。

## 7. 性能与局限

详见 [PERFORMANCE](../PERFORMANCE.md) 与 [测量快照](evidence/phase-1a-measurements.json)。Windows packaged 初始 Utility ready 82.91 ms（n=1）；三次重建 ready 中位 65.39 ms；100 次 typed Probe 往返 p50/p95 为 6.80/15.70 ms；取消中位 0.70 ms；重启恢复中位 65.60 ms；SQLite smoke 三次中位 9.60 ms，首次含 native 加载为 125.60 ms。

没有清空 OS 缓存，不是冷启动分布；往返含一个计划 1 ms 定时步骤和 Windows 调度，不是纯 IPC；SQLite 含桥/临时文件生命周期，不是单 SQL。模拟工作时 packaged DOM 心跳前进 40 次、合成 DOM 点击 20 次，但隐藏窗口 rAF 约 1 Hz；不宣称真实数据负载响应、人工可见窗口帧率或产品预算。macOS、RSS/heap、纯 MessagePort 吞吐仍未测。

## 8. 文档更新

- AGENTS：加入所有公网操作经系统 7890 代理、不可直连回退、当前 shell/单次配置、本地 IPC 例外的长期最高项目规则；用永久阶段授权原则替换 Phase 0 临时措辞。
- README、docs/README、STATUS：开发入口、Phase 0 已提交事实、本轮实际结果与剩余 gate；应用和文档都留在同一仓库。
- ARCHITECTURE、ROADMAP、PROJECT：区分既有已接受边界、本轮已验证能力、未来产品模型和待评审工具链。
- PERFORMANCE：加入真实口径和局限，保留 Phase 0 数字，不创建产品预算。
- DEVELOPMENT-PROCESS、decisions/investigations 入口：重复验证与文档维护规则、证据入口；仍只有四项已接受 ADR。
- Phase 0 历史调查正文未重写，只追加注明 2026-10-02/809a4a5 的后续补记，旧“尚未提交”作为时点事实保留。

## 9. 测试与实际执行

| 命令／检查 | 结果 |
| --- | --- |
| 官方 npm 元数据 curl 查询（--proxy 7890） | engine/peer/latest stable 复核成功，保存版本证据 |
| npm install（显式代理/独立缓存）与官方 electron/install.js | 安装成功；间接依赖弃用/脚本批准提示不作为测试通过依据 |
| npm ls --depth=0 --offline | 精确选定版本，依赖树有效 |
| npm run typecheck | TypeScript / Svelte：0 errors，0 warnings |
| npm test | 5 个文件，35 tests passed |
| npm run smoke:dev | 真实 renderer 窄桥、Vite 本地服务器、Utility/SQLite/取消/恢复通过 |
| npm run build | Main/Preload/Renderer/Utility 生产构建成功 |
| npm run smoke:built | 生产构建态端到端通过 |
| npm run package:win:x64 | 本地 Windows ASAR 目录包成功，不发布、不签名 |
| npm run smoke:packaged | native + SQLite + 生命周期通过；普通模式诊断保护通过 |
| npm run docs:check / git diff --check | 收尾检查本地链接/锚点与 whitespace |
| 外部仓库 HEAD/status 起止对比 | HEAD 未变，工作树干净；未写入数据文件 |

35 项测试覆盖边界/Unicode 字节限制、非法数值/字段、请求匹配、取消/重复 ID、满负载取消槽、超时/窗口销毁、异常退出/新 broker 恢复、旧响应隔离、SQLite cleanup、build/security config、代理缺失/错误端口的 fail-closed、非零退出与 runner 超时清理。没有大型 E2E 框架或大量 Electron 内部 mock。

实际失败与修复也保留：Windows 沙箱的 esbuild 目录权限问题通过获准的本地执行解决；默认 native rebuild 的 Visual Studio 缺失通过经验证的 N-API 预构建和官方配置解决；Windows `.js` CLI 入口显式交给 Node，避免文件关联。未以失败运行冒充成功。

## 10. 未解决问题

macOS x64/arm64 gate 未验证；可见 UI/HMR 的人工检查、真实重型数据响应性和正式性能预算仍待后续证据。Query API、原始数据模型/身份、Dataset Contract 和正式 schema 完全未设计/实现；签名、公证和发布不在本轮范围。没有发现必须降低已接受安全/进程边界的阻碍。

## 11. 用户决策事项

待评审是否正式接受 electron-vite + electron-builder 为长期工具链路线；本轮只证明当前 Windows 组合可工作。macOS 两架构应先取得原生 packaged smoke 证据再关闭 Phase 1A。无需在本轮替用户接受新的架构决定或自动进入下一阶段。
