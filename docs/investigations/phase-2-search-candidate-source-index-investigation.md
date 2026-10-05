# Phase 2 Search Round 2：Candidate-Source 索引调查

日期：2026-10-05（UTC+8）。本轮状态：**CONTROLLED RETRY #2 PASS / BLOCKED BY NATIVE STABILITY / NO / REQUIRES ROUND 3 / AWAITING REVIEW**。

当前结论：唯一一次 S1 受控重试完整成功，独立全库 membership、真实查询、空间与生命周期证据已取得；随后 Electron lane 在 ready 前因 Windows sandbox ACL 原生退出，立即停止新增实验。Search architecture 仍为 **NO / REQUIRES ROUND 3**，原因包含未完成 execution gate 与首次原生异常根因未知。新证据见 [Controlled retry evidence](evidence/phase-2-search-candidate-source-controlled-retry.json)。

第 1–30 节保留 Attempt #1 首次交付的历史事实和结论。2026-10-05 用户另行授权的唯一一次受控重试及条件性恢复，记录在第 31 节 Controlled Retry Review；首次失败证据没有改写。

本文依据 `RefAtlas Phase 2 Search — Round 2 Candidate-Source Index Investigation.md` 执行调查，是证据报告，不是 accepted architecture。紧凑证据见 [Round 2 measurements](evidence/phase-2-search-candidate-source-measurements.json)，复现和停止规则见 [调查工具 README](../../tools/investigation/README.md)。

## 1. Executive Summary

**Search architecture 尚不能关闭，结论为 NO / REQUIRES ROUND 3。** S1 的直接 raw 构建在新非 FTS 路径中发生原生进程异常退出 `3221226505 / 0xC0000409`，触发 prompt 明确列出的停止条件。没有重试完整构建，没有继续生成 hashed、packed、bitmap 或 FTS 大型数据库。

这不是“candidate-source 架构已被否定”。目前缺少完整 membership census、稳定完整 S1、真实 Exact/Contains resolver benchmark 和独立执行通道压力证据。不能用失败库的大小外推桌面 cache，也不能用小型 fixture 的正确性代替全库接受门槛。

已完成三个真实来源的预检、失败库只读取证、七组小型独立 parser/候选/恢复检查及最终来源审计。收尾集中清理 DB/清单 531,375,834 bytes（506.76 MiB），小型 fixture/spool 另在检查中即时清理；production src、package/lockfile 与外部数据未变，owned child processes 为零。

## 2. Why Round 2 Exists

[Round 1](phase-2-search-architecture-full-dataset-investigation.md) 测得 137,916 JSON、2,617,263,428 raw bytes，以及 83,513,357 个可导航 FIELD/VALUE occurrence。表现最好的完整 occurrence C 库仍为 11,712,999,424 bytes（10.91 GiB），且有 WAL/temp/staging 成本。

本轮改变持久化单位：只保存 typed term 与 source 的唯一关系，查询时重新从 raw 恢复 Pointer、类型和匹配 occurrence。调查优先级为选择性 Exact ID 外观 literal，其次 internal-name/text Contains；百万级低选择性查询允许慢，但不能无界、不可取消或假装 complete。

## 3. Reused Round 1 Evidence

| 复用事实 | 范围与限制 |
| --- | --- |
| raw FIELD/VALUE 83,533,059；可导航 83,513,357 | 完整 raw 与排除歧义地址的范围分开 |
| 可导航 typed terms 8,827,401 | FIELD 595,782；STRING 5,410,617；NUMBER 2,820,999；BOOLEAN 2；NULL 1 |
| 完整 raw distinct STRING 5,412,107、NUMBER 2,821,006 | 包含歧义来源，只作 raw 统计 |
| 15 个来源、263 个重复键、19,702 raw occurrences | 当前 Pointer 无法提供唯一可导航地址 |
| 137,916 metadata stat 约 7.32 秒；全 hash 约 83.2 秒 | 复用 reopen 成本，不重新跑性能循环 |
| 字典优先 Contains 秒级；同 lane Browser 可排队约 5–6 秒 | 原 occurrence 家族的历史证据，不是本轮性能 |
| production FEFF 丢失；FTS/native 稳定性未证 | FEFF 独立前置修复；trigram deferred |

没有重建 A/B/C、完整 occurrence truth、FTS/trigram，也没有重跑 normalization 或 container serialization census。已经阅读要求的 PROJECT、STATUS、ARCHITECTURE、ROADMAP、ADR-0004/0007/0008/0009 及既有报告/证据；没有改写已接受约束。

## 4. Dataset / Environment Baseline

RefAtlas HEAD 为 `c3a3702f0e3a5e01a2bd3b9e08bd2d544d34901c`；外部 HEAD 为 `724b139d8c9c32d12552eb95745a4fee72bfe48b`。开始时工作树干净。Windows x64、Node 24.21.0、better-sqlite3 13.0.3、SQLite 3.53.4；独立 parser 使用已安装 stream-json 3.7.0，没有下载或依赖变更。

本轮自有目录是被忽略的 `tools/investigation/artifacts/search-round2/`，不复用旧库路径。启动时约 234 GiB 可用空间；大型阶段前执行可用空间检查，预留 30 GiB 安全余量。这是调查保护，不是 Search 产品预算或成功阈值。

所有计时均为本机观察，未清空 OS cache。预检和完整构建各执行一次；没有冷读、p95、macOS、packaged 或可见 UI SLA 声明。

## 5. Staged Investigation / Stop Decision

| 阶段 | 实际终态 |
| --- | --- |
| 三来源 direct-from-raw 预检 | 完成，quick_check=ok |
| 完整 membership census / S1 | 原生退出；未完成，不发布 census |
| 最后六来源只读失败取证 | 完成；没有修复或恢复失败库 |
| 小型自有 fixtures 保真/候选/恢复检查 | 七组通过，不是新大型候选实验 |
| Exact ID、Contains 全库 benchmark | 未执行：停止条件已触发 |
| count/no-count、hash、S2/S3 | 未执行：没有完成的 S1 / 高频尾部证据 |
| 隔离 execution lane / Browser under Search | 未执行：未进入 Stage 6 |
| 来源审计、导出、清理、文档验收 | 完成，见收尾记录 |

停止理由是新的非 FTS 原生崩溃，不是 membership 收益太小，也不是 broad query 太慢。继续比较更多大型 format 会掩盖当前构建稳定性问题；本轮没有这样做。

## 6. Term-Source Membership Census

**全库 membership 数量未取得。** 崩溃恢复后的部分库包含 22,355 ready 来源及 1 个 building 来源；1,422,473 memberships 对应 10,009,459 occurrences，比例约 7.04。该数据是按路径顺序处理的前缀，不是代表性采样；没有包括完整 TextMap/ExcelOutput 工作量，不能乘比例估计 83.5M 的最终 membership 数。

三来源预检另有完整、但明确非代表性的统计：

| 类型 | occurrence | membership | occurrence / membership |
| --- | ---: | ---: | ---: |
| FIELD | 1,766,249 | 474,240 | 3.72 |
| STRING | 862,567 | 364,584 | 2.37 |
| NUMBER | 454,109 | 66,158 | 6.86 |
| BOOLEAN | 94 | 1 | 94 |
| NULL | 0 | 0 | 不适用 |
| 总计 | 3,083,019 | 904,983 | 3.41 |

这不是 A 问题要求的全库答案。失败前未保存完整按类型 census，报告不将 progress 或恢复库前缀伪装成成功终态。

## 7. Document Frequency Distribution

