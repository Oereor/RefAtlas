# 性能政策与 Phase 0 / Phase 1A 基线

更新日期：2026-10-05（UTC+8）。本文件拥有性能口径与基线；结构及技术取舍见 [调查报告](investigations/phase-0-feasibility.md)。Phase 0 数字来自 [环境与样本证据](investigations/evidence/phase-0-measurements.json) 和 [全部运行结果](investigations/evidence/phase-0-benchmarks.json)，新增 production raw-access 观察见第 7 节。

## 1. 环境与口径

2026-10-05 Round 2 Closeout：正常用户身份下的真实 sandboxed built smoke 与私有 execution gate 通过，未重跑全库 Search 基准。修正 monitor 首 tick 漏采样后的 300ms JS 探针，same-thread/Worker/dedicated Utility 的 info RPC 分别 259.58/4.46/4.44ms，interactive event-loop max 301.47/15.71/16.17ms。Worker/独立 Utility 的 16 场景、192 独立 Browser RPC 错误为 0；缓存内 readNode p50/max 为 7.91/13.67ms 与 6.96/9.13ms，directory 为自身 execution 的百毫秒级。首次 Raw 校验/queue 秒级成本、执行顺序/OS cache、250ms working-set 与 100ms 文件峰值遗漏、取消跨进程时间戳误差分别保留；不建立 SLA 或跨平台排名。局部标准 package RX 保留，受限执行身份启动仍失败。见[本轮报告](investigations/phase-2-search-execution-lane-validation.md)与[证据](investigations/evidence/phase-2-search-execution-lane-measurements.json)。以下 Controlled Retry/首次失败数字保留原阶段口径，非本次 closeout 未关闭状态。

2026-10-05 Controlled Retry #2：完整 direct S1 137,916 来源、24,321,212 memberships / 83,533,059 occurrences，main 3,494,031,360 bytes（含 count/reverse），builder wall 1,848,148.72ms。独立 membership proof 与冻结查询 identity 通过；稀有长数 3 sources / 285,902 bytes / verified first 9.93ms / full 51.85ms，`1001` 1,348 sources / 290,074,411 bytes / full 20.65s；canonical Contains Monster lookup 2.97s / full 5.25s。这些计时在完成前 stat/generation guard 新增之前，额外延迟未量化；输入审计未变化，不声称冷读/SLA。8/16-byte hash Exact-only 转换为 931,868,672 / 1,073,938,432 bytes，加 Contains 必要字典/索引后为 2,047,352,832 / 2,189,418,496 bytes；转换不是 direct build。Electron lane ready 前发生 ACL native fatal `0x80000003`，没有本轮 Browser under Search 成绩；首次 Node native 根因仍未知。详情见 [Controlled Retry Review](investigations/phase-2-search-candidate-source-index-investigation.md)与[证据](investigations/evidence/phase-2-search-candidate-source-controlled-retry.json)，production 未改。

2026-10-05 Search Round 2 首次交付历史观察：三个明确选择的真实来源（AvatarConfig、SpecialAvatarRelicMainValue、TextMapCHS）合计 106,282,775 raw bytes、3,083,019 occurrences，直接构建得到 904,983 term-source memberships，main DB 206,512,128 bytes（含反向索引），build wall 23,435.90ms。它是一次非代表性预检，不能外推全库容量/延迟。随后全库 S1 在 127,122.29ms 后原生退出 `0xC0000409`；部分库有 22,355 ready 来源、1,422,473 memberships，未完成 reverse index/census。按停止条件未继续真实 query/lane 或 hash/packed 对照，**没有新增完整 Search 性能基线**。失败与 WAL/staging、sampling 局限见 [Round 2 报告](investigations/phase-2-search-candidate-source-index-investigation.md)，机器证据见 [measurements](investigations/evidence/phase-2-search-candidate-source-measurements.json)。生产性能行为未改。

