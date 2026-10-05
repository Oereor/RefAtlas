# Phase 2 Search Round 2：Candidate-Source 索引调查

日期：2026-10-05（UTC+8）。状态：**STOPPED / REQUIRES ROUND 3 / AWAITING REVIEW**。

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