完整 FIELD/STRING/NUMBER 的 p50/p90/p95/p99/p99.9/max、df=1/≤5/≤10/≤100/≤1000、高频尾部均 **NOT MEASURED**。调查统计工具已准备，但要求成功完整构建与对应来源数才能导出 complete；失败库不能启动该完整统计阶段。

因此还不能回答 typical Exact term 的 source fan-out，或据此判断 ID 工作流是否实用。Round 1 occurrence frequency 不能替代本轮 document frequency。

## 8. Source Cardinality Distribution

全库 cardinality 分布未完成。三个预检来源展示了明显异质性：

| 来源 | FIELD distinct | STRING distinct | NUMBER distinct | 总 typed memberships | occurrence / membership |
| --- | ---: | ---: | ---: | ---: | ---: |
| ExcelOutput/AvatarConfig.json | 42 | 1,526 | 1,376 | 2,945 | 3.20 |
| ExcelOutput/SpecialAvatarRelicMainValue.json | 5 | 19 | 64,782 | 64,806 | 32.79 |
| TextMap/TextMapCHS.json | 474,193 | 363,039 | 0 | 837,232 | 1.13 |

SpecialAvatarRelicMainValue 的重复 occurrence 大量消失，TextMap 的大量不同 key/text 仍要保存。不能给文件名建立 production policy；本轮未测 TalkSentenceConfig 或其他最大来源的 source-term cardinality。

## 9. Candidate S1 Relational Design

已执行的调查 schema 为：

```text
files(id, path, stamp, sha256, bytes, state)
terms(id, class, kind, exact_key, scan_text, df, occurrences)
memberships(term_id, source_id, n)
  PRIMARY KEY(term_id, source_id) WITHOUT ROWID
memberships_source(source_id, term_id)
```

`exact_key` 复用经过 Round 1 验证的保真表示；FIELD/STRING 是 canonical JSON string encoding，NUMBER/BOOLEAN/NULL 是原 lexeme/literal。decoded scan_text 只保存 well-formed 内容，特殊内容由保真 key 解码匹配，不允许静默丢弃。

没有持久化 Pointer、byte range 或 source order。反向索引在完整预检中实际创建并计入大小；失败的全库构建尚未进入该索引阶段。`n`、df、occurrences 是本轮观察用计数，不是默认 production payload：有/无计数对照尚未执行。

写入过程中 memberships 可分批提交，但 `files.state=ready` 只在完整源扫描、stamp/hash 和 membership 发布后设置。候选读取只接受 ready；building/stale/failed 不代表没有 raw 命中。terms 的观察计数包含尚未发布的关系时不能作 current coverage 的精确计数。

## 10. Candidate S2 / S3

**NOT RUN。** 没有完成全库 S1 空间测量，不能判定 relational row overhead 是否需要 packed postings；没有完整 df 高频尾部，也没有理由测试 bitmap。

uint32/delta-varint 和 common-term bitmap 保留为未来条件性候选。本轮未自研 production format，没有创建更多大型实验库。

## 11. Exact Hashed Candidate Index

调查 helper 将 SHA-256 输入定义为 typed canonical literal 的 JSON tuple，即 class、kind、exact key；8-byte 与 16-byte 截断输出在小型 typed-domain 场景检查中保持 NUMBER/STRING 区分。

**全库 hashed DB size、lookup、碰撞频率和增量行为未测。** 小型强制碰撞检查只验证候选 source 集合应合并的原理，没有构建 hashed SQLite 方案，也不能称数学无碰撞或实际压缩格式已验收。

正确性条件仍是候选 superset + raw verify；hash collision 必须增加候选，不能覆盖旧 source 而造成漏匹配。只算 Exact-only hash 的体积、忽略 Contains 字典和 postings 总成本，也不能宣称其优于 S1。

## 12. Direct-from-Raw Build Cost

三个预检来源合计 106,282,775 raw bytes，实际直接从 raw 构建，未由旧 B/C 转换。

| 项目 | 预检实测 |
| --- | ---: |
| build wall，含反向索引和 quick_check | 23,435.90 ms |
| supervisor wall，含 audit/inventory/启动 | 29,571.76 ms |
| memberships / distinct terms | 904,983 / 904,981 |
| callback 内 insert 累计 | 4,170.49 ms |
| reverse index 构建 | 188.21 ms |
| parse callback 累计 | 14,613.46 ms |
| source read 累计 | 285.54 ms |

parse callback 包含去重与可能的 staging 写入；各阶段数字不独立，不相加伪造 wall 分解。全库 supervisor 在 127,122.29 ms 后收到非零退出，属于 time-to-failure，不是完整构建成本。

## 13. Disk / WAL / Temp / Memory

| 项目 | 三来源预检 | 失败全库路径 |
| --- | ---: | ---: |
| main DB | 206,512,128 bytes，完整预检且含反向索引 | 69,693,440 bytes，部分库，无最终反向索引 |
| main WAL 外部采样高水位 | 15,070,992 bytes | 14,111,032 bytes |
| staging DB | 211,501,056 bytes | 8,192 bytes |
| staging WAL 外部采样高水位 | 155,929,672 bytes | 4,152 bytes |
| 外部收到的 RSS 检查点 max | 404,197,376 bytes | 354,648,064 bytes |

预检 main DB / 对应 raw bytes 为 1.94×，**只对这三个来源成立**；不能据此计算全库 candidate / raw 或 old C 的缩减比例。logical payload 未在预检单独记录，完整候选空间与 payload 均未完成。

SQLite temp 被指定到自有目录，外部 100ms 采样只观察可命名文件。短暂或已删除/未命名 temp 无法保证观测；各文件高水位不一定同时发生，不能相加称作完整瞬时 peak。

per-source dedup 以约 32 MiB 的 key/条目记账触发 SQLite spill，另保留整体 RSS guard。CHS 预检发生 spill，其余两个没有；该记账不是 JS heap 实测，也不构成任意大 source 恒定内存证明。高 staging 成本值得未来研究，但不能在 native failure 未解释时继续做无约束优化。

## 14. Native Failure Forensic

最后 checkpoint 记录 22,001 来源、1,230,206 memberships；恢复数据库显示实际已有 22,355 ready 来源、1,422,473 memberships、273,991 terms。两者不同是 progress 记录间隔，不是成功全库 census。

最后 building 来源为：

```text
Config/Gameplays/LittleGame/FiveDim/Level/Version_440/Map_B401/B401_LightningCity.json
1,779,064 bytes
```

它没有发布 fingerprint 或 membership；只读单独扫描成功，得到 2,562 typed memberships，stamp 与起始清单一致。前五个 ready 来源再次用同一调查 scanner 与 membership 表比对，集合/计数一致。这个局部检查不是独立全库 reference proof，也不能排除解析器状态累积或其他原生问题。

SQLite `quick_check=ok`。stderr 没有 JS exception/stack；应用事件日志查询未取得匹配的 node.exe 崩溃事件。仅凭退出码不能判定是 SQLite、tokenizer、V8、硬件还是其他环境因素。**ROOT CAUSE NOT ESTABLISHED**，没有把它错误命名为已确认 SQLite defect，也没有恢复或重试原失败构建。

## 15. Exact ID Benchmark Set / ID Query Results

`1001`、`6186714091647966180`、`16752756560315677817` 仍为必须覆盖的真实查询。df=1、2–5、6–20、21–100、100+ 的 deterministic ID 外观选择工具已准备，但完整 df 未得到，benchmark set 没有完成冻结或执行。

没有真实 candidate count/bytes、open/stat、first result、first 10/50、full resolution 数字，也没有可交付的三个真实 ID case study。Round 1 的 `1001` 可导航 VALUE 4,065 occurrences（STRING 23、NUMBER 4,042）只作复用事实，不能替代新路径延迟。

