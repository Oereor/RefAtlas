# Phase 0 非生产调查工具

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

文档保存紧凑证据；原始 artifacts 可复现但不提交。报告与当前状态见 [项目文档](../../../docs/README.md)。