- Windows 10.0.26300 x64，Intel(R) Core(TM) i9-14900HX，32 逻辑 CPU，总内存 31.64 GiB，扫描时可用 12.93 GiB。
- Node 24.21.0、npm 11.16.0、stream-json 3.7.0、better-sqlite3 13.0.3；两驱动 SQLite 均为 3.53.4。Electron 44.5.1 utilityProcess 另行验证 Node 24.21.0；系统 Node 成绩不是 Electron 性能。
- 输入提交 724b139d8c9c32d12552eb95745a4fee72bfe48b。本机 C: 的逻辑文件长度，非簇占用；物理 SSD 型号、接口、温度和后台负载未核实。
- 每项 3 次，表格为中位数，没有置信区间。未清空 OS 缓存，不声称冷扫描/冷读或跨机普适。总时间按每次读取+解析后取中位数，未必等于两列中位数之和。
- 计时不含子进程启动/模块加载；SQLite 插入不含源解析/建表。内存为 resourceUsage.maxRSS 的进程高水位（KiB 转 MiB），含运行时/模块，不是对象体积。约 100 ms RSS 采样可能漏峰；另留 heap 检查点。
- [复现工具](../tools/investigation/README.md)：串行隔离，120 秒超时、1 GiB heap、2 GiB RSS 停止阈值、启动前至少 3 GiB 可用内存。这些是实验保护，不是产品预算。

## 2. 扫描与解析

递归发现+stat 三次：2564.80 / 2699.62 / 2736.58 ms，中位数 **2699.62 ms**。计时包含 .git 遍历，汇总排除 .git；非最终产品扫描策略。

| 输入（相对 TurnBasedGameData） | MiB | 读取 ms | JSON.parse ms | 总时间 ms | 解析 RSS MiB | 流式 ms | 流式 RSS MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ExcelOutput/MonsterConfig.json | 4.32 | 3.30 | 12.50 | 15.80 | 54.62 | 107.67 | 65.27 |
| ExcelOutput/AvatarSkillConfig.json | 10.91 | 7.60 | 33.16 | 40.86 | 73.48 | 184.38 | 60.86 |
| ExcelOutput/StageConfig.json | 25.69 | 16.19 | 56.01 | 71.58 | 101.00 | 364.62 | 62.09 |
| ExcelOutput/SpecialAvatarRelicMainValue.json | 51.16 | 29.47 | 156.18 | 186.83 | 152.70 | 617.38 | 63.03 |
| TextMap/TextMapCHS.json | 49.97 | 145.69 | 224.26 | 369.29 | 227.89 | 310.60 | 62.95 |
| TextMap/TextMapVI.json | 70.20 | 304.88 | 289.37 | 596.90 | 337.20 | 421.59 | 61.20 |

完整解析会舍入整数，只是性能基线。流式实验完整遍历 token、计数、检测整数，不物化全部记录，非等工作量排名。TextMapVI 流式中位吞吐 166.51 MiB/s；packed scalar 仍聚合单个值，不能保证任意长字符串恒定内存。

## 3. SQLite 代表性索引

TextMapCHS 原顺序前 50000 项，非随机样本、非全量索引。records 为文本 ID/字段/原文，索引 ID、field/id、text/id；FTS5 unicode61；50000 条循环合成边。DELETE 日志、synchronous=NORMAL、单事务，两驱动完全相同。因为样本全部 field=text，字段查询只证明已有索引路径，不代表异构字段名全局搜索。

| 驱动 | 插入 ms | 数据库 MiB | RSS MiB | SQLite |
| --- | ---: | ---: | ---: | --- |
| node:sqlite | 1074.46 | 29.79 | 157.68 | 3.53.4 |
| better-sqlite3 13.0.3 | 592.14 | 29.79 | 206.65 | 3.53.4 |

| 查询 | 次数/运行 | node:sqlite 单次平均 ms（3 运行中位数） | better-sqlite3 同口径 ms |
| --- | ---: | ---: | ---: |
| 精确 ID | 2000 | 0.0273 | 0.0273 |
| 字段+ID（已有索引） | 2000 | 0.0272 | 0.0281 |
| 原文相等 | 2000 | 0.0268 | 0.0275 |
| OFFSET 20000，100 项 | 200 | 0.4823 | 0.5158 |
| 键集分页，100 项 | 200 | 0.0921 | 0.0866 |
| FTS 拍摄，最多 100 项 | 200 | 0.0354 | 0.0344 |
| 合成出边 | 2000 | 0.0268 | 0.0272 |

查询为预热同连接循环平均，不是逐请求 p95，不含 IPC/UI/并发；文本键排序不是数值排序。不可推导完整数据集建索引时间。

