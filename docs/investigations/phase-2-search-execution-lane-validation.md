# Phase 2 Search Round 2 Closeout：Electron ACL 与执行通道验收

日期：2026-10-05（UTC+8）。基线：`735a2633a1065970f136f125e68fd9054eb2df7d`。这是 Windows x64 调查证据和待审建议，不是 accepted architecture。

## 1. 结论

**Execution-lane gate：VALIDATED，限定本报告的 Windows 私有原型范围。Search architecture：sufficiently supported for review，等待评审。** 推荐独立 Search Utility，Search 并发 1；同线程独立 scheduler 不足，Worker 能隔离事件循环但仍共享 native 进程失效域。

真实 sandboxed RefAtlas built smoke 通过；16 个竞争场景共 192 个独立 Browser RPC 均成功，四次协作取消、两次受控 JS 退出及临时 DB 恢复通过。没有新的 unexplained native crash。没有重建全库 S1 或重跑架构基准。

启动恢复有一个明确限制：磁盘 ACL 增加标准 RX 后，CodexSandboxOffline 受限身份仍出现同一 fatal；正常用户身份下 Electron 和真实 sandbox smoke 成功。因此本报告不宣称仅一次 DACL grant 已解决所有执行身份，也不声称确认了 Codex bug。

机器证据见 [紧凑 JSON](evidence/phase-2-search-execution-lane-measurements.json)。既有 [Candidate-Source 报告](phase-2-search-candidate-source-index-investigation.md)及两次 S1 历史保持有效。

## 2. 范围与边界

仅恢复项目内 Electron 安装目录读取权限，验证 Search 执行隔离、取消、ownership 和故障范围。未修改 production src、RawBridge、Preload、public IPC、UI、正式进程拓扑、所有 package/lockfile；没有 FEFF 修复、accepted ADR、commit 或 remote mutation。

未运行 full S1、membership census、ID/Contains/broad 基准套件、hash 转换、S2/S3、FTS/trigram 或 occurrence index。真实 BrowserWindow smoke 与私有 Utility 竞争是分开的验收，后者不代表生产 Search UI/IPC 或帧率。

## 3. 仓库与环境基线

RefAtlas 初始工作树干净，外部 HEAD `724b139d8c9c32d12552eb95745a4fee72bfe48b`，初始/终态 status 均干净。Windows `10.0.26300.0` x64，Node 24.21.0，Electron 44.5.1，better-sqlite3 13.0.3；实际 Electron Utility/Worker 执行原生 SQLite 并验证结果、事务与重开。

启动磁盘约 238.9 GiB 可用，保留 30 GiB 余量，预计本轮 3 GiB。来源 manifest 只冻结代表来源、旧查询 examples 和 hash，不做全库 census。Git 使用单次 `safe.directory` 参数，没有修改全局配置。

## 4. 复用的 Round 2 证据

唯一 S1 Attempt #2 已完整处理 137,916 来源，137,901 ready、15 ambiguous，24,321,212 memberships，83,533,059 raw occurrences，direct S1 约 3.25 GiB。完整独立 membership 校验、冻结 Exact/Contains identity、空间转换、生命周期和有界 spool 证据仍有效。

本轮没有据通道负载改写这些容量、查询、Pointer 或 coverage 结论。compact hash 仍只是转换证据；若未来选择它，需要另行补齐 direct-from-raw 验证。本次推荐完整 typed literal S1 基线，可以继续评审而无需机械新增全库 Round 3。

## 5. 原 ACL failure 的单次复现

原 `search2-lanes.mjs`、入口、参数及安全设置不改，执行前备份它会覆盖的小型文件，结束后恢复原字节。2026-10-05 04:23:35 UTC，Electron PID 49480 退出 `2147483651 / 0x80000003`；日志再次出现 `install_dir_access.cc:52`，明确要求 `S-1-15-2-1:(OI)(CI)(RX)`。

没有进入 Search workload。原入口固定路径产生的恢复期临时产物单独审计/清理，原历史日志和 compact evidence 保留。

## 6. ACL 检查

用原生 Get-Acl、SID 形式的 GetAccessRules 和 icacls 检查 repo、node_modules、electron、dist、exe 及必要父链。项目路径 owner 为正常用户，继承开启，无 Deny；dist 初始缺少 `S-1-15-2-1` 和 `S-1-15-2-2`。

