# Phase 0 / Phase 2A / Phase 2 Search 非生产调查工具

## Phase 2 Search Round 2：停止报告与复现

后续 [Execution-lane closeout](../../docs/investigations/phase-2-search-execution-lane-validation.md) 已完成；下文保留先前失败及 Controlled Retry 历史，当前状态由 docs/STATUS 管理。

### 本轮 closeout 工具

`search2-closeout.mjs` 保存 baseline、单次原入口复现、恢复/普通 built smoke、私有 lane/probes 和来源审计；`search2-closeout-acl.ps1` 保存 SID/SDDL、icacls backup 及局部 grant/audit；`search2-closeout-{work,lane,electron}` 执行有界负载，`search2-closeout-checks.mjs` 验证 resolver 终态，`search2-closeout-cleanup.ps1` 做受控清理/只读进程审计，`search2-closeout-export.mjs` 在独立验收后导出 evidence。

固定 ignored 产物根为 `artifacts/search-round2/execution-lane-closeout/`。单次阶段 manifest 已存在时拒绝覆盖，不删除历史来盲目 retry。新调查若复用，应先明确另一个产物 namespace，保留本轮源码 snapshots/指纹和日志。

本轮顺序：baseline → reproduce（原入口/参数不变，旧小型文件备份/恢复）→ ACL inspect/backup → 仅复现相同 fatal 才 grant/audit → 正常用户 recovery-owner → 当前 build/built smoke-owner → lanes → failure-recovery-addendum → probes（只修正 histogram 首 tick，不重跑矩阵）→ checks/audit → cleanup/process audit/export。原 harness 固定写出的 profile 单独列入清理记录。

Electron/构建在 CodexSandboxOffline 身份下仍受限制，实际 Electron 验收使用正常用户身份；应用 sandbox 保持开启。ACL 仅给 `electron/dist` 添加标准 package RX，先 backup，不修改广泛父目录或其他 ACE。Main 只发私有有界消息；Worker/Utility 自己拥有 native connections，不接 public IPC，不需要被清理的 full S1 DB。

这是调查工具，不进入 production bundle。报告见 [Round 2](../../docs/investigations/phase-2-search-candidate-source-index-investigation.md)，紧凑证据见 [measurements](../../docs/investigations/evidence/phase-2-search-candidate-source-measurements.json)。本次三来源预检成功，随后全库 S1 原生退出 `0xC0000409`，已按明确 stop condition 停止；未完成 hashed/packed/hybrid、真实 Exact/Contains 或隔离 lane benchmark。

产物全部位于 ignored `artifacts/search-round2/`。复用已安装依赖；不改生产/调查 package 和 lockfile、不下载、不写 TurnBasedGameData。每次大型阶段先检查磁盘并保留 30 GiB 调查安全余量；来源 scanner 与整体 RSS/time guard 复用 Round 1 调查预算，不改变生产限制。32 MiB 去重记账触发自有 staging spill，记账不是实际 JS heap。

以下为本次实际顺序。预检与完整构建各一次，无自动 retry/resume；原生退出后不得机械继续统计或更多大库。重新执行大型调查须先评审失败并确认新诊断假设，工具拒绝覆盖现有 DB：

```powershell
node search2-run.mjs search2-build.mjs --pilot
node search2-run.mjs search2-build.mjs
# 本次上一步退出非零；只读取证，不恢复失败库。
node search2-run.mjs search2-forensic.mjs
# 小型自有 fixture 验证，不是新全库性能阶段。
node search2-run.mjs search2-tests.mjs
# 审计并导出 STOPPED evidence，清理已核实的自有 DB/清单。
node search2-delivery.mjs
# 在应用根目录另执行 npm.cmd run format:check 后，补齐轻量最终检查。
node search2-checks.mjs
```

`search2-run.mjs` 串行监督单个 child，保存 exit/wall、100ms 可命名文件长度高水位和 RSS 检查点；45分钟 guard 是有限保护，强制退出不能称合作取消。未命名/快速删除的 temp 和瞬时 RSS 不保证观察。各文件高水位不一定同时发生。

`search2-stats.mjs` 只在完整成功 build/census 与全库来源数一致后才可执行；本次没有运行它，也没有生成冻结的 df benchmark set。`search2-resolve.mjs` 为小型 fixture 通过的调查原型，包含字典分批候选、流式 raw verify、provisional/verified 来源结果和临时 spool；还未通过真实全库/Browser/取消压力 gate，不是 production Query API。

独立 stream-json fixture 比较完整 typed literal/Pointer 身份序列，生产 `src` 不变。原 `search-lib.mjs` 的 FIELD 观察仅补 associated-value type，FEFF 修正继续是已有调查观察层；production FEFF defect 未修。重复键仍拒绝发布唯一可导航地址。