- 两驱动原文往返通过；BigInt 读取 6186714091647966180 正确。16752756560315677817 CAST INTEGER 得到 9223372036854775807，TEXT 往返正确；signed INTEGER 不能承载所有哈希。
- 同一 50k 样本 LIKE '%拍摄%' 匹配 **34** 项，unicode61 MATCH '拍摄' 匹配 **6** 项；语义不同，不能声称完整中文子串搜索。
- FTS5/边查询可用，不证明中文搜索策略、真实契约、全量索引或增量刷新。

## 4. 未测与预算

| 指标 | 状态 |
| --- | --- |
| 冷扫描/全量索引 | 缓存未控制，生产索引未建 |
| 热工作区打开/增量刷新 | 未实现，未测 |
| 记录/引用端到端 | 只有查询层/合成边，IPC 和 UI 未测 |
| 产品虚拟化、图、编辑器、真实数据渲染 | 未实现，未测；基础模拟任务响应性见 Phase 1A |
| 打包后的 Windows x64/macOS arm64 | 两个目标均通过基础 ASAR 目录包运行验证；macOS 本轮不新增性能基线，无正式发布构建 |

不设绝对产品预算。建议 Phase 1 复现同机基线、完成真实有界链路，再制定延迟/内存目标；建议不伪装实测。关注记录级内存、精度、索引膨胀与监控开销。

## 5. Phase 1A 首批端到端实测

日期：2026-10-02（UTC+8）；证据见 [完整小型快照](investigations/evidence/phase-1a-measurements.json)，命令与工具链见 [报告](investigations/phase-1a-foundation.md)。Phase 0 原始数字未重写。

环境：Windows 10.0.26300 x64、i9-14900HX、31.64 GiB RAM；Electron 44.5.1 / Chromium 152.0.7977.130 / Node 24.21.0 / N-API 10 / Node ABI 149；better-sqlite3 13.0.3 / SQLite 3.53.4。磁盘与后台负载未控制，未清空 OS 缓存，无置信区间，不宣称冷启动或跨机普适。

每模式执行一次完整 smoke；包含一次初始 Utility ready、三次重建 ready/恢复、三次取消和三次 SQLite。IPC 预热 5 次后测 100 次；p50 为中位数，p95 为排序后的第 95 项。SQLite 三次包含第一次 native 加载，不与后两次混称纯数据库耗时。

| 模式 | 初始 Utility ready ms（n=1） | 重建 ready 中位 ms（n=3） | typed round-trip p50 / p95 ms（n=100） | 取消中位 ms（n=3） | 重启恢复中位 ms（n=3） | SQLite smoke 中位 ms（n=3） |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| Dev（Vite 本地服务器） | 67.16 | 47.59 | 6.80 / 16.00 | 0.80 | 47.80 | 8.20 |
| Built（生产产物） | 66.94 | 56.79 | 7.20 / 16.00 | 0.60 | 57.20 | 9.50 |
| Packaged（ASAR 目录包） | 82.91 | 65.39 | 6.80 / 15.70 | 0.70 | 65.60 | 9.60 |

Packaged SQLite 三次为 125.60 / 9.60 / 8.30 ms；第一次包含 native 加载。所有模式均通过创建/写入/读回/close/cleanup；打包态 nativeUnpacked 为 true，并另外验证普通打包启动拒绝故障注入。

口径：Utility ready 从 fork 前计到 MessagePort handshake；重启从 renderer 调用计到新服务 ready；取消从发起取消计到原请求返回 CANCELLED；typed round-trip 从 renderer 调用计到有限 Probe 返回，包含 Preload/Main/MessagePort 与一次计划 1 ms 的 Utility 定时步骤及 Windows 调度，不是纯 IPC 开销。SQLite 为完整窄桥往返及临时数据库生命周期，不是单条 SQL 性能。

有限模拟批次工作时，Dev/Built/Packaged 的 50 ms DOM 心跳分别前进 38/39/40 次，合成 DOM 点击分别成功 18/19/20 次。隐藏窗口 rAF 仅采到 1/1/2 次，最大帧间隔约 956/999/1000 ms；隐藏窗口/遮挡节流不能据此当作可见 UI 帧率。结果只证明模拟任务时 renderer 仍有更新与交互，不证明未来重型索引负载或可见窗口 60 fps。