可见项目链存在 CodexSandboxUsers 和其他未映射账户 SID 的继承 Modify，以及既有用户/SYSTEM/admin FullControl。没有删除或归一化这些 ACE。机器特定完整 SDDL 和可恢复 backup 存在 ignored artifacts，compact JSON 保留本轮关键差异。

## 7. 继承与根因界限

dist 的缺失来自所见父链未提供标准 package RX，继承本身没有关闭。可读链上的 repo、项目父目录、Projects、Documents 都缺少该标准 grant；用户 profile ACL 在受限身份下不可读，记录为 unknown，不能确定最早丢失位置或证明是哪次操作造成。

Electron 的 fatal 是实际安装目录有效读取检查失败；它的文案不能替代完整 token 分析。新增 package ACE 后，受限身份依然 fatal，正常用户身份成功，说明执行 token/身份边界也影响结果。未做正常用户修复前的反事实启动，不能把恢复完全归因于单独 grant。未修改广泛父目录，也没有确认 Codex ACL 缺陷。

## 8. 最小恢复与备份

先保存 dist 全部 76 个对象的 SDDL 和 UTF-16 icacls backup `electron-dist.acl`，记录 restore base 为 `node_modules/electron`。恢复形式为 `icacls <restoreBase> /restore <backup>`；本轮未执行恢复写操作。

唯一成功 mutation：

```powershell
icacls.exe '<RefAtlas>/node_modules/electron/dist' /grant '*S-1-15-2-1:(OI)(CI)(RX)'
```

受限身份第一次 grant 返回 Access denied、没有改变 DACL；经授权的正常用户执行返回 exit 0。全 subtree 审计通过：root 为显式 package RX、子项继承 RX，owner、继承保护和其他 ACE 保持原样。没有增加 restricted package SID，也没有授予 Write/Modify/FullControl。

标准 RX 保留。父链未被修复，依赖重新安装可能再次缺少局部 grant；受限执行身份限制仍在，不宣称永久环境修复。

## 9. 安全边界验证

真实 smoke 报告确认 `sandbox=true`、`contextIsolation=true`、`nodeIntegration=false`，console errors 为空。没有 `--no-sandbox`、disable-gpu 或任何关闭应用 sandbox 的措施。

`require_escalated` 用于正常用户执行身份；它没有改变 RefAtlas 的 BrowserWindow 安全配置。Main 仍只编排，数据处理和 SQLite 没有移入 Main/Renderer。

## 10. Sandbox 恢复与普通 smoke

局部 grant 后，受限身份的 built smoke 仍在启动前出现原 ACL fatal，保留为失败。正常用户运行同一原 harness 已越过 Main/两个 Utility ready，并完成固定探针，随后因历史 `baseline.json` 已清理发生预期 ENOENT；这个 exit 1 不是 Search 或 sandbox 成功终态。

已有 out 早于当前源码时间，因而做本轮一次成功 production build。受限身份构建在 esbuild 读取父目录时失败，未完成编译；切换正常用户后 build 成功。普通 built smoke exit 0，约 36.7 秒，实际 Source Browser 和安全断言通过；没有 full foundation、real-data 或 packaged runner。

## 11. 三个候选通道

| 候选 | 执行位置 | 实测结果 |
| --- | --- | --- |
| A | Raw Utility 同线程，独立 Search promise scheduler | 同步 JS/SQL 仍阻塞 Browser 和取消处理；淘汰 |
| B | Raw Utility 内单个 Worker | 事件循环隔离有效；完整矩阵与取消通过 |
| C | 独立 Search Utility | 事件循环隔离有效；完整矩阵、取消和进程级 JS failure containment 通过 |

三者都使用 Search 自有 connection，消息只传普通有界数据，concurrency=1。RawDataService 从当前 production TS 编译到 ignored 调查 bundle，生产文件没有改变；包版本与现有依赖相同。

## 12. 固定阻塞探针

JS 固定约 300 ms；native probe 使用递归 SQLite `sum(1..500000)`，结果必须为 `125000250000`。Main 在 Search started 后约 40 ms 发出取消及六个独立 Browser RPC。