交付脚本只导出本次停止状态，要求外部 HEAD/status/16代表hash及全库metadata与 baseline 一致，要求 production src/package/lockfile 无变更、所有监督 child 已退出。关闭 handle 后逐个检查自有普通文件，删除 DB/sidecar 与完成审计后的 baseline；不会递归删除来源、依赖或工作区。已清理后的完整构建/forensic/delivery 不能直接再次运行；小型 fixture checks 可单独重复，但没有新失败或代码变化时无需机械复验。

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


## Search Round 2 Controlled Retry（2026-10-05）

本次只运行一次 S1 Attempt #2。完整重试成功，条件恢复取得全量 membership proof、真实 Exact/Contains、转换空间、生命周期和 spool 证据；Electron lane 在 ready 前因 Windows install-directory sandbox ACL 原生退出 0x80000003，随后停止新增实验。报告和当前结论见 [Controlled Retry Review](../../docs/investigations/phase-2-search-candidate-source-index-investigation.md)，[新 compact evidence](../../docs/investigations/evidence/phase-2-search-candidate-source-controlled-retry.json) 与旧 Attempt #1 evidence 分开保存。

实际入口从仓库根运行，记录在 ignored artifacts/search-round2/controlled-retry/。以下是本次命令与用途档案，不授权再执行同一 S1 第三次运行；现存 attempt manifest 会拒绝重放，交付时大 DB/清单已删除。

- search2-retry.mjs：保存当前 scanner，加载 c3a3702 的首次实际版本；原 builder/schema/4096 batch/Node args 不变。100ms 文件采样、30s 短只读 diagnostic、45min guard、单 child、无自动重启；finally 恢复 scanner 与旧小证据。
- search2-retry-audit.mjs、search2-s1-census.mjs：完整 acceptance/counters/source census、类型压缩率、df≤20 等桶、source cardinality 与 dbstat。
- search2-reference.mjs / search2-reference-fixtures.mjs：独立 stream-json 全库 per-source membership 证明，无 B.db 或永久 occurrence truth。
- search2-benchmark.mjs exact / contains：冻结查询首次与重复、候选/Pointer recovery、独立 identity truth 单独计时；search2-canonical-benchmark.mjs 测有界 native canonical 预筛。
- search2-resolve.mjs：调查专用 typed literal resolver、来源验证后发布、generation spool、有限页面；最终 completion stat/cache guard 新增晚于 benchmark，旧计时版本另存 artifacts，额外延迟未计入原 fullMs。
- search2-broad-file.mjs、search2-million-spool.mjs：真实 broad 的成本/取消和独立 FILE；自有 1M fixture 验证有界页面/磁盘/spool/排序，不是全 workspace SLA。
- search2-space.mjs：S1 count/no-count pair 实际完成，初次 hash 因 writable-connection iterator 的 JS busy exception 失败；该历史不改写。search2-hash.mjs 使用独立 readonly source，保留已知中断历史后完成 hash-only 8/16-byte 转换；Exact-only 与 Contains 总成本分别记录，不能冒充 direct build。search2-nav-space.mjs 另测与旧 C 相同 ready scope 的转换空间。
- search2-lifecycle.mjs：自有事务发布、取消、替换/删除、已知 JS exit 23、重开/GC 与 8/16-byte 强制 collision union。search2-resolver-checks.mjs、search2-canonical-checks.mjs、search2-completion-checks.mjs 为最终相关 checks，不覆盖旧 Attempt #1 evidence。
- search2-lane-work.mjs、search2-lane.cjs、search2-lanes-electron.cjs / search2-lanes.mjs：准备的私有 Electron 三通道及真实 Browser harness；实际仅到 native startup fatal，probe 和 4×6 matrix **未执行**。未禁用 sandbox、改 ACL 或版本。
- search2-resume-run.mjs：独立阶段 supervisor；不自动重启、重放或绕过 unexplained native failure。只保留已查明 JS harness 修复/主动中断的明确历史例外；最新 native lane failure 阻止后续实验。
- search2-success-closeout.mjs：名称指 S1 retry 成功分支，实际导出最终 BLOCKED 状态；来源审计后逐文件清理并保留小证据。search2-retry-closeout.mjs 为未走到的 S1 retry 失败分支，未执行。search2-delivery-checks.mjs 只做终态交付审计，不启动 native workload。

没有修改 production src、全部 package/lockfile、RawBridge/Preload/public IPC/UI、外部来源或 accepted ADR。没有 production build/commit/push/PR；保留首次 native crash 根因 UNKNOWN。所有大型构建/转换串行，30 GiB reserve；100ms named-file 和 IPC RSS checkpoint 会漏短峰、匿名 SQLite temp，不能把缺测填成 0。