ID 外观始终只用于 workload 分类，没有 entity/reference 含义；同一个输入同时搜索 NUMBER/STRING 时保留各自类型，不做数值归一化。

## 16. Common Exact Query Results / Broad Explosion

`1`、`0`、`true`、`null`、FIELD `Value`、`ID` 的本轮真实候选/resolver benchmark **NOT RUN**。Round 1 已证明 `1`、`true`、`Value` 等拥有百万级 occurrence；source-level 去重不会消除最终需要恢复的这些 occurrence。

因此低选择性是已知成本来源，但本轮尚不能量化 candidate workspace fan-out 或判断某次延迟是否还有实现问题。慢本身不等于架构失败；无法取消、Browser 阻塞、无界 spool、漏结果或 false complete 才需要否定具体实现。

## 17. Contains Dictionary Candidate Path / Case Study

调查 resolver 已具备按 2,048-term 范围批次扫描字典、matching term 展开、source 去重、raw verify 的路径。FIELD、STRING、NUMBER lexeme 与 VALUE 范围独立匹配；非 well-formed 内容回到保真 key，不只扫描 TEXT 副本。

`Monster_W1_Mecha`、`Avatar_Mar_7th`、`Avatar`、`拍摄模式`、`撮影`、`chụp`，以及 rare/medium internal-name、common fragment、zero-result 的真实 workload **NOT RUN**。没有 dictionary time、matching terms、candidate sources/bytes、first page、full resolution 或代表 Pointer；internal-name 流程是否实用仍 OPEN。不存在伪造的 case study。

trigram/FTS 继续为 **DEFERRED OPTIONAL ACCELERATOR**。本次崩溃发生于不含 FTS 的新构建路径，不能归咎于上一轮 trigram，也不能用旧字典性能保证本轮成功。

## 18. FILE Search

FILE 应继续使用 137,916-source catalog，Exact basename/relative path、Contains path 可独立实现；不进入复杂 term postings。FILE baseline 本轮未执行，不能报告新的耗时。重复键来源仍可参加 FILE，FIELD/VALUE 可导航覆盖维持明确 partial。

## 19. Query-Time Occurrence Resolver

调查专用 `resolveOccurrences` 复用成熟 tokenizer 的有界 scanner，原 numeric lexeme 不经过 Number。只对被匹配 occurrence 生成 Pointer、raw type、bounded preview 和可选 raw token range；FIELD range 是 key token，不能冒充 associated value range。

小型 fixture 通过独立 stream-json 比对 typed literal / Pointer 身份序列，覆盖 `1/1.0/1.00/1e0/-0`、超安全整数、numeric-looking string、FEFF、跨块转义、NUL、孤立 surrogate、emoji 边界、NFC 不合并及容器字段。FIELD associated value kind 是调查 observer 新增 metadata；production adapter 没有改变。

来源 scan 前检查 path/handle stat，scan 后检查 stamp/hash；不一致使查询失败/partial。首批结果标作 provisional，只有来源验证完才进入 verified coverage。旧结果不借当前 revision 洗掉旧 fingerprint。

resolver 的 `complete` 仅表示给定候选已扫描，同时输出 `candidateResolutionComplete` 和 `workspaceSearchComplete=false`；当前工具没有完整 catalog coverage 的生产契约，空候选不能洗掉 stale/failed 来源而宣称全工作区零命中。该结果支持“无需持久 Pointer 即可恢复地址”的局部机制，但未完成全库独立校验、真实 Browser navigation 或资源压力门槛，不能把 K 问题提升为全库已证。

## 20. First Result / First Page / SearchResult

工具分别记录 provisional first/10/50 与 source-verified first/10/50，避免把尚未完成语法和来源验证的发现称为已确认结果。长 candidate source 可能推迟 verified first page，这个成本必须由真实 benchmark 决定。

建议 query result 保留 FILE/FIELD/VALUE、SourceAddress/NodeAddress、fingerprint/revision 上下文、raw type、Exact/Contains、bounded preview 及 truncated 标记；Pointer 与 optional range 仅进入 query result/spool。本轮没有新增 public API、shared type、IPC 或 SourceSession 集成。

## 21. Result Spool / Ordering / Progressive Behavior

小型测试使用临时 SQLite spool，50 条页起点、256 code-point preview，逐 source 从 provisional 升为 verified。查询结束后清理；没有创建永久 occurrence index。

百万结果 spool 的首屏、磁盘增长、分页压力、运行中取消延迟及清理峰值 **NOT MEASURED**。测试只覆盖已请求取消不发布 complete，不能声称低延迟中断同步 SQL。

source scan order 与全局 tier/path 排序的实际对照未执行。V1 待评审方向是明确 provisional progressive 结果并发布已验证覆盖内的稳定页面，不强迫首屏等待整个 workspace；排序契约、重排可见性和 generation-bound cursor 仍需真实 spool gate。

## 22. Incremental Source Replacement / Dictionary GC

新增、变化、删除、取消 rebuild、crash-before-publish 的完整增量实验 **NOT RUN**。本次真实崩溃只证明 building 来源没有伪装 ready，并且数据库可只读恢复；不等于增量替换事务已验收。

后续仍应采用旧 membership stale/non-current → 新 source term set staging → 验证 → 原子发布。孤儿 term 可 lazy GC / rebuildable cleanup；这仅为待测建议，未有 evidence 接受 GC 性能或 packed postings 的增量复杂度。

## 23. Persistent Cache Reopen

没有完整可用 candidate cache，本轮未测 DB open/schema version/catalog validation 的可用搜索时间。复用 Round 1 stat/hash 成本，不再次循环重测。

trusted persisted coverage + background validation 可以作为未来候选，但未验证缓存不得称 current truth；已知变化来源进入 stale/fallback 或显式未覆盖状态，不能借“后台验证”允许 false-negative complete。

## 24. Search Execution Lane / Browser under Search

同 Utility 的独立 scheduler、DataService-owned Worker Thread、独立 Utility Process 的概念对照仍有意义：前者不能隔离同 JS thread 的同步 CPU/native 阻塞；后两者需要各自 SQLite ownership、取消、内存及 crash/packaging gate。

本轮没有运行这些原型，没有在 build、Exact、Contains、broad resolution 下测六种 Browser 操作。不能宣称独立 lane 已解决 Round 1 排队问题；**L 仍 OPEN**。Worker Thread 也没有因此变成 accepted architecture。未来先从 Search 并发 1 验证，不按 CPU cores 铺开全库任务。

## 25. FEFF / Duplicate-Key Prerequisites

production segmented TextDecoder 丢 U+FEFF 的缺陷继续存在，真实来源为 `TextMap/TextMapJP.json` `/7505878640962067595`。调查 scanner 继续使用 Round 1 已校验的正确 quoted-token 解码；本轮没有修 production。

**FEFF 必须在任何 production Search Foundation 前独立修复并验收。** 15 个重复键来源不改 ADR-0007，不引入 occurrence-index Pointer、first/last-wins 或新 NodeAddress；FILE 可覆盖，FIELD/VALUE navigable scope 继续 partial。

## 26. Exact / Contains Product Recommendation / Cost Visibility

保留两个明确 UI mode、普通 literal input，暂建议 **default=Exact**，理由是用户给定的 ID/hash/internal identifier 使用优先级。它不是本轮实测得出的性能胜利，也未实施 UI。

candidate source count/bytes 可从 current postings + catalog 在 raw resolution 前取得；本轮小型候选工具具备此机制。source-local occurrence count 是否值得保存仍未完成有/无计数对照。未来展示成本/进度，而不设任意 hidden query hard reject。