初次 histogram 在首个 tick 前就遇到阻塞，低报 A 的 event-loop delay。保留原输出；仅给 histogram 30 ms 建立 tick 后补跑六个固定探针，没有重跑矩阵。下表使用修正探针：

| 通道 | JS 下 info RPC | JS event-loop max | SQL 下 info RPC | SQL event-loop max |
| --- | ---: | ---: | ---: | ---: |
| A | 259.58 ms | 301.47 ms | 84.08 ms | 126.62 ms |
| B | 4.46 ms | 15.71 ms | 4.16 ms | 15.79 ms |
| C | 4.44 ms | 16.17 ms | 4.30 ms | 15.86 ms |

A 的延迟主要发生在 Utility 处理 RPC 之前，不能只看已经进入 RawScheduler 后的 queue。B/C 消除了这个 Search 同步调用导致的延迟。

## 13. 取消

固定 JS 探针的 Search 线程 ACK 约 255 ms；SQLite ACK 约 79–85 ms。B 的 Browser 线程可先转发取消，但 Worker ACK 同样要等同步调用返回；C 也不能中断正在执行的同步 SQL。协议明确没有 interruption claim。

真实 build/broad 取消中，B 的 ACK 约 0–6 ms、资源释放约 17–18 ms；C 的 ACK 为毫秒级、释放约 12–41 ms。跨进程 Date.now 有一条 −1 ms 观察，属于约 1 ms 时钟/量化误差，不解释成负耗时，也不建立精确取消 SLA。

四次取消均返回 complete=false，DB quick_check=ok，publication/spool 未发布 complete/ready，handles 已释放；取消后 Browser 六操作成功。没有依赖强制 terminate 完成这些取消，因此未运行替代的 forced-termination 路线。未来 production 仍需约束每个不可中断 SQL 批次，包括发布阶段。

## 14. Browser-under-Search 矩阵

两个有希望的通道 × 四负载 × 首轮/重复轮 × 两组六操作，共 16 个场景、192 个独立 RPC；每组提交均与 Search active 时间相交，错误为 0。

Build-like 使用 AvatarConfig、TextMapCHS、SpecialAvatarRelicMainValue，共 106,282,775 raw bytes、3,083,019 facts、904,983 source memberships；SQLite 先 staging，来源验证后最终发布，不建全库 dictionary/reverse schema。B 两轮约 112.9/117.5 秒，C 98.8/81.4 秒，属于私有负载，不是 S1 build benchmark。

Exact 冻结旧证据的三个来源，每次 3 hits；Contains 使用旧 examples 去重后的三个来源，每次 17 hits。两者串行重复约 5 秒，iterations/count/digest 一致。Broad `VALUE Exact 1` 扫描上述三个代表来源，185 hits，每轮约 10–11 秒；这是大扫描执行压力，不能代表全库 broad coverage 或大量 spool rows 的新验收。

矩阵的缓存内 Browser RPC（每项每通道 n=16）：

| 操作 | B p50 / max ms | C p50 / max ms |
| --- | ---: | ---: |
| listDirectory | 366.38 / 439.68 | 333.10 / 376.13 |
| getSourceInfo | 4.93 / 7.19 | 4.31 / 6.25 |
| readNode | 7.91 / 13.67 | 6.96 / 9.13 |
| listNodeChildren | 14.38 / 21.31 | 12.99 / 15.66 |
| readScalarSegment | 19.34 / 27.41 | 17.02 / 20.25 |
| source activation | 22.50 / 30.63 | 19.95 / 23.71 |

directory 的百毫秒主要是自身 execution；其他操作未出现 Search 导致的多秒 head-of-line blocking。首次无 Search 基线的 segment 和 activation 有秒级首次 range/完整校验及 Raw parser 排队，单独保留，不能纳入缓存内表或归因于 Search。

## 15. 故障范围与恢复

在 build 首个已提交批次后调用已知 `process.exit(23)`，没有制造 native crash。B 的 Worker 退出后 Raw Utility 六操作仍成功，并显式启动新 Worker；C 的 Search Utility 退出后 Raw Utility 同样存活，并显式启动新 Search Utility。没有自动 replay。