未测：纯 MessagePort 吞吐、RSS/heap 高水位、冷启动分布、人工可见窗口交互与帧率、真实数据服务负载。macOS x64 已由 ADR-0005 移出正式支持范围。未为产品设绝对预算；本轮 16 KiB/32 请求等是基础设施保护，不是未来产品上限。签名、公证、发布与全量索引仍不在本轮范围。

## 6. macOS arm64 原生验收口径

2026-10-02 在 MacBook Air / Apple M2 / 16 GiB / macOS 27.0.1 通过 dev、built 与 ASAR packaged smoke，见 [macOS 报告](investigations/phase-1a-macos-arm64-validation.md)。shell 为 Node 24.19.0 / npm 11.17.0；Electron 44.5.1 内部 Node 24.21.0 / N-API 10 / ABI 149，SQLite 3.53.4。

沿用原 smoke：每模式一次初始 ready、三次取消/恢复/SQLite，Probe 预热 5 次后采集 100 次。结果保存在本地被忽略的 `artifacts/foundation-{dev,built,packaged}-darwin-arm64.json`；这里只接受基础设施运行、SQLite 清理及模拟任务响应性的功能证据，不新增性能基线、不改写 Windows 数字。后台负载、OS 缓存、磁盘和热状态未控制；跨机器调度与隐藏窗口节流不同，不据此宣称 Mac 比 Windows 更快或可见窗口达到特定帧率。


## 7. Phase 2 Raw Access Foundation 观察

2026-10-03（UTC+8），Windows x64 / Node 24.21.0，真实 production service 独立于 Electron 测量，每个样本一次冷 service-cache read 与一次 warm read；未清 OS cache，不能称磁盘冷读，无置信区间、不设 SLA。来源前后 streaming hash/size/mtime 一致；完整验收与局限见 [实现报告](investigations/phase-2-raw-access-foundation.md)。

| 来源 | cold / warm ms | 模式 / payload bytes | actual cold / warm read bytes |
| --- | ---: | --- | ---: |
| ExcelOutput/AvatarConfig.json | 35.95 / 2.46 | complete / 5206 | 240469 / 2658 |
| ExcelOutput/EquipmentConfig.json | 18.57 / 1.69 | complete / 2058 | 132307 / 780 |
| ExcelOutput/AvatarSkillConfig.json | 928.32 / 1.86 | complete / 2927 | 11438928 / 1181 |
| TextMap/TextMapCHS.json | 2349.29 / 1.58 | summary / 327 | 52399649 / 0 |
| Config/LevelOutput_Baked/Floor/P10401_F10401001_Baked.json | 2349.42 / 1.19 | summary / 372 | 29480189 / 0 |
| Config/SoundBankLookUp.json | 891.66 / 1.60 | summary / 337 | 10920727 / 0 |

首次访问按预算完整校验一个 source，冷 read 含额外 3 字节 BOM sniff。热小值只回读已验证范围；巨大容器的热摘要不读其子树，但仍核对路径/stat。表中 payload 不含 envelope，测试另验证完整 response ≤64 KiB。page/segment 成本不在该表中，不据此声称全部后续访问具有相同延迟。

该次 Vitest、production service 与前后 streaming 指纹整体 maxRSS 为 170,588 KiB，不能分解为单 parser/Utility 高水位；GC、JavaScript key Set 和测试 runner 都有成本。当前 source read/token/depth/scalar/cursor/cache 等工程限制见报告，不代表硬 RSS 上限。

Windows dev/built/ASAR packaged raw 功能链路均通过，但本轮没有可见产品 UI memory/帧率、跨平台 raw 性能、全库访问或巨大 scalar chunk segment 基线。既有 foundation 模拟任务数字与历史 macOS 验收保持原口径。

## 8. Source Browser Slice A 目录与调度口径

2026-10-03：directory/info/reload 已从重型 parser queue 分离为并发 2 的 metadata 槽；解析仍为单任务。同步 fixture 验证 B info 与 directory 在 A scan 尚未结束时完成，不设精确毫秒 SLA。目录 cache、扫描及时间预算是工程起点，不是硬 RSS 或磁盘延迟保证。

Windows x64 首次真实目录 gate：root 6 项 / 1 页 / 532 bytes，ExcelOutput 2,253 项 / 12 页 / 最大完整 envelope 35,496 bytes，Config/Level/Mission 2,845 项 / 15 页 / 最大 15,477 bytes。完整 listing（含页和零自动注册验证）的单次观察分别约 3.18 / 212.91 / 171.60 ms，不含 Electron IPC；未控制 OS cache，不作平台排名。最终验收观察与边界见 [Slice A 报告](investigations/phase-2-source-browser-slice-a-directory-lifecycle.md)。

