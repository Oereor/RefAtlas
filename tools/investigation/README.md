# Phase 0 / Phase 2A / Phase 2 Search 非生产调查工具

## Phase 2 Search 全库调查

这是独立 investigation，不提供正式 Search API/IPC/UI。只读同级 TurnBasedGameData；全部 DB、truth、fixtures、日志与 Electron profile 写入被忽略的 `artifacts/search/`。不要在来源目录创建缓存或复制全量数据。本轮工具复用已安装的独立依赖，生产 package/lockfile 不变。

从空的自有产物目录复现，重型阶段必须串行；全库运行需要数十 GiB 空间及较长时间，不借用 Phase 2A 的采样数字：

```powershell
node search-build.mjs baseline
node search-edges.mjs
node --max-old-space-size=1024 search-build.mjs build
node --max-old-space-size=1024 search-reference.mjs
node search-run.mjs A C stats forensic normalization lifecycle fallback query-baseline C-optimized C-like file-proof schema-parity
node search-run.mjs unicode61
# 再分别执行 accelerator 候选；先结束上一阶段，失败先取证，不能直接跳过。
node search-run.mjs trigram-all
# 原始候选全部取证后，有序插入作为不同参数的受控对照。
# 其余候选名见下文；每次只运行一个，保留终态。
node search-run.mjs runtime temp-indices fts-plans post-fts-parity publication cancellation textmap normalization-coverage audit
node search-export.mjs
node search-report.mjs
node search-checks.mjs
```

`search-run.mjs` 无参数时按源码列出的全部阶段执行，遇到失败立即停止。上面的分段命令便于先审查失败，再继续独立阶段；不是一次复制就忽略失败的成功流水线。四个原始 FTS 阶段为 `unicode61`、`trigram-all`、`trigram-string`、`trigram-large`；后三者分别还有 `-ordered` 阶段，强制主键范围扫描和递增 rowid。每个阶段串行、有依赖结果，无自动重试。日志和 exit/wall 记录在自身产物目录。

本机原始三个trigram、有序全scalar与有序string-only查询计划补测均发生0xC0000005，完整查询未执行；有序string-only、大文本首轮成功proof保留，但不代表稳定性。失败后先运行 `node search-fts-failure.mjs <阶段名>`，保留quick_check、最后提交范围、退出状态和未完成声明。计划补测的取证命令为 `node search-fts-failure.mjs trigram-string-ordered-plans fts-plans`；只对其partial accelerator采集EXPLAIN，未执行查询。确认没有阶段在运行，再执行 `node search-query.mjs reset-accelerator`，才可继续独立阶段或测试不同参数/假设。无代码/参数/环境变化不得机械重跑同一失败。`search-fts-plan.mjs` 记录两种INSERT计划；`search-trigram-range.mjs` 仅对照原始全scalar失败下一批，不能证明大索引稳定。

`search-export.mjs` 要求成功阶段的完整文件，失败 FTS 候选则要求显式 failure manifest；不把 progress 文件导出成成功证据。已完成 literal/trigram 若出现漏匹配、语义或来源审计失败，导出会拒绝；未完成 accelerator 不算零漏匹配。`post-fts-parity` 重新逐行校验 C 的全部 facts，`publication` 比较整源事务与 staging，`cancellation` 单独记录真实取消请求时间，`textmap` 统计全部语言/分片的逻辑载荷。`temp-indices` 是另外一次 A/B/C 全量索引重建，外部100ms观察自有 SQLite temp 目录，不与原始构建耗时混合。

`fts-plans` 原意是补齐首轮未持久化的查询计划，另外完整重建有序string-only索引，只记录EXPLAIN、不重复计数/集合性能测试；本轮补测崩溃，完整计划仍OPEN。其build/内存数字不混入首轮基准，原始成功proof保留。保存failure manifest、reset后，使用 `node search-run.mjs post-fts-parity publication cancellation textmap normalization-coverage audit` 继续独立收尾；不得把partial/空FTS或toy库当作成功全量query plan。`normalization-coverage` 将forensic新增的歧义来源distinct string与既有分组对照，全库case/NFC统计包含这些内容。

初次 reference 因生产 tokenizer 的 U+FEFF 丢失失败，本轮修正调查观察层后全量重跑；历史 `--repair-investigation` 只用于对照确认后修正 B 自有实验库，不是 production 修复，也不修改 raw 来源。当前正确观察层的新运行不需要该参数。发生 parity failure 先保留 truth DB/log，诊断原因并重新校验；不能直接开启 repair 消除未知差异。`search-normalization.py` 保留首次 Python SQLite native crash 原型用于审查，不是默认成功路径；正式复现用 Node normalization，Python 只生成 casefold map。独立 Node harness 先执行全量 workload，再在真实 Electron Utility 重复；Electron 无窗口、有限45分钟 guard，不关闭 sandbox，也不修改正式入口。

直接 Node 的 SIGINT 在读取块/SQL批次之间合作取消；独立 reference 的取消检查主要在来源之间。同步 SQL 正在执行时不能被同线程 timer 打断。监督进程终止 child 或 Electron guard 结束属于崩溃/强制终止，保留数据库/log，未发布来源保持 building/stale；不是低延迟取消证明。只有 publication gate 成功才能发布 current coverage。

调查 scanner 使用64 KiB chunk、16 MiB token、depth256、120秒/source、2 GiB RSS guard；生产 RawDataService 的更窄预算没有变化。packed scalar 在调查预算内物化，超限输出明确 resource failure。观测层复用成熟 tokenizer/grammar，numeric lexeme 不转 Number；有界 quoted string 原生解码保留 FEFF。独立 stream-json 全库重新产生事实与 query truth。FAILED duplicate sources 的 raw census 与可导航 index scope 分开，FILE 全量覆盖。

自有数据库清理前关闭全部相关子进程/handle；先列清单，再执行：

FTS reset 只移除两张调查 accelerator/eligibility 表，保留 lossless facts。同步 count/CREATE INDEX 的取消可能等待长 SQL 返回，不能将此诊断工具视为低延迟 production planner；有界取消证据来自 lifecycle 和独立 cancellation 分批 probe。执行 cleanup 前，完成 export/report/检查与最终 source audit；清理记录可追加到紧凑证据的 delivery 字段。

```powershell
node search-cleanup.mjs
# 已完成export/report/checks和最终全库metadata audit后，才能删除大型JSON。
node search-cleanup.mjs --include-large-json
node search-cleanup.mjs --execute --include-large-json
node search-delivery.mjs
```

若保留大型JSON以继续audit，可省略 `--include-large-json`，然后执行：

```powershell
node search-build.mjs audit
```

cleanup 核实绝对目标是 `artifacts/search` 的直接普通文件，拒绝 symlink，移除 SQLite/sidecar 与命名 synthetic fixtures；可选移除同一自有目录中大于4MiB的JSON。不会删除來源、依赖、production 文件或整个工作区。`search-delivery.mjs` 验证清理已执行、重查外部HEAD/status/16个代表hash，追加delivery记录与最终验收段，再检查文档链接和diff。全库metadata审计在删除baseline前完成。大原始 JSON/log 位于忽略目录，仅紧凑证据进入 docs。清理后重测数据库阶段需从 build/reference 开始，不能用旧 progress 恢复成 complete。最终报告见 [Phase 2 Search](../../docs/investigations/phase-2-search-architecture-full-dataset-investigation.md)。Windows 结果不外推为 Mac 或 packaged SLA。

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