Worker 的退出 DB 当场 quick_check=ok、state=staging 后清理。原 harness 在 Utility exit 后读取 `.pid` 得到 undefined，漏过其 DB；独立终态审计用 ready 记录的 PID 43184 完成重开、quick_check=ok、staging 未发布和清理。原 run JSON 保留，补记独立存在；工具已改为在 ready 时缓存 PID。

Worker JS failure containment 不能证明 native isolation：native 崩溃仍可能杀死整个 Raw Utility。C 有独立 OS 进程失效域；本次只实测已知 JS 退出，没有故意 native crash。

## 16. Worker SQLite ownership

Worker 自己 import better-sqlite3、创建 schema/statement、扫描、写入、close；threadId 在 started 中记录。Main 和 Browser 的普通消息中没有 connection、statement 或 native pointer。原生探针、两次真实 fixture build、spool、取消和重开均成功。

资源观察包括 Raw+Worker 共享进程，不能把该 working set 当成纯 Search Worker RSS。原型没有证明 macOS/native package 或 production Worker bundling。

## 17. Dedicated Utility ownership

Search connection 与 parser 完全位于 Search Utility；Main 仅监督和计时。Raw Utility 生命周期和 Search ready/exit 分离。known-exit 后 Raw source registrations/ranges 和交互请求继续有效；Search 显式重启不重放旧请求。

生产若采纳，需要另行实现代次绑定、工作区/revision 失效与有界内部协议；本轮没有扩展 public IPC。

## 18. 通道比较

| 维度 | A | B | C |
| --- | --- | --- | --- |
| Browser 隔离 | 不足 | 通过当前矩阵 | 通过当前矩阵 |
| 同步 SQL 取消 | 返回后处理 | 返回后由 Worker 处理 | 返回后由 Search Utility 处理 |
| 协作取消 | 固定探针显示阻塞 | 通过 | 通过 |
| native failure domain | 与 Raw 相同 | 与 Raw 相同 | OS 进程分离 |
| SQLite ownership | 可独立，但同线程 | Worker-local 验证通过 | Process-local 验证通过 |
| 实现/打包成本 | 较低但不能满足隔离 | Worker entry/native 打包需验证 | 增加 Utility 生命周期与消息边界 |

C 本轮负载耗时较低，但执行顺序、OS cache、CPU/磁盘竞争未控制，不据此做性能排名。C 的推荐理由主要是隔离和恢复边界，而非数十秒 build 差异。B/C 都没有硬实时取消正在执行的 native 调用。

## 19. 推荐执行拓扑

建议 `Main → interactive Raw Utility + Search Utility`，概念 owner 仍为 Data Service/Search 数据层。默认 Search concurrency=1，独立连接、批次与 spool，不共享 native handles。

同线程 scheduler 不作为同步 SQLite/重型 CPU Search 的默认通道。Worker 可以作为较低进程成本的替代候选，但应明确 Raw/native 共享失效风险；当前证据更支持独立 Search Utility。

## 20. 剩余 native 与平台风险

历史 S1 Attempt #1 的 `0xC0000409` 根因仍未知，Attempt #2 全量通过；本轮没有 Attempt #3、版本矩阵或 JIT flag。原 ACL fatal 被正常用户启动路径绕过执行身份限制并验证实际应用 sandbox，没有新 unexplained native crash。

Windows 原型不能替代 macOS arm64、ASAR/native addon、Worker/Utility packaging 和完整生产压力验收。250 ms Electron metrics 与 100 ms 文件采样可能遗漏瞬时峰值；同时保存 OS peak working set。本次 Raw+Worker 最大采样 working set 约 195.1 MiB、OS peak 198.7 MiB，原 Search Utility 约 144.4/144.4 MiB，没有达到 2 GiB 调查 guard。

## 21. FEFF 与正确性前置条件

生产 U+FEFF tokenizer fidelity bug 没有修复，仍是 Search Foundation 前置条件。调查 scanner 指纹未变。小 fixture 补验不安全整数 lexeme/Pointer、调查 FEFF literal、chunk 取消、发布后来源改变和零候选 generation 改变；均不能把失败标成 complete。

15 个重复键来源继续 ambiguous/partial，未改变现有 Pointer 契约。本轮没有发现与既有 membership/query identity 证据矛盾的问题。

## 22. 架构是否可以关闭：A–Q