## Source Browser Slice B：bundle 口径

2026-10-03 Windows x64，沿用现有 electron-vite production 配置，不改 minify 策略。相同应用 Slice A 最后产物与本片单次生产构建比较：Renderer JS 114,052 → 152,262 bytes（+38,210），Node gzipSync 26,494 → 34,107 bytes（+7,613）；ASAR 1,063,759 → 1,104,278 bytes（+40,519）。包含本片消息/runtime、formatter/error/bootstrap 与诊断 harness，不能解释为单纯 compiler/runtime 增量。

新增 61 个 dev lock entries（含非本机 optional variants）均未进入 ASAR，compiler/SDK/plugin cache 和 catalog source 排除。三态 runtime navigation=0，另有各三次显式 persistence reload；不等同可见窗口帧率/切换延迟测量。缓存、背景负载未控制，无启动/响应 SLA。实际 gate、检查脚本修正及 macOS deferred 见 [Slice B 报告](investigations/phase-2-source-browser-slice-b-localization-foundation.md)。

## Source Browser Slice C：Explorer 观察口径

固定行高 24px、overscan 5，额外保留至多一个 focused item；数据缓存起点 10,000 entries / 8 MiB 序列化 metadata，不是硬 JS heap/RSS 上限。最终 dev/built/packaged 均为 5008 logical rows / 34 mounted treeitems，End 后 33；真实目录累计 5258 logical rows / 33 mounted。Renderer JS 424497 bytes / gzip 89572 bytes，相对 Slice B +272235 / +55465；ASAR 1385891 bytes，+281613。未控制 OS cache，仅作 DOM 有界和流程观察，不建立 render/scroll/activation SLA。最终三态观察、Renderer JS/gzip/ASAR delta 见 [Slice C 报告](investigations/phase-2-source-browser-slice-c-source-explorer.md)。

## Source Browser Slice D：Node 浏览观察口径

每次只保留最多 100 个 direct children 或 4096 个 Unicode scalar code points，以及最多 128 项 opaque cursor/page metadata；不累积 payload，不遍历 complete container。表格不需要虚拟化；Explorer 仍使用既有虚拟化路径。Windows dev 真实 UI 已测 Avatar/Equipment/AvatarSkill container→scalar、Previous/Next 与六代表来源；最终三态 root/首 children/导航/分页/segment/Inspector 和 Renderer JS/gzip、包体增量见 [Slice D 报告](investigations/phase-2-source-browser-slice-d-node-browser-inspector.md)。计时包含 IPC、parser、缓存与 DOM，不控制 OS cache、不建立 SLA。当时 macOS 新 UI 性能/原生验收尚未执行；本轮 Mac 观察见第 9 节。

最终 Slice D Windows 单次 11 阶段 real-data runner exit 0；Renderer JS 518830 / gzip 103813 bytes，相对 C +94333 / +14241；app.asar 1487748、win-unpacked 413719714 bytes，均增 101857。三态 synthetic root+children 23.4/30.5/24.7ms、next page 28.5/43.6/18.4ms、segment 12.2/15.4/10.1ms、Inspector update 0.7/0.6/0.4ms（dev/built/packaged）；真实 root/children/scalar 分时口径与失败调查见报告，不作为 SLA。

## 9. Source Browser macOS arm64 工程观察