没有 field:/number:/regex:/引号语法、fuzzy、语义搜索或 HSR filename/entity special-casing。

## 27. Recommended Physical Architecture / Rejected Alternatives

**本轮不推荐一套已验收的 production physical architecture。** source-level candidate + raw resolver 仍是待证假设；S1 是最小调查起点，hash/text 的 asymmetric design 和 packed/hybrid 都没有得到接受证据。

继续排除默认 10.91 GiB full occurrence cache、为 common literal 添永久百万 Pointer、FTS 决定完整性、用 preview 取代 full raw matching、先自研复杂 postings format，以及以部分库外推完整容量。

## 28. Required Answers A–O

| 问题 | 本轮回答 |
| --- | --- |
| A：完整 term-source memberships 对比 83.5M？ | **未取得**；部分前缀 1,422,473 / 10,009,459；不能外推 |
| B：完整 no-Pointer index disk？ | **未取得**；完整三来源预检 main 206,512,128 bytes |
| C：消除了旧 C 的多少空间？ | **不可计算**；不存在完整同范围候选 |
| D：typical ID candidate/bytes/first/full？ | **未测**，df/query set 未完成 |
| E：internal-name Contains 的各阶段成本？ | **未测**，case study 未执行 |
| F：common literal 慢是架构失败还是低选择性？ | 历史百万 occurrence 证明低选择性；新路径延迟原因尚不能量化 |
| G：简单 relational 是否足够？ | **UNKNOWN**；完整构建稳定性未证 |
| H：packed 值得复杂度吗？ | **UNKNOWN / NOT RUN**；未满足继续优化的证据条件 |
| I：hash 比 full literal 更好？ | **UNKNOWN**；8/16-byte 全库空间/lookup 未测 |
| J：false positive 能由 raw verify 保持正确吗？ | 原理上可以，前提是无 false negative；小型检查不能替代全库 proof |
| K：query-time Pointer recovery 能替代持久 Pointer？ | 小型独立 parser 场景通过；全库和 Browser navigation 仍 OPEN |
| L：隔离 lane 能保护 Browser 吗？ | **UNKNOWN / NOT RUN** |
| M：可渐进而不全量 materialize 吗？ | 小型 spool/provisional/verified 机制成立；broad 压力与取消仍 OPEN |
| N：V1 default mode？ | 暂建议 **Exact**，基于明确用户工作流 |
| O：现在接受 Search architecture？ | **NO / REQUIRES ROUND 3**；没有证明架构不可行 |

## 29. Remaining Questions / Recommended Next Slice

首先 review 本轮停止和失败取证。若再授权 Round 3，应先做有限、可诊断的非 FTS 原生崩溃专项，取得 root-cause 或受控稳定性证据后再继续全库 membership/S1；不要在故障未解释时自动重建多个大型候选。

尚缺：全库 typed membership/df/cardinality、完整无 Pointer 空间、计数和 hash 对照、真实 ID/internal-name case studies、独立全库 candidate completeness、增量替换、broad spool/cancel、隔离 lane 与 Browser 竞争。只在这些关键证据完成后讨论 production physical architecture。

**当前不建议启动任何 Search production slice。** FEFF 修复也是独立授权任务，本轮没有自动开始。Windows timing 不外推 macOS，Search 接受后另做 Mac/native/package gate。

## 30. Cleanup / External Repository Integrity / Validation

清理前最终 HEAD/status 和 16 个代表性 SHA-256/stamp 与起始一致；137,916 个来源的 path/bytes/stat metadata 全部一致。清理后再核对 HEAD/status 和 16 个代表指纹。不是重 hash 全库，也不承诺恶意保留所有 stat 的 strict snapshot。

关闭/退出所有已知 SQLite handle 与子进程后，清理只作用于已核实的自有普通文件，拒绝 symlink/路径逃逸；移除预检和失败 DB/sidecar、以及审计结束后约 29 MiB 的 baseline 清单。保留小型 JSON、日志、源码、报告和紧凑证据；没有递归清理来源、依赖或用户目录。

应用及外部 HEAD 未变，production src、应用/调查 package 与 lockfile 未变；没有 commit、push、PR、production build 或 Search API/UI。本轮只增加调查工具/报告/证据与必要入口说明，旧调查 scanner 仅新增 FIELD associated-value type metadata。

<!-- validation:start -->
七组小型语义场景通过，独立 reference 为 stream-json 3.7.0。最终调查 JS 语法、受管 format:check、40 份文档本地链接/anchor 和 git diff --check 通过；production src/package/lockfile 的 diff/status 为空，清理后自有目录无 DB/sidecar，owned child processes=0。不借用旧阶段验收，不声称完整原生构建稳定性或全库查询通过。报告交付后停止等待 review。
<!-- validation:end -->

## 31. Controlled Retry Review

### 31.1 输入一致性与单次重试

本轮应用 HEAD 为 `accf16860580e889d8954134ad84e17f27ea707b`，外部 HEAD 仍为 `724b139d8c9c32d12552eb95745a4fee72bfe48b`。开始时 production src、全部应用/调查 package 和 lockfile 干净；新增的监督工具单独记录为工作树差异。Node 24.21.0、Windows x64 / 10.0.26300、better-sqlite3 13.0.3、SQLite 3.53.4 与 Attempt #1 一致，没有版本/JIT/批次/PRAGMA/事务/并发/预算调整。

保存当前 scanner 后，临时恢复 `c3a3702` 的调查 scanner。唯一差异是首次 child 已加载后才增加的 FIELD `valueKind` observer metadata；它不参与 typed term key。重试使用恢复后的旧 scanner，结束后恢复当前文件并核对 SHA-256，builder、search2-lib、common 及依赖 manifest/lock 的指纹也保持一致。旧输入来自 Git blob 与已知加载时序的重建，不能冒称 Attempt #1 当时已有 startup hash manifest。

Attempt #2 从空 DB 按同一全库顺序重新开始，没有恢复前缀、跳过来源或重跑预检。监督器只启动一个 child，保留原 Node 参数、100ms 可命名文件长度采样、45 分钟保护及 IPC checkpoints，没有自动重启。外层每 30 秒用短只读事务记录最后 catalog/ready source 和最高 append-only term id，随后立即关闭 reader；没有周期性扫描 memberships 的 count。旧日志、进度和紧凑 evidence 保持原字节。

### 31.2 完整 S1 验收与 native 结论

Attempt #2 exit 0；监督 wall 1,852,422.07ms，builder wall 1,848,148.72ms，含反向索引 12,701.58ms。137,916 来源全部处理：137,901 ready、15 ambiguous、0 failed/building；quick_check=ok。逐源 catalog/census、每个 term 的 df/occurrence counters、各类型计数和 Round 1 raw 总量均一致。

**首次原生异常在这一次受控重试中未复现，根因仍未知。** Attempt #1 的 `0xC0000409`、127,122.29ms、ordinal 22,356 building 来源及部分库证据仍有效；本轮没有第二个 failure locality 可作对照，也没有运行 Attempt #3、版本矩阵或 Native Crash Investigation。不称 bug fixed / native stability proven。

独立 stream-json 3.7.0 校验再次读取全部 137,916 来源，逐源比较完整 typed membership 集合及 source-local count，并核对 hash/stat；24,321,212 memberships、83,533,059 occurrences 全部一致。没有依赖被删除的 B 库，没有永久 occurrence truth DB。独立校验 wall 962,342.19ms；临时 staging DB/WAL 观测高水位 105,988,096 / 82,898,552 bytes。新的 reference fixtures、原有七组语义检查及 generation/分页/运行中取消检查通过；旧 fixture evidence 原字节保留。