| 问题 | 答案 |
| --- | --- |
| A 启动失败原因 | Electron 安装目录有效读取检查 fatal；缺失标准 package RX 已证实，受限执行身份另有未解析影响 |
| B 哪个路径 | 直接 fatal 目标为 `node_modules/electron/dist`；最早祖先缺失位置未知 |
| C inherited / explicit | 原项目 DACL 为继承，缺失 grant；新增 dist root 显式 RX、子项继承；不是继承开关故障 |
| D 精确变化 | 仅增加 `S-1-15-2-1:(OI)(CI)(RX)`，其余 ACE 不动 |
| E sandbox 保留？ | YES，真实 BrowserWindow 三项安全断言通过 |
| F 普通启动恢复？ | YES，正常用户 built smoke；受限身份仍失败，限制保留 |
| G scheduler-only 保护？ | NO，同步 JS/native 阻塞实测 |
| H Worker 保护？ | YES，当前事件循环/矩阵范围；native 失效域仍共享 |
| I 独立 Utility 保护？ | YES，当前矩阵、取消和已知 JS 退出范围 |
| J 最佳取消 | B/C 协作取消均通过，不能宣称 native 可中断；C 提供更清晰的进程终止候选边界，未接受生产 terminate 默认行为 |
| K 最佳故障隔离 | C；native containment 为进程边界推论，未制造 native crash |
| L better-sqlite3 可用？ | YES，B/C 的 local ownership、事务、重开、quick_check 实测通过 |
| M Browser 延迟可接受？ | YES，当前缓存内竞争范围无 Search 多秒阻塞；directory 百毫秒、首次 Raw 校验秒级保留 |
| N 需要另一轮完整调查？ | 当前 literal S1 基线不需要机械全库 Round 3；compact hash 采纳或新矛盾需专项证据 |
| O execution gate 可关？ | YES，限定本次 Windows prototype；平台/生产 integration 留给实施验收 |
| P architecture 可关？ | sufficiently supported for review；最终接受等待用户评审，无 accepted ADR |
| Q Foundation 前还需什么？ | 评审候选与代次/coverage/增量边界；独立授权 FEFF 修复；随后明确授权 Foundation，实现并做平台/打包验收 |

## 23. 下一步

提交本报告供 review，保留 files＋完整 typed terms＋unique term-source＋reverse index 的 S1 建议、Exact 默认、显式 Contains、独立 FILE catalog、raw verification/Pointer recovery、有界 generation-bound spool 与 source scan order。无需为本轮重新讨论这些已验证物理架构事实。

先等待架构与生命周期边界评审，再另行授权 FEFF 修复和 Search Foundation。调查成功不等于已接受 schema、执行拓扑或生产 Search。

## 24. 清理、可复现性与验收

工具为 `search2-closeout*.mjs/.cjs/.ps1`，运行顺序：baseline → 原入口 reproduce → ACL inspect/backup/grant/audit → 正常用户 recovery → build/built smoke → lanes → failure-recovery addendum → corrected probes → boundaries/audit/export。昂贵阶段无自动 retry；正常用户权限恢复只限必要动作，失败日志保留。

原 matrix 的 Main/Utility 源码版本另存 ignored snapshots，指纹进入 evidence；后续 monitor warmup/PID 修正不冒充已经测过的 matrix 版本。原输出、补记、成功/失败 manifest 各自保存。

所有 DB handles 正常关闭或由已知退出终止，临时 DB 重开审计后逐个删除；profiles/自有 smoke fixtures 共清理 11,948,483 bytes，ACL backup、小型日志和证据保留。固定入口恢复期创建的旧位置 profile 创建时间晚于本轮 baseline，按自有产物清理。稳态工作 DB 的 100ms 采样 main 高水位 162,086,912 bytes，单 WAL 高水位见 JSON 命名文件记录；不把采样峰值当完整 I/O 总量。最终正常用户只读 CIM 审计确认 owned Electron/Node/Search processes 为 0，外部 HEAD/status/代表 hash、production src、所有 package/lockfile、调查 scanner 和两次旧 compact evidence 均未变。最终 dist subtree 再审计，没有给 package principals 写权限。

语法、调查边界 fixtures、format:check、文档链接、diff 与清理结果进入 evidence。交付后 STOP / WAIT FOR REVIEW。