2026-10-04，Apple M2 / 16 GiB / macOS 27.0.1，单次 dev/built/ASAR packaged 累计验收。5010 logical rows 初页约 140.7–151.2 ms、追加约 296.1–315.8 ms，mounted 35（End 后 34）；Avatar activation 约 27.1–30.4 ms。完整目录/Node/segment/真实来源计时及口径见 [累计报告第 15 节](investigations/phase-2-source-browser-macos-arm64-validation.md#15-performance-observations)。未控制 OS cache/后台负载，不新增 SLA 或跨平台性能排名；共享 watcher 修复为正确性修复，不声称性能提升。

## Source Browser Slice E：monitoring 与 recovery 口径

只对 active source 以请求 settled 后约 1s 的节奏检查 metadata，no overlap；隐藏/最小化暂停，恢复可见立即检查。不是 SLA，不扫描 workspace，不重复 hash/parse。普通产品启用 Electron 默认后台节流以恢复 Page Visibility，减少不可见窗口持续 timers/frames；不据此宣称已测 CPU/FPS 改善。parser/IPC/children/segment/cursor budgets 未变。最终 bundle/package 和 native visibility 观察见 [Slice E 报告](investigations/phase-2-source-browser-slice-e-change-reload-integration.md)。

最终 Windows 单次 11 阶段 gate exit 0。Renderer JS 相对 Slice E preflight 519309 → 545478 bytes，gzip 103852 → 107587；app.asar 1517026、win-unpacked 413748992 bytes。三态 native minimize/hide 1200ms 窗口内没有周期 poll，恢复可见后检查；controller timer/cancellation 边界另行验证。未保存 preflight package size，不推断同基线 package delta。

2026-10-04 Mac 定向验收：Apple M2 / macOS 27.0.1 / 台前调度关闭；最终三态各 minimize/hide 的真实 hidden 观察 2340.9–3081.4ms，poll 计数均 2→2→4，max pending=1；恢复 visibilitychange→首次请求 0.1–0.5ms，首次完成后下个请求约 1000.5–1006.4ms。只是单次 smoke 的工程观测，未控制缓存/后台负载，不测 CPU/FPS、不新增 SLA。开启台前调度的 minimize gate 未通过，范围与失败分类见 [Mac 定向报告](investigations/phase-2-source-browser-slice-e-macos-arm64-validation.md)。

## Source Browser Slice F：路径 Locator 观察口径

2026-10-05 Windows x64 早期串行版独立production real-data gate（最终worker版另列）：137,916 JSON paths / 15,212 directories，path UTF-8 10,111,116 bytes；包含安全 metadata traversal、最终 visited-directory 复核与六来源正常 Raw 访问并发的 catalog build 34,360.20ms，accounted metadata 95,590,986 bytes（128MiB guard，非 heap/RSS）。AvatarSkill/MonsterSkill/TextMapCHS 单次 query 18.09/9.27/9.96ms；json/Config/a top 50 为 80.70/37.67/20.12ms，完整 envelopes 10,327/9,969/10,362 bytes；取消约 1.00ms。lookup parser calls=0，目录 discovery 与六 source activation 在 building 下通过。gate heapUsed 起止 14.55→71.56MB，RSS 64.20→240.85MB，包含 Vitest、parser/range cache、fingerprints/GC，不能解释为独立 catalog memory。未控制 OS cache/forced GC，不设 SLA 或跨平台排名；path probe 的 ~17s 不含最终全目录复核与生产资源/查询 guard，不能代替 production timing。最终 native/IPC、平台结果与局限见 [Slice F 报告](investigations/phase-2-source-browser-slice-f-source-locator.md)。

早期串行版 runner 的真实数据阶段曾触发 CATALOG_BUILD_MS（60s）并丢弃结果；没有放宽预算。检查执行路径与进程后，以瞬时 I/O 波动为待验证假设，单独复测通过（UTC `2026-10-05T12:14:09.616Z`）：build 55,058.85ms，规模/accounted bytes/payload 均不变；六查询分别 19.57/12.13/15.00/70.80/28.50/16.02ms，取消 0.64ms。heapUsed 14.56→80.81MB，RSS 64.18→246.19MB/maxRSS 246,172KiB。三目录 discovery 在 building 下约 4.86/302.21/224.19ms；AvatarSkill/TextMapCHS cold root 1,607/4,303ms。测量波动明显，60s 在本机并非保证完成；慢盘/系统负载可能产生可恢复 RESOURCE_LIMIT，用户需显式刷新。原因未隔离，不能声称性能回归已排除。

最终 Slice F worker 版本（2026-10-05T13:44:56.49Z，完整runner真实数据阶段）：同样137,916来源/15,212目录，builtin worker metadata-only遍历、逐组件路径守卫、目录前后/最终复核、单handle、单在途≤64KiB packet和实际worker退出，共23,838.06ms；accounted96,639,306bytes，含1MiB临时余量。AvatarSkill/MonsterSkill/TextMapCHS18.97/16.81/14.30ms；json/Config/a top50为79.48/40.28/22.86ms，完整envelope10,327/9,969/10,362bytes，取消1.02ms、lookup parserCalls=0。前四代表source访问和三目录listing在building下完成，最后两source已ready；目录3.92/360.02/300.87ms，AvatarSkill/TextMapCHS根1,804.20/5,877.24ms。heapUsed16.84→82.60MB只覆盖owner线程，RSS76.79→341.91MB、maxRSS457,040KiB包括worker/Vitest/parser/cache/指纹/GC，不等于独立catalog内存或128MiB accounted guard。旧serial与async批处理版本在若干真实链路触发60s保护并整次丢弃；同步完整安全探针22.58s提供改worker证据，未扩大60s预算。未控制OS cache或最终无catalog对照，不声明零干扰/冷读/SLA；真实Electron IPC查询、包体与截图证据见Slice F报告。
最终同一production build的Windows dev/built/packaged实际query+IPC+DOM计时（AvatarSkill/MonsterSkill/TextMapCHS）：22.8/22.5/22.4ms、32.1/20.3/21.4ms、25.4/21.5/20.7ms；三态Ctrl+P均prevented=1/Print=0，normal/narrow截图检查与console guard通过。Renderer587,502bytes/gzip114,766bytes，相对已记录Slice E+42,024/+7,179；app.asar1,597,652bytes、win-unpacked413,829,618bytes，相对既有记录均+80,626bytes。完整runner在built旧visible gate失焦失败后，后三阶段复用同build恢复通过；不是单次11阶段exit0，不隐藏该宿主focus限制。macOS arm64本轮NOT YET RUN。
## Source Browser Slice G — active-source Find

2026-10-06 Windows x64 定向 gate：catalog ready 后隔离测量，避免把并行 metadata遍历成本当作Find工作。AvatarSkill query1407首匹配65.81ms/完成1021.43ms；TextMap late key首匹配1003.41ms/完成2192.59ms，no-match2179.12ms；Floor GroupList首匹配1.67ms/完成2236.32ms，首次container navigation另为2172.34ms。五源broad1首批2.20–2.70ms，只采样最多32并标incomplete。TextMap/Floor取消0.81/0.61ms；未主动取消时正常root读取等待一个batch约102.49/102.59ms；最大完整envelope8538bytes。read/token、最终native/包体和失败调查见 [Slice G报告](investigations/phase-2-source-browser-slice-g-find-in-source.md)。这些是单机单次观察，未控制OS cache/负载，不声明冷盘、零竞争或SLA；process memory包含Vitest/catalog/Raw cache/GC，不等同Find guard。

早期并行与随后串行真实gate在旧Raw Floor冷读取路径触发15s WORK_MS，尚未进入Find；未放宽预算。HEAD/current parser、完整service和Vitest对照均能在原预算内完成，原因未完全隔离。最终真实gate改等catalog ready再测Raw/Find，保留building discovery/native activation检查；新旧测量不可直接视为受控性能排名。

最终 Slice G已通过的real-data阶段（UTC2026-10-06T01:03:40.037Z）：AvatarSkill1407首匹配66.52ms/EOF1033.53ms；TextMap late key971.58/2131.71ms、no-match2128.51ms；Floor GroupList1.69/2203.88ms、首次container navigation2149.50ms。broad1五源首批2.01–2.54ms/max32/incomplete，最大完整envelope8538bytes；TextMap/Floor取消0.86/0.57ms、排队root102.14/102.21ms。完整runner后续曾触发既有catalog60s与RawFloor15s保护，原因未完全隔离，没有修改Slice F或预算；必要gates累计通过，不是单次11阶段exit0。最终同一build三态native AvatarID/1407/攻击导航分别8.4/66.9/15.2、9.9/68.2/11.3、8.5/65.5/12.7ms；Escape大源取消1.9/1.0/1.1ms，native find=0、shortcut prevented=1。Renderer637,095/gzip121,754bytes，相对实测F增49,593/6,988；ASAR1,661,364/win-unpacked413,893,330bytes。三态normal/narrow截图与安全guards通过，production build恰一次；窗口操作导致的一次旧monitor失败经用户确认、无窗口干预后通过，与catalog/Raw限制分开记录。细节与完整口径见 [Slice G报告](investigations/phase-2-source-browser-slice-g-find-in-source.md)与[紧凑证据](investigations/evidence/phase-2-source-browser-slice-g-measurements.json)。