### 31.3 完整 membership 与空间

| 类型 | raw occurrences | raw memberships | navigable memberships | raw occurrence / membership |
| --- | ---: | ---: | ---: | ---: |
| FIELD | 46,203,791 | 10,052,258 | 10,052,162 | 4.60 |
| STRING | 15,411,037 | 7,562,414 | 7,559,023 | 2.04 |
| NUMBER | 20,308,946 | 6,584,320 | 6,582,132 | 3.08 |
| BOOLEAN | 1,597,024 | 122,202 | 122,199 | 13.07 |
| NULL | 12,261 | 18 | 18 | 681.17 |
| 总计 | 83,533,059 | 24,321,212 | 24,315,534 | 3.43 |

navigable occurrences 为 83,513,357；完整 raw 与 navigable 范围不混用。15 ambiguous 来源只占 5,678 memberships，但仍不能提供唯一 NodeAddress。

完整 S1 main DB 3,494,031,360 bytes（3.25 GiB，含 reverse index 和 source-local count），为完整 raw bytes 的 1.335×、旧 C 的 29.83%，减少 8,218,968,064 bytes。完整 S1 包含 ambiguous raw memberships，旧 C 只保存 navigable scope；这是采用更宽 S1 范围的保守比较，不能声称两个物理库已经同范围裁剪。后续格式转换须分别说明范围和 direct-from-raw 证据。

| SQLite 对象 | 实测 bytes |
| --- | ---: |
| terms table | 1,735,655,424 |
| exact literal UNIQUE index | 1,068,658,688 |
| memberships | 354,488,320 |
| memberships_source | 288,993,280 |
| files + path UNIQUE index | 46,227,456 |

term table/index 占 80.26%，membership table/reverse index 占 18.42%。canonical exact key logical bytes 为 688,268,386，decoded scan text 为 674,527,148；二者不是全 DB 的完整 logical payload。主要空间问题在字典和 key 重复，不能先认定 packed postings 会解决整个缓存体积。

main WAL 观测高水位 290,690,752 bytes，staging DB 335,990,784、staging WAL 188,024,472 bytes。IPC RSS checkpoint max 521,453,568 bytes；builder after-chunk max 524,427,264 bytes；resourceUsage 原始 maxRSS=700,024，单独保留原 API 口径。没有把这些非同时高水位相加称瞬时 peak，未命名/短暂 temp 仍可能漏采。独立 reference 的一次进程观察为 WorkingSet 641,019,904、PeakWorkingSet 717,426,688 bytes，时间戳未保存，不能当作连续采样。

### 31.4 完整 df / source cardinality 与继续判断

| 类型（完整 raw） | p50 | p90 | p95 | p99 | p99.9 | max | df=1 | ≤5 | ≤10 | ≤20 | ≤100 | ≤1000 | >1000 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| FIELD | 13 | 13 | 13 | 15 | 611 | 109,776 | 87,440 | 113,660 | 116,020 | 590,435 | 593,802 | 595,345 | 437 |
| STRING | 1 | 1 | 2 | 4 | 30 | 30,664 | 5,099,304 | 5,371,591 | 5,395,247 | 5,404,482 | 5,410,248 | 5,411,911 | 196 |
| NUMBER | 1 | 3 | 5 | 15 | 68 | 49,179 | 1,980,090 | 2,710,041 | 2,773,966 | 2,803,884 | 2,819,182 | 2,820,770 | 236 |

navigable 分布单独保存：NUMBER p99=14、max=49,166；STRING distinct=5,410,617。FIELD p50=13 与 TextMap key 跨多个语言来源出现有关，不应解读为 logical entity fan-out。

| source cardinality | p50 | p90 | p95 | p99 | p99.9 | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| FIELD | 19 | 59 | 70 | 124 | 389 | 474,198 |
| STRING | 9 | 35 | 54 | 206 | 913 | 365,476 |
| NUMBER | 5 | 43 | 88 | 568 | 4,668 | 495,451 |
| total | 39 | 133 | 209 | 895 | 6,089 | 839,674 |

最大的 total 是 TextMapJP，839,674 memberships / 69,174,020 raw bytes；其后 TextMapCHT 与 VI。具名大来源和 top 20 来源保留在 census evidence；不据文件名制定生产策略。

membership 与空间收益均显著，故继续 independent proof → ID-first，而非直接接受 S1。数 GiB 缓存仍需物理格式和用户查询代价评估。后续实验与最终架构结论在本节继续补齐。

### 31.5 Exact ID：真实候选与 NodeAddress 恢复

13 个冻结查询均完成首次观察与重复观察。df 桶内使用中位 df、同 df 按 canonical literal BINARY key 排序；NUMBER 与 STRING 各覆盖 1、2–5、6–10、11–100、101–1000 桶。它们是外观分类，不赋予 entity 或引用关系。计时包含 lookup 后恢复，truth 单独计时；没有清空 OS cache，没有冷读或跨平台 SLA 主张。

| scope / literal | sources | candidate bytes | lookup ms | provisional first ms | verified first ms | full ms（首次 / 重复）| occurrences |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| VALUE / `1001` | 1348 | 290074411 | 102.43 | 109.30 | 116.37 | 20651.64 / 21358.98 | 4065 |
| VALUE / `6186714091647966180` | 3 | 285902 | 2.72 | 8.45 | 9.93 | 51.84 / 43.02 | 3 |
| VALUE / `16752756560315677817` | 5 | 12522686 | 2.08 | 6.68 | 10.36 | 948.47 / 1147.12 | 150 |
| NUMBER / `100000020` | 1 | 9219463 | 2.73 | 7.59 | 750.73 | 758.87 / 760.52 | 1 |
| NUMBER / `100000100` | 2 | 325070 | 0.66 | 4.77 | 6.18 | 38.23 / 37.97 | 2 |
| NUMBER / `10000017` | 8 | 26739122 | 0.49 | 23.82 | 32.68 | 2478.00 / 2540.21 | 310 |
| NUMBER / `100000001` | 32 | 47617202 | 6.27 | 12.53 | 13.71 | 3831.53 / 4000.01 | 40 |
| NUMBER / `100010292` | 179 | 42582387 | 22.16 | 29.12 | 31.14 | 4229.52 / 3348.51 | 305 |
| STRING / `100000` | 1 | 7893 | 2.82 | 7.81 | 8.86 | 13.25 / 10.71 | 1 |
| STRING / `100004` | 2 | 11748 | 0.91 | 5.99 | 6.54 | 17.85 / 17.96 | 2 |
| STRING / `1003` | 8 | 408403 | 2.08 | 7.19 | 7.67 | 68.76 / 64.55 | 9 |
| STRING / `10401` | 29 | 509823 | 5.42 | 11.48 | 14.89 | 180.89 / 143.04 | 68 |
| STRING / `300001` | 203 | 1915032 | 10.37 | 15.32 | 18.03 | 772.78 / 618.26 | 239 |

`1001` 是常见但仍比全库选择性高的 ID 外观 case：1,348 来源 / 290,074,411 bytes / 4,065 occurrences；verified 50 需要 477.53ms，完整恢复约 20.65s。两个 typed term 分别是 NUMBER 和 STRING，候选合并不会归一化最终 facts。稀有 `6186714091647966180` 为 3 来源 / 285,902 bytes / 3 occurrences，verified first 9.93ms、满页（本例 3 条）53.59ms；长 hash 外观数字 `16752756560315677817` 为 5 来源 / 12,522,686 bytes / 150 occurrences，verified first 10.36ms、verified 50 863.35ms、完整 948.47ms。长数始终保留 lexeme。

