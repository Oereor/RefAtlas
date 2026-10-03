# Phase 0 / Phase 2A 非生产调查工具

## Phase 2A 复现

在本目录执行 `npm run test:phase2a`、`npm run phase2a`；结构与实验串行隔离，复用既有 120 秒／1 GiB heap／2 GiB RSS／3 GiB 可用内存保护。输入固定为 Phase 0 的 15 个样本和源码中明确列出的 6 个结构补充，不是全库词法 census。`node phase-2a.mjs --experiments-only` 仅在已有成功结构产物时更新 search/access，仍复核所有源指纹。`--collections-only` 仅补测六个嵌套集合样本；完整运行已包括这些统计。

`phase-2a-helper.mjs` 是成熟 tokenizer 的结构／指标观察器；实验保留完整只读 raw Buffer，不能当生产 streaming 内存证据。TokenParser 用 `paths: []` 与 `keepStack: false`；parseNumber 返回 lexeme，BOM 显式恢复字节基准。测试聚焦精度、UTF-8 range、surrogate、分页／失效、坏 JSON 和 SQLite Exact。

可选 Electron 探针：使用本目录 `node_modules/electron/dist/electron.exe` 启动 `phase-2a-electron.cjs`，Windows 用 `Start-Process -WindowStyle Hidden`，Main↔Utility MessagePort 无窗口、30 秒内退出，成功结果为 `artifacts/phase-2a-electron.json`。它不测 renderer/Preload 或 packaged 链路；不得关闭 Electron sandbox 或修改 ACL 绕过受限执行问题。

`npm run export:phase2a` 要求成功的 phase-2a.json、Electron 结果与固定版 parser metadata，输出紧凑仓库证据。parser metadata 通过官方 registry 读取保存为 `artifacts/phase-2a-parser-metadata.json`；新增 @streamparser/json 0.0.26 仅用于实验偏移候选。所有公网下载／查询必须先确认系统 7890 协议与地址，并显式给当前命令配置代理，禁止直连 fallback 和永久全局配置；建议安装使用独立缓存、`--ignore-scripts --no-audit --no-fund`。

SQLite 实验 DB 在 finally 中 close/remove，日志、依赖、profile、raw artifacts 不提交。完整结果与方法见 [中文报告](../../docs/investigations/phase-2a-data-access-architecture.md)。

这里不是应用源码。没有正式 Electron 窗口、UI、schema、Dataset Contract 或发布流水线；实验表与合成边不能成为关系真相。

## 环境与复现

在本目录使用 Node 24.21.0、npm 11.16.0，当前 Windows x64 实测。依赖精确锁定在 package-lock.json；不要把实验依赖复制到未来生产 package.json。

```powershell
npm.cmd ci --cache .cache/npm
npm.cmd test
npm.cmd run scan
node references.mjs
npm.cmd run bench
node sources.mjs
npm.cmd run validate
```

源数据路径固定为工作区同级 `TurnBasedGameData/`，不从网络拉取或修改上游。scan 生成全工作树汇总、前 30 大文件及样本 SHA-256；bench 比较前后状态/指纹。所有输出写入被忽略的 artifacts，依赖缓存位于 .cache；网络命令需要相应权限。

validate 要求先有完整 scan、bench、sources、Electron 探针结果，且中文报告/证据已生成；不是首次安装后即独立可运行的命令。只重试来源失败项可执行 `node sources.mjs --retry-only`。

`node run.mjs --sqlite-only` 保留已有解析结果，仅重跑 SQLite，要求先运行完整基准。实验使用 TextMapCHS 原文前 50000 项，两驱动使用相同表、索引、PRAGMA 和查询次数，关系边是循环相邻记录的合成边。

## 可选 Electron 探针

Electron 包可能延迟下载二进制；在允许联网时执行 `node node_modules/electron/install.js`，将 `electron_config_cache` 设置为本目录 `.cache/electron`。下载仅用于隔离验证，不是生产脚手架。

无窗口探针 `electron-probe.cjs` 启动 utilityProcess，验证 node:sqlite、better-sqlite3、FTS5 与 BigInt。Windows 应使用 `Start-Process -WindowStyle Hidden -Wait` 启动 `node_modules/electron/dist/electron.exe`，传入探针绝对路径；保存输出在 artifacts。需桌面执行权限。探针成功不证明 macOS 或打包后的程序成功。

## 安全与测量口径

- 重型基准串行子进程，120 秒超时、1 GiB Node heap 限制、RSS 2 GiB 停止阈值，启动前至少 3 GiB 可用内存；RSS 外部采样并非硬实时限制。
- Windows 监督进程约 100 ms 采样 WorkingSet64；子进程也发送检查点。短实验可能结束于监督器启动前，内存优先参考 resourceUsage.maxRSS 与检查点，不混用单位。
- RSS 采样、系统报告高水位、heap 检查点分别记录。没有清空文件缓存，重复运行不是冷读；不把这些数据当产品预算。
- 流式吞吐基准是完整 token 遍历与顶层计数，不是完整原始记录物化或整库索引。packed string/number 仍聚合单个 scalar；巨大 scalar 或完整嵌套记录需要后续有界限制。
- collectRecords 的 numberAsString 仅保留数值词法，会让数值与原始字符串的 JS 表示相同，且不保留空白/字节出处；不能成为生产类型模型。不得自行写 tokenizer 来补充源偏移。
- 50k TextMap 是原文件顺序样本，非随机抽样。FTS unicode61 与子串搜索含义不同，中文漏匹配结果需要后续搜索策略评审。

## 验证与清理

测试覆盖计数、嵌套、精度、非法 JSON、长记录/背压、路径边界、超时与 RSS 保护。数据库正常运行后自动移除；被强制终止可能留下自身产物，应只在确认绝对路径位于本目录 artifacts 后用 PowerShell LiteralPath 清理。

文档保存紧凑证据；原始 artifacts 可复现但不提交。报告与当前状态见 [仓库内项目文档](../../docs/README.md)。Phase 0 已关闭，工具保留为非生产实验，不升级成应用模块。