单源 `100000020` 仍需扫描 9,219,463 bytes，verified first 750.74ms，证明 df 不等价于工作量。每次观察另存 open/stat、read、raw scan、provisional 10/50、verified 10/50、页面读取、SHA 与 rawType identity digest。benchmark 中 `firstPublishedPageMs` 是达到 `min(50, indexed occurrence estimate)` 的第一满页，不能误称第一条或首个非空页；broad 实验另测首个非空页面。

独立 stream-json 对每个 candidate source 的完整结果按 factKind、source、Pointer、raw type、canonical literal 与 source SHA 逐序列 digest 比对，全部一致；FIELD 关联值的 raw type 也加入独立 digest。候选无漏项由全库 membership proof 保证。resolver 的 complete 仅表示已提供候选完成，workspaceSearchComplete 始终 false：15 个 ambiguous 来源与生产覆盖 revision 协议没有被本实验关闭。

### 31.6 Contains 字典、internal-name 与 FILE

基线为每 2,048 行 JS 字典扫描 → postings 展开 → source 去重 → raw verification。随后实测新增 canonical JSON SQLite 预筛，仍按 2,048 ID 范围让出 event loop；预筛结果必须 decoded literal verify，非 well-formed 查询退回有界全扫。21 个独立 fixture 覆盖 NUL、FEFF、孤立 surrogate、组合字符、escape 假阳性、ID gap 和空批次，无 false negative。两条路径均不使用 FTS/trigram。

| STRING Contains | matching terms | sources | candidate bytes | 原 lookup ms | canonical lookup ms | canonical verified first ms | canonical full ms | occurrences |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `Monster_W1_Mecha` | 956 | 421 | 26325944 | 10340.88 | 2973.14 | 2983.29 | 5252.21 | 5824 |
| `Avatar_Mar_7th` | 486 | 91 | 17867921 | 11069.22 | 3339.32 | 3350.52 | 4683.55 | 1563 |
| `Avatar` | 35821 | 10423 | 1069772529 | 12104.73 | 4026.24 | 4030.61 | 76601.18 | 174501 |
| `拍摄模式` | 1 | 1 | 52399646 | 9160.88 | 4131.44 | 6996.20 | 6998.80 | 1 |
| `撮影` | 742 | 1 | 69174020 | 8888.84 | 3560.05 | 6417.78 | 6422.35 | 1012 |
| `chụp` | 1124 | 1 | 73607269 | 9580.09 | 3208.73 | 7056.82 | 7061.38 | 1427 |
| `Monster_3` | 170 | 40 | 9237509 | 8907.12 | 2963.83 | 2968.42 | 3519.89 | 608 |
| `Avatar_1015_Skill02_Shake` | 1 | 6 | 934452 | 8852.40 | 3441.79 | 3453.27 | 3508.93 | 7 |
| `__RefAtlas_round2_no_match_20261005_a709__` | 0 | 0 | 0 | 9494.78 | 2603.09 | — | 2606.59 | 0 |
| `Level/Mission` | 23824 | 2117 | 39611924 | 10730.12 | 3172.17 | 3177.05 | 11973.82 | 25490 |

`Monster_W1_Mecha` case：956 个 typed literals 展开成 421 来源，合计约 26.3 MB；JS 基线 dictionary 10,149.54ms、postings 30.78ms、dedupe 0.53ms、catalog 5.32ms、raw 3,019.01ms。canonical 路径 dictionary 2,915.99ms、postings 9.63ms、dedupe 0.53ms、catalog 2.51ms、raw 2,279.04ms，完整 5,252.21ms。例如 `Config/Activity/RtBattle/Ability/Camera/RtBattleMonster_W1_Mecha03_00_Camera.json` 的 `/AbilityList/0/Name` 恢复 STRING `RtBattleWMonster_W1_Mecha_02_Skill03_Camera`；`/AbilityList/0/OnStart/6/CameraConfig/ShakeTemplateName` 也命中。返回 NodeAddress、rawType、有限 preview、来源 fingerprint 和 range role；不持久化 Pointer，也不据 internal name 推断关系。

10 个文本查询的基线两次完整结果均与独立 truth 一致；canonical 路径新观察与冻结 identity digest 一致，重复仅测 lookup（不伪造第二次 raw timing）。`Avatar` 的 10,423 来源 / 约 1.07 GB 是实际较宽查询，完整 76.6s；TextMap 单个大来源可在发布第一条前必须完整验证，中文 1 hit 也有约 7s 的首结果成本。零候选仍有约 2.6s 的字典扫描成本，因此 Contains 必须明确为用户选定模式，不能暗中作为 Exact fallback。

FILE 使用独立 catalog：basename Exact `AvatarConfig.json` 1 hit，首次 7.47ms / 重复 19.48ms；relative-path Exact `ExcelOutput/AvatarConfig.json` 1 hit，1.23 / 1.03ms；path Contains `Level/Mission` 32,217 来源、95,663,057 bytes，4.57 / 5.80ms。这是 catalog 已载入后的计算；载入成本另存证据，包含 ambiguous 文件名称，不等价于 raw Node coverage。

### 31.7 Broad、渐进分页与排序

真实 broad 查询只刻画成本与受控取消，没有承诺完整 workspace broad 搜索。`1`、`0`、`true`、`null`、FIELD `Value`/`ID`、STRING `的`、FIELD Contains `Avatar`、NUMBER lexeme Contains `1001` 均记录候选、bytes、cached occurrence estimate、首页、取消与重开。取消前达到至少 3,000 provisional 且已有 verified 前缀；终态 cancelled / complete=false，旧 generation cursor 被拒绝。

`1` 有 51,984 candidate sources / 2,278,073,466 bytes / estimated 2,002,211 occurrences；`true` 有 75,168 / 1,270,312,839 / 1,134,406；FIELD `Value` 有 63,110 / 907,437,721 / 1,747,207。其昂贵成本主要是低选择性和 raw 验证工作，不是建议重新持久化百万 Pointer 的理由。所有这些实测取消请求到返回约 5–10ms；dictionary 内取消另测 61.05ms wall（请求后 0.24ms），同步批次内仍需等待当前调用结束。完整 broad occurrence 数在本轮仅是当前 ready revision 的 indexed estimate，不能把受控前缀计数称完整 result count。

结果 spool 绑定 query generation 与 cache generation，页面最多 50 条、preview 最多 256 code points。当前来源只产生 provisional rows；source stat/hash 全通过后在事务内发布 verified prefix。取消、解析错误、变化、最后一次 chunk 后取消均不发布 complete；旧已验证前缀可继续读取且状态明确 cancelled/failed。来源扫描顺序按 catalog source ordinal；页 cursor 使用 result ordinal，稳定范围是这一 query generation。

自有 100 来源、每源 5,000 对 FIELD/VALUE 的 1,000,000 结果实验完成：首个 50 条页面 88.17ms，全解析/发布 6,125.15ms，DB 71,385,088 bytes，WAL 高水位 8,923,952 bytes，内部 checkpoint RSS 113,217,536 bytes。独立完整身份 digest 与 1M 结果一致，尾页 50 条可读取，fixtures/spool 已清理。全局 factKind/source/Pointer BINARY 排序另需 171.44ms，必须等全量物化后才能发布第一排序页，约 6.30s；该排序不是数字自然排序，也不是全库 SLA。推荐先按 source scan order 渐进发布，完整后可选稳定排序；不把整套结果带入 Renderer。

### 31.8 实际空间对照与条件停止

两种 S1 count 变体采用相同转换顺序、schema 和必要反向索引，均核对完整 24,321,212 memberships / 8,828,898 terms 与 quick_check。with count 3,474,595,840 bytes，without count 3,441,852,416 bytes：差 32,743,424 bytes（约 0.94%）。转换包含 global df/occurrence counters；没有 source-local count 时不能发布精确候选 hit estimate。这个同布局 pair 才用于判断 count 成本，不能从 direct S1 与转换后紧凑布局的差值推断 count 占用。建议原型保留 count，因为成本小、能提供当前 ready revision 的成本估计。

同范围对照另构建仅 137,901 ready 来源、8,827,401 可达 terms 的转换库：24,315,534 memberships / 83,513,357 occurrences，main 3475886080 bytes / 3.24 GiB，含 reverse index。与相同 navigable scope 的旧 C 11,712,999,424 bytes 比，实际消除 8237113344 bytes（70.32%）；同范围 raw 为 2616757088 bytes。该转换 wall 68020.24ms 不包含 raw parse，不冒充直接构建。page layout 差异可以超过少量 ambiguous rows 的差值，不能把不同布局库之间的差全部归因于去掉来源。

| 物理候选（均为转换，无 source-local count）| Exact-only main bytes | 加 Contains 字典后的 main bytes | 转换 wall ms | observed collisions |
| --- | ---: | ---: | ---: | ---: |
| typed SHA-256 hash-8 | 931868672 | 2047352832 | 517093.25 | 0 |
| typed SHA-256 hash-16 | 1073938432 | 2189418496 | 533352.61 | 0 |

指纹输入固定为 UTF-8 `JSON([factKind, rawKind, canonicalLiteral])`，截取前 8 或 16 bytes。Exact-only 持久化 files、hash terms、unique membership 与 source reverse index；组合 Contains 再加入单份 canonical dictionary 和 `dictionary_hash(hash_id,id)`，它承担增量 bucket 内 literal 查找/去重的必要索引成本，不省略来美化容量。8-byte 约 0.87 GiB，16-byte 约 1.00 GiB；组合后分别约 1.91 / 2.04 GiB。中间 old-term→hash mapping 已删除并 VACUUM，再测 Exact-only 的完整文件；成本差含移除 duplicate literal、count 和布局压实，不能全归因于 digest 宽度。

两者所有 8,828,898 terms 被转换，memberships 仍为 24,321,212；指定 Exact 与冻结桶查询的 candidate vectors 与 S1 一致。真实数据没有 observed collision 不等于数学上无碰撞。插入碰撞时复用 bucket id，并 union source 集合；8/16-byte 的自有 SQLite 强制碰撞均保留 3 个来源，raw verify 只发布 `/value` 的 2 个 `rare-a` facts，删除一个来源保留另外两个。

这些格式尚未建议采纳：没有 direct-from-raw hash 构建、全量增量与 Contains stale dictionary GC 成本验证，不能把转换 wall 或 0.87 GiB 单独包装成产品总成本。若 Round 3 选择 hash 格式，16-byte 是较保守的候选，仍必须 collision union + raw verification；8-byte 对照只证明可行的容错原则，不成为唯一 truth。当前唯一完整 direct-from-raw 物理基线仍是原始 S1。

S2 未执行：S1 的 dictionary/unique index 占约 80.3%，primary/reverse 的实际 record/page overhead 约 185.2 MB、仅约 5.3% 整库；真实 selective lookup 的重复观测已在毫秒级，packed 路线无法解决主要字典成本、构建稳定性或大来源验证延迟。没有声称测出了 uint32/delta-varint 节省量。S3 未执行：df>1000 的 871 terms 合计 4,936,022 memberships；稠密 bitmap 的纯 bits 理论约 15.0 MB，但仍需 source reverse access、dictionary 和更新协议。高频 workload 的 GB raw scan 支配成本，因此不为这部分继续生成 bitmap 库；该 bits 数只是理论 payload，不是完整 S3 DB 测量。

采样记录：count pair WAL 高水位各约 2.79 GB；hash-8/16 各 646,765,872 / 789,663,952 bytes；同范围转换 WAL 2,794,571,312 bytes。所有是 100ms named-file length sampling 的已观测下界，不将不具名/瞬时 SQLite temp 或 VACUUM 临时文件称为 0。hash IPC RSS checkpoint 最大 153,677,824 bytes，单次 live probe 在 8-byte 阶段报告 Windows peak WorkingSet 195,284,992 bytes；不是完整连续采样，也不是后续阶段最终峰值。count/同范围 SQL 阶段没有 RSS checkpoint，不能报告其真实峰值。完整对象 bytes/payload/unused、各阶段实际 DB/WAL/staging、logical term payload 和 sampling 限制进入机器证据。

### 31.9 生命周期、重开与最终 revision 检查

自有 fixtures 已验证新增、单事务替换、删除、取消保留旧 ready generation、来源验证后发布、发布前已知 `process.exit(23)`、重开、orphan dictionary 保留及 lazy GC。受控 JS 退出不算原生异常；子进程确实 close，旧完整 membership 集合与 generation 不变。删除/GC 与碰撞 bucket 删除均检查实际 SQLite rows；所有 fixture 与小型 DB 已即时清理。这验证发布不变量，不等价于全量增量生产实现或 cache reopen SLA。

benchmark 后收尾检查发现来源已发布之后、查询完成之前变化的检查缺口。已在调查 resolver 增加完成前所有候选 stat 检查及调用方 cache generation guard；四个新 fixture 证明晚变化、零候选的 generation change、发布后 generation change 均不能 complete，未变化来源可完成候选范围。相关 7 个旧语义、3 个 spool 和 21 个 canonical fixture 又针对最终代码通过；canonical oracle 改为独立 code-point atoms 比较，不共享 matching helper。

**第 31.5–31.7 的旧 benchmark 计时不包含新增的最终 stat/generation 检查。** 当时输入在各 source parse 及收尾全库 metadata/代表指纹审计中未变化，完整 result identity 证据仍有效；保存了当时 resolver 的源码与 SHA。新检查只增加正确性防线，额外阶段延迟未重跑全库量化，不伪造为已计入旧 fullMs。正式 cache 必须在新增/删除/外部 source revision 变化时推进 coverage generation，页面/NodeAddress 绑定该 revision；本实验默认静态 generation 并未实现生产 watcher 或全 workspace snapshot。

### 31.10 执行通道 native stop：不能以计划代替测量

准备了同 Utility 独立 Search scheduler、Worker Thread、独立 Search Utility 的固定 JS/native blocking 与 cancellation-ack probes，以及有隔离效果时的四类 Search × 六种 Browser 操作。真实 Browser harness 复用已有 RawDataService bundle 和现有 parser/metadata queues，原计划会分别记录 RPC wall、queue、execution、错误与 event-loop delay；concurrency=1，不计划无证据增加到 2。

实际启动 Electron 后 **在 ready/测量之前原生退出 `2147483651 / 0x80000003`**。唯一日志为 `FATAL electron/shell/browser/win/install_dir_access.cc:52`，明确说明安装目录有 AppContainer package SID ACL，但缺少 ALL APPLICATION PACKAGES read ACL，sandbox token 不能读取 `RefAtlas/node_modules/electron/dist`。launcher 子进程 close，外层 stage exit 1、wall 506.74ms；不是 Browser/查询时序成绩。没有任何三通道 probe、cancellation-ack 或 4×6 Browser matrix 结果，不能断言独立 Utility 已保护 Browser。

此后立即停止所有新增实验。没有改 ACL、禁用 sandbox、换 Node/Electron/SQLite 版本、JIT flag、批次、native dump 配置或运行替代 lane。现有 Application Event Log 与 WER 的有界只读检查没有匹配条目，不能据此否定日志中的 fatal。两个原生异常的位置/退出码明显不同：首次是在 Node S1 22,356 ordinal 附近的 `0xC0000409`；本次是 Electron startup 的有明确 ACL 诊断 `0x80000003`。后者不解释前者；首次根因仍 UNKNOWN。

当前状态为 **BLOCKED BY NATIVE STABILITY / NO / REQUIRES ROUND 3 / AWAITING REVIEW**。S1 Attempt #2 本身仍是 PASS，不伪造成第二次 S1 crash；也不因已有 query/空间结果而绕过新 native stop。后续分别需要独立 Native Crash Investigation 与获授权的 Electron sandbox 启动环境处理，再恢复 lane gate；本轮不执行这些专项。

### 31.11 当前 A–O 答案、架构与产品建议

下表覆盖第 28 节的历史未测答案，作为本次 controlled retry review 的当前结论。

| 问题 | 本次证据答案 |
| --- | --- |
| A memberships vs occurrences | raw 24,321,212 / 83,533,059（3.43×）；navigable 24,315,534 / 83,513,357 |
| B no-Pointer disk | direct S1 3,494,031,360 bytes，含 n/reverse；转换无 n 3,441,852,416；8/16 hash Exact-only 0.87/1.00 GiB，组合 Contains 1.91/2.04 GiB |
| C old C 消除多少 | 同 navigable 范围实际转换 S1 消除 8,237,113,344 bytes / 70.32%；不据此单独宣告架构成功 |
| D typical ID 成本 | df 桶与三个固定 ID 实际 source/bytes/first/full 见 31.5；罕见长数 3 sources / 286 KB / verified 9.93ms / full 51.85ms；大单源仍昂贵 |
| E internal-name Contains | Monster 956 terms / 421 sources / 26.3 MB，canonical dictionary 2,915.99ms、verified first 2,983.29ms、full 5,252.21ms；原 JS 字典 10.15s |
| F common 慢的原因 | `1`/`true`/`Value` 的候选约 0.91–2.28 GB / 百万 estimated occurrences；自然低选择性，受控取消与进度可观察；未称已完成整个 broad workspace query |
| G relational 足够？ | 功能与 snapshot correctness 的完整 S1 证据支持它作为基线；30.8min build、dictionary 成本和 unresolved native/未测 lane 阻止现在采纳 |
| H packed 是否值得 | 未测；S1 主要是 dictionary，优先级不支持进一步大型 S2，不能宣称 packed 获得实际收益 |
| I hash 更好？ | 空间转换显著更小，但组合 Contains 与增量/直接构建仍待证明；不采纳，仅作 Round 3 候选 |
| J false positive 保正确？ | S1 全量独立 membership proof + identity truth；SQLite 8/16 强制 collision union + raw verify 符合 no-false-negative 原则 |
| K Pointer recovery 替代持久化？ | selective Exact/Contains 实际恢复与独立 identity 一致，可以在本 snapshot 上替代；大来源验证成本必须反馈 |
| L separate lane 保护 Browser？ | **未验证**：Electron ready 前 native ACL fatal；三通道及 4×6 竞争均未运行，不能借用旧 occurrence lane 数字回答 |
| M 渐进、有界、不全量 UI？ | verified source prefix / generation cursor / page≤50 / preview≤256；自有 1M spool 首页 88ms，结果落盘、UI 有界；不是全库 broad SLA |
| N V1 默认模式 | **Exact**；显式 Contains，不猜 ID 类型、不自动 NFC/casefold/numeric normalize、不隐式降级 substring |
| O 可以接受架构？ | **NO / REQUIRES ROUND 3**，候选假设未被否定，execution isolation 与稳定性接受门槛未关闭 |

建议的物理基线是 files + typed terms + unique `(term,source)` + source reverse index，不持久化 Pointer/range/order；S1 的 n 列可保留为 generation-bound 成本估计。查询按 typed literal 找候选、再 raw verify/Pointer recover、源验证后发布 NodeAddress；FIELD 返回关联 value 地址/rawType，FILE 走独立 catalog。Contains 采用有界 canonical dictionary scan，decoded literal 校验后展开 postings，NUMBER 只查原始 lexeme，不引入关系推断。

未来产品在 raw scan 前显示 mode/scope、candidate source count、bytes、optional indexed hit estimate 和覆盖状态；Contains 字典阶段先显示 progress，不在 candidate 尚未计算完时假造成本。宽查询允许观察进度、获取已验证页面和取消，避免硬编码任意 GB/SLA reject 阈值。默认 source scan order，完整后可选全局稳定排序；统一 generation/revision 管理防止旧 spool/cache 复用。执行通道暂建议独立 Search Utility 作为需要验证的候选：Worker 共进程失效域、同线程 scheduler 无法隔离同步调用都是设计风险，**本轮尚未实测三者差异**。

下一生产工作只建议另行授权的 FEFF 语义修复；Search Foundation 必须等 native/启动环境与 lane gate、coverage generation/cache reopen/增量成本 review 关闭。若 Round 3 选择 compact hash+dictionary，应先补齐推荐格式的 direct-from-raw 完整构建、碰撞下生命周期与字典 GC、真实 lane 竞争；不能用转换当直接构建，也不能自动执行第三次同一 S1 retry。没有新增 accepted ADR。

### 31.12 失败历史、清理与交付验收

除两次明确区分的 native 事件，空间工具首次因同连接 active iterator/transaction 产生可复现 JS busy exception，exit 1；with/without count pair 已完成，hash 未完成，失败终态保留。另一次 hash 进程在发现字典段仍加载旧 iterator 代码后主动停止（Windows kill exit 0xFFFFFFFF），属于已记录的 investigator intervention，不称 unexplained native crash。修复 readonly source/write target 隔离后仅执行未完成 hash 对照；没有重跑 S1、没有自动重启或将失败 stage 改成成功。最终 closeout 的首次 helper 因所有 PID 已退出时 PowerShell 返回 1 发生 audit false failure，清理尚未启动；修正 empty-result exit handling 后审计通过，不是新增实验或 native workaround。

终态只读 S1 quick_check=ok；137,901 ready / 15 ambiguous / 0 failed/building，24,321,212 memberships、8,828,898 terms、83,533,059 raw occurrences 与原验收一致。清理前重新核对 137,916 全库 metadata，与保存清单逐项相同；来源代表 SHA/stamp、外部 HEAD/status、scanner 和 builder/lib/common/package 指纹亦一致。清理后再次核对代表来源与外部状态。已关闭已知全部 DB handles，监督器 close/exit 记录、已知 spawned PID 与该 Electron launch 时间窗的进程审计均无存活 owned child；通用 Win32_Process CIM 被环境拒绝，采用可读的 Get-Process 与已记录 PID，不把它称无范围限制的全系统进程审计。

本次最终逐文件清理 4041930695 bytes（约 3.76 GiB），含 S1、两种 staging 和大型 census/inventory；转换 DB 与 fixture/spool 在各阶段先清理，详细命名文件记录进入证据。保留两次小型日志、checkpoints、完整终态 compact JSON、工具源码/指纹和清理记录；所有产物在 ignored `tools/investigation/artifacts/search-round2/`。production src、RawBridge/Preload/public IPC/UI、全部 package/lockfile、外部来源未改；无 commit/push/PR、无 production build。

最终语法、相关 fixture、format:check、文档链接、diff 与来源/清理审计结果写入 [Controlled retry evidence](evidence/phase-2-search-candidate-source-controlled-retry.json)。本轮交付后停止等待 review，不进入 Search Foundation。
