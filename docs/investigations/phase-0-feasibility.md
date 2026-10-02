# Phase 0：项目引导与可行性调查

调查日期：2026-10-02（UTC+8）。状态：调查已完成，技术选型尚待接受。本报告为历史证据，不是规范性架构；已接受原则以 [PROJECT](../PROJECT.md) 和 [ARCHITECTURE](../ARCHITECTURE.md) 为准，进度以 [STATUS](../STATUS.md) 为准。

> **Phase 0 收尾补记（2026-10-02）**：评审后，项目文档整体迁入 `RefAtlas/docs/`，纳入应用仓库的同一 Git 版本管理；本次收尾变更尚未提交。桌面栈、进程边界、无损/有界访问、Phase 1 首选 better-sqlite3 和确定性搜索方向已接受，当前决定见 [架构](../ARCHITECTURE.md) 与 [ADR](../decisions/README.md)。正文的“待接受”“docs 未受 Git 管理”等陈述记录调查当时的事实，不是当前状态；原始结论、版本快照和测量保持不变。

## 1. 执行摘要

> **后续补记（2026-10-02，Phase 1A 开始）**：Phase 0 closeout 已提交为 `809a4a5`，文档与 ADR 已在应用仓库版本管理。前述“尚未提交”及正文版本管理描述保留为调查／收尾时点事实，不代表当前状态；本轮不改写原始调查结论和测量。

**结论：未发现否定 Electron 桌面方向的实质阻碍，但原始整数精度、中文搜索语义、复合记录身份和大型嵌套记录必须先处理。**

- 工作树 137917 文件、137916 JSON，总数据 2617264411 字节；并非文档举例中的单文件 300+ MB，当前最大 JSON 为 73607269 字节（70.20 MiB）。不能因本次较小快照忽略未来增长。
- 最大 TextMap 完整读/解析中位 596.90 ms，进程 RSS 高水位中位 337.20 MiB；流式 token 遍历 421.59 ms、61.20 MiB。不同工作量，不是纯解析器速度排名，详见 [权威性能基线](../PERFORMANCE.md)。
- Windows x64 Electron 44.5.1 utilityProcess 中 node:sqlite 与 better-sqlite3 13.0.3 均通过 SQLite/FTS5/BigInt 探针。没有生产应用、正式数据库、真实关系契约或跨平台发布构建。
- 官方包元数据发现 electron-vite 5.0.0 支持 Vite 5/6/7，不声明支持当前 Vite 8.3.2；不能组合全部 latest。Forge Vite 官方文档仍标 experimental。
- 文档体系、最小仓库规范、隔离实验、测试及紧凑证据已建立。同级 docs 仍未受 Git 管理，按用户选择保持目录，不另建仓库。

## 2. 数据集规模与口径

实际目录为 TurnBasedGameData，任务文档写成 TurnBaseGameData；以本地名称为准。上游提交 724b139d8c9c32d12552eb95745a4fee72bfe48b，开始状态干净。仅只读扫描，不拉取上游、不复制数据。

| 范围 | 文件数 | 逻辑字节 | GiB |
| --- | ---: | ---: | ---: |
| 工作树，不含 .git | 137917 | 2617264411 | 2.438 |
| JSON | 137916 | 2617263428 | 2.438 |
| .git | 33 | 3745635411 | 3.488 |
| 仓库含 .git | 137950 | 6362899822 | 5.926 |

大小为文件长度之和，不是磁盘簇占用。目录规模：

| 区域 | 文件数 | JSON 数 | MiB |
| --- | ---: | ---: | ---: |
| Config | 126586 | 126586 | 1050.08 |
| ExcelOutput | 2253 | 2253 | 269.28 |
| README.md | 1 | 0 | 0.00 |
| Stages | 3473 | 3473 | 268.34 |
| Story | 5575 | 5575 | 25.49 |
| TextMap | 29 | 29 | 882.82 |

Config 占文件数主体，TextMap 占大量体积；不能只针对 ExcelOutput 或角色配置优化。scan 计时包含 .git 遍历，但未来工作区发现应直接排除它。

## 3. 最大 30 个 JSON

路径均相对只读 TurnBasedGameData，不是实体模型；前 30 名覆盖 TextMap、复杂配置、关卡与烘焙输出。

| 排名 | 实际路径 | 字节 | MiB |
| --- | --- | ---: | ---: |
| 1 | TextMap/TextMapVI.json | 73607269 | 70.20 |
| 2 | TextMap/TextMapJP.json | 69174020 | 65.97 |
| 3 | TextMap/TextMapFR.json | 67261153 | 64.15 |
| 4 | TextMap/TextMapDE.json | 65927157 | 62.87 |
| 5 | TextMap/TextMapPT.json | 63050179 | 60.13 |
| 6 | TextMap/TextMapTH_1.json | 62809394 | 59.90 |
| 7 | TextMap/TextMapES.json | 62520864 | 59.62 |
| 8 | TextMap/TextMapID.json | 62088503 | 59.21 |
| 9 | TextMap/TextMapTH_0.json | 59888997 | 57.11 |
| 10 | TextMap/TextMapEN.json | 59061007 | 56.32 |
| 11 | ExcelOutput/SpecialAvatarRelicMainValue.json | 53642663 | 51.16 |
| 12 | TextMap/TextMapCHT.json | 52579992 | 50.14 |
| 13 | TextMap/TextMapCHS.json | 52399646 | 49.97 |
| 14 | TextMap/TextMapRU_1.json | 45894163 | 43.77 |
| 15 | TextMap/TextMapKR_1.json | 43948077 | 41.91 |
| 16 | ExcelOutput/TalkSentenceConfig.json | 43738600 | 41.71 |
| 17 | TextMap/TextMapRU_0.json | 43164047 | 41.16 |
| 18 | TextMap/TextMapKR_0.json | 41105670 | 39.20 |
| 19 | Config/LevelOutput_Baked/Floor/P10401_F10401001_Baked.json | 29480186 | 28.11 |
| 20 | ExcelOutput/StageConfig.json | 26939432 | 25.69 |
| 21 | ExcelOutput/PlaneEvent.json | 12395324 | 11.82 |
| 22 | ExcelOutput/AvatarSkillConfig.json | 11438925 | 10.91 |
| 23 | Config/SoundBankLookUp.json | 10920724 | 10.41 |
| 24 | Config/LevelOutput_Baked/Floor/P10501_F10501001_Baked.json | 10795396 | 10.30 |
| 25 | ExcelOutput/VoiceConfig.json | 9219463 | 8.79 |
| 26 | Config/LevelOutput_Baked/FloorCrossMapBriefInfo/CrossMapBriefInfo_P10401_F10401001.json | 7936492 | 7.57 |
| 27 | ExcelOutput/GridFightFrontSkill.json | 6709090 | 6.40 |
| 28 | Stages/Outputs/Chapter04/Stages/Chap04_ADV_A01_StageData/Chap04_ADV_A01_StageData.PVSMeta.json | 5938410 | 5.66 |
| 29 | Stages/Outputs/ChapterTA/Stages/ChapterTA_Stage_BattleTest/Blocks/ChapTA_CloseView_ADV_01_PerformanceTest0K_BlockData.json | 5411265 | 5.16 |
| 30 | Config/LevelOutput_Baked/Floor/P10341_F10341001_Baked.json | 5270723 | 5.03 |

## 4. 代表性结构

顶层项数是数组长度或对象属性数，不等于业务实体数；最大深度为容器嵌套深度。行数逐字节统计换行，并考虑无末尾换行。样本指纹和明细见 [测量证据](evidence/phase-0-measurements.json)。

| 路径 | MiB | 顶层 | 顶层项 | 行数 | 最大深度 |
| --- | ---: | --- | ---: | ---: | ---: |
| ExcelOutput/AvatarConfig.json | 0.23 | 数组 | 94 | 7529 | 3 |
| ExcelOutput/EquipmentConfig.json | 0.13 | 数组 | 170 | 6494 | 3 |
| ExcelOutput/RelicConfig.json | 0.20 | 数组 | 774 | 10064 | 2 |
| ExcelOutput/MonsterConfig.json | 4.32 | 数组 | 2722 | 232893 | 6 |
| ExcelOutput/MonsterSkillConfig.json | 2.62 | 数组 | 3566 | 137336 | 4 |
| ExcelOutput/AvatarMazeBuff.json | 0.10 | 数组 | 148 | 3921 | 4 |
| ExcelOutput/ChallengeMazeConfig.json | 0.56 | 数组 | 627 | 32493 | 3 |
| ExcelOutput/ChallengePeakConfig.json | 0.02 | 数组 | 40 | 1425 | 3 |
| ExcelOutput/AvatarSkillConfig.json | 10.91 | 数组 | 7040 | 605087 | 4 |
| ExcelOutput/StageConfig.json | 25.69 | 数组 | 29515 | 1149998 | 4 |
| ExcelOutput/SpecialAvatarRelicMainValue.json | 51.16 | 数组 | 64400 | 2640402 | 5 |
| TextMap/TextMapCHS.json | 49.97 | 对象 | 474193 | 474195 | 1 |
| TextMap/TextMapVI.json | 70.20 | 对象 | 474196 | 474198 | 1 |
| Config/LevelOutput_Baked/Floor/P10401_F10401001_Baked.json | 28.11 | 对象 | 4 | 1283261 | 12 |
| Config/SoundBankLookUp.json | 10.41 | 对象 | 1 | 545997 | 7 |

**数组记录**：ExcelOutput 样本以 /0、/1 等 JSON Pointer 物理定位，而非“对象键就是 ID”。业务 ID 字段必须由契约指定，不能默认第一字段或唯一数值。

**TextMap 对象**：属性键是十进制字符串，值是文本；/12518437936274253375 等地址可确定性指向项。不同语言键数和顺序不同，不能按相同数组位置关联。

**复杂对象**：烘焙 Floor 文件仅 4 个顶层属性、深度 12，SoundBankLookUp 仅 1 个顶层属性、深度 7。嵌套列表需要更细记录边界；单顶层项可能包含数百万字符。observer 的最大记录字符统计是 token 值/键长度累计，非原始字节或严格内存；不可当作正式偏移范围。

**混合/未知字段**：SpecialAvatarRelicMainValue 使用 FODBMMCKAEN、MNDFOPKBHKP 等原始键，StageConfig 的 StageConfigData 同样有未知键；记录原文，不猜测命名或重塑语义。

## 5. ID 与引用形态

标记规则：事实（FACT）是可重复的原文/匹配；观察（OBSERVATION）描述结构；假设（HYPOTHESIS）是未验证语义。匹配成功不构成正式外键。

| 领域 | 原始形态/样例 | 证据分类与契约影响 |
| --- | --- | --- |
| Avatar | /0 AvatarID=1001；SkillList、RankIDList 为数组 | 事实；数组到记录候选，不证明目标文件/基数 |
| Equipment | /0 EquipmentID=20000，SkillID=20000 | 事实；两个值相等不能证明身份/关系 |
| Relic | /0 ID=31011、SetID=101、MainAffixGroup=21 | 事实；字段到目标键/字段候选 |
| Monster | /0 MonsterID=1002011、MonsterTemplateID=1002011 | 事实；相等值不等于同一概念 |
| MonsterSkill | /0 SkillID=100201101，PhaseList 数组 | 事实；领域/嵌套引用需显式定义 |
| Buff | AvatarMazeBuff /0 ID=100801、ModifierName、BuffName.Hash | 事实；字符串绑定键与文本哈希并存 |
| Stage | /0 StageID=103201，MonsterList=[{Monster0:1022020,...}] | 事实；嵌套引用形态，语义未确认 |
| 终局相关 | ChallengeMaze 的 ChallengeTargetID、EventIDList1；ChallengePeak 的 NormalTargetList | 观察；不强制归一化成通用终局实体 |
| TextMap | AvatarName.Hash=6186714091647966180 在 CHS 对应“三月七” | 事实是当前快照精确匹配；通用本地化映射仍需契约 |
| 文件路径 | AvatarConfig /0 JsonPath 指向本地实际存在文件 | 事实是字符串路径与存在性；路径解析/安全规则需正式定义 |

AvatarSkillConfig 共 **7040** 项，仅 **711** 个不同 SkillID，(SkillID, Level) 组合在本快照中有 7040 个不同值。例 100201 有 Level 1–10。**只用 SkillID 会把多个物理记录错误合并**；不能擅自选 Level=1。组合唯一只是快照事实，不是已接受契约主键。

AvatarConfig 有 243 个数值 token 超出 Number 安全整数范围，其中 103 个超过 signed 64 位上限；AvatarSkillConfig 对应 35056/19471。TextMap 哈希是字符串键，不能先转 Number 再查找。

精度例：原文 6186714091647966180 经 String(JSON.parse(...)) 显示 6186714091647966000；stream-json numberValue 保存原数字文本。numberAsString 仅是实验便利表示，会混淆原数值与原字符串类型，不是生产数据模型或字节保真。

关系候选覆盖 key→key、field→key、field→field、ID 数组、嵌套引用、复合选择和文本映射；一对一/一对多/多对一须由显式契约定义。Phase 0 未声称任何跨配置语义关系已经验证成 Core 真相。

## 6. 大文件基准结果

完整三次结果、计时分解、吞吐与命令见 [PERFORMANCE](../PERFORMANCE.md) 及 [逐运行证据](evidence/phase-0-benchmarks.json)。完成 15 个结构实验和 42 个基准：6 个文件 × 2 模式 × 3 次，加 2 驱动 × 3 次。

输入覆盖 4.32 MiB MonsterConfig、10.91 MiB AvatarSkillConfig、25.69 MiB StageConfig、51.16 MiB SpecialAvatarRelicMainValue、49.97 MiB 中文 TextMap、70.20 MiB 最大 TextMap。所有实验成功，完整解析与流式顶层计数一致。未复制数据或建立全量索引。

## 7. 内存观察

TextMap 的完整文本、解码字符串和对象放大明显；最大样本完整解析 RSS 为数百 MiB，流式 token 实验约 61 MiB。小配置的流式运行时/回调开销可能高于完整解析，不能统一宣称流式更快或更省内存。

实际 memory 包含模块/运行时，RSS 高水位不等于 heap 或对象大小；监督采样可漏短峰。生产中的 IPC 克隆、UI 状态、并发、记录物化和原始片段缓存均未加入。Floor/SoundBank 的巨大顶层项说明“按顶层记录流式”也可能产生大对象。

## 8. 流式 JSON 评估

| 候选 | 当前版本/维护证据 | 能力与限制 | 本次验证 |
| --- | --- | --- | --- |
| stream-json | 3.7.0，2026-09-19，BSD-3-Clause，内置 TS | ESM token/filter/streamer；numberValue 为词法文本；默认 Assembler 会 parseFloat，须特别处理 | 真数据 token 遍历、顶层计数、record streamer、数值文本及测试通过 |
| @streamparser/json | 0.0.26，2026-08-21，MIT，TS，核心无依赖 | Tokenizer 可覆盖 parseNumber；onToken 有 offset；默认 Number 仍损失精度 | 官方 README/源码已读，未安装/计时，字节偏移完整性未验证 |

stream-json 3.x 已不同于旧版 CommonJS 教程，本次使用锁定版本实际 API。背压通过 Node pipeline 和有界 Writable 接入，长字符串/小缓冲测试通过，但未证明任意超长 scalar 无上限内存。使用未打包 stringChunk 的能力需后续实验。

@streamparser/json 提供 offset 是源切片方向的可行证据，**不是验证了 UTF-8、转义、BOM 和所有容器起止字节的证明**。默认 number/Assembler 流程不可直接采用；不自行编写 tokenizer。

## 9. 索引与选择访问备选

| 方案 | 优点 | 风险/适用范围 |
| --- | --- | --- |
| 按需完整解析 | 小文件简单 | 大文件反复成本、精度与对象缓存，不作为大文件主路径 |
| 通用持久化索引 | 精确 ID/字段/分页可测 | 首次构建、增量失效、磁盘膨胀尚未全量测 |
| 原始字节范围索引 | 少复制数据，出处直接 | 依赖成熟 tokenizer 的完整偏移、源变更检测；未验证 |
| 选定原始记录物化 | 单记录查询简单 | 大记录仍可能过大，必须保类型/出处，不复制整个数据集 |
| 混合 | 小文件按需，大文件索引+有界片段 | 建议方向，非已接受 schema；需实测刷新和缓存 |

确定性搜索应区分文件名、字段名、原始标量类型/词法、契约 ID、JSON 地址及本地化文本。不能全局只设一个 ID 主键，也不能把全部文本 MATCH 等价于子串检索。Phase 0 不实现通用语义索引或 embeddings。

建议先按文件/记录/原始类型构建最小索引，契约再提供身份/引用；偏移策略以能否通过 UTF-8 精确回读实验决定。字段/文本的完整倒排覆盖与索引容量暂未定。

## 10. SQLite 驱动评估

| 项目 | node:sqlite | better-sqlite3 13.0.3 |
| --- | --- | --- |
| 实测引擎 | SQLite 3.53.4，FTS5 可用 | SQLite 3.53.4，FTS5 可用 |
| API/TS | DatabaseSync/prepare；Node 类型与运行时要对齐 | 成熟同步 API/transaction；当前类型包 9.6.0，与 13.x API 需核对 |
| 稳定性 | Node 24 当前官方文档标 Stability 1.2（Release candidate），不是稳定 API 承诺 | 长期 API 与当前版本发行，仍需审查大版本变化 |
| 原生/分发 | Electron 内置，无额外 addon | 本次包内平台预编译 .node；实际存在 win32、darwin、linux/musl x64/arm64 |
| Electron 44.5.1 | utilityProcess 中探针通过 | utilityProcess 中已安装二进制直接加载成功，未作 Electron rebuild |
| 大整数 | setReadBigInts(true)，signed 64 位 | safeIntegers(true)，signed 64 位 |
| 许可 | Node/SQLite 各自许可需按发行物归档 | MIT，原生/SQLite 许可随发行归档 |

本机 50k 含文本索引批插入 better-sqlite3 更快，但精确查询接近；node:sqlite 进程 RSS 较低，见权威基线。SQLite 对 unsigned 64 位应使用无损文本或经明确设计的表示，不能直接 signed INTEGER CAST。

better-sqlite3 13.x 当前使用 node-addon-api 和包内预构建，**不能机械照搬旧版本每个 Electron ABI 都必须重编译的结论**；Windows 未重编译加载通过，macOS 和 ASAR 解包仍需打包后验证。当前预编译存在不等于其发布包已测试。

**暂定建议**：优先审议 node:sqlite 的低依赖路径；若不接受 RC API 风险或需要 better-sqlite3 的成熟扩展，可选 13.x。不凭一次吞吐就批准驱动。

默认 unicode61 对中文“拍摄”仅 6 项，LIKE 子串 34 项。后续应定义子串/分词语义并比较 SQLite trigram 等成熟方案；两字查询与中文分词不能忽略。当前不批准正式 FTS 策略。

## 11. Electron 进程模型

| 路径 | 优点 | 代价/限制 | 建议 |
| --- | --- | --- | --- |
| utilityProcess | 独立 OS 进程，Electron 生命周期/MessagePort 支持，故障隔离 | 运行时内存、消息边界、打包入口需验证 | 主数据服务首选候选 |
| Worker Threads | 可执行 CPU 工作，支持传输对象，启动较轻 | 同 OS 进程资源/崩溃边界；并行数据库连接需要治理 | 后续有测量需要再加 |
| child_process | 通用 Node 模型，易做隔离实验 | 发行物中的运行时路径、fork/stdio、生命周期管理 | 本次基准使用；非默认生产方案 |

已实测 Electron 44.5.1 / Chromium 152.0.7977.130 / Node 24.21.0 / N-API 10，数据探针 processType=utility，两个驱动均支持 FTS5 和 BigInt。探针无窗口、无 UI，不证明 MessagePort 吞吐、取消协议或异常恢复已实现。

候选拓扑为 Renderer → preload 的最小 typed IPC → Main 编排 → utilityProcess 数据服务；渲染进程没有数据库/文件权限，main 不承担 CPU 重型工作。沿用 contextIsolation、sandbox 与有界 payload；不能暴露整个 ipcRenderer。具体 Query API、IPC 线格式、取消/重试仍待 Phase 1 设计。

## 12. 桌面构建工具

| 路径 | 构建与 HMR | 数据进程/原生模块 | 打包/维护取舍 |
| --- | --- | --- | --- |
| Forge 8.0.1 + Vite plugin 8.0.1 | 官方 main/preload/renderer Vite 配置 | 单独数据入口需配置；有 auto-unpack-natives | maker/publisher/GitHub 集成成熟，但官方 Vite 仍 experimental，minor 可破坏兼容 |
| electron-vite 5.0.0 + builder 26.15.3 | main/preload/renderer 构建，renderer HMR、main 重启 | 官方支持 Worker ?nodeWorker、utility ?modulePath；外部化原生依赖 | 专门开发链+成熟打包器，但两项目集成需测试，vite peer 上限 7 |
| Forge + 独立 Vite 构建 | Vite Svelte 构建后交给 Forge | 可以明确数据入口 | 避开实验插件，但增加构建/开发串接维护；不需要自研 bundler |

当前发布元数据：Electron 44.5.1，Svelte 5.57.1，TypeScript 7.0.2，Vite 8.3.2。它们是调查版本，不是生产已锁定组合。

**暂定首选组合**：electron-vite 5.0.0 + Vite **7.3.6** + @sveltejs/vite-plugin-svelte **6.2.4** + Svelte 5.57.1 + TypeScript 7.0.2 + electron-builder 26.15.3。这是 peer 范围兼容的建议，尚未做应用构建验证。当前 Svelte 插件 latest 7.3.1 需要 Vite 8；与 electron-vite 5 的 peer 不相容。不能用强制安装掩盖冲突。

Phase 1 接受前做最小入口构建/热更新/utility 入口/ASAR 原生加载测试，Windows 和两种 macOS 构建。无需重开 Electron/Tauri 哲学比较。维护发布日期、Node engines、peer 和许可证见 [来源元数据](evidence/phase-0-sources.json)。

## 13. UI 与开发基础设施候选

仅研究，不安装 UI 依赖或做 UI 性能承诺。

| 能力 | 候选版本/许可 | 当前支持与取舍 | 建议 |
| --- | --- | --- | --- |
| 虚拟化 | @tanstack/svelte-virtual 3.13.39 / MIT | peer 支持 Svelte 3/4/5，TS，headless 控制 | 优先候选；行高、滚动定位需实测 |
| 表格 | @tanstack/svelte-table 9.2.4 / MIT | peer Svelte 5；v9 文档有 Store/runes 桥接，不沿用旧 v8 教程 | 仅有表格需求再引入，不能替代虚拟化 |
| JSON/片段编辑 | CodeMirror 6.0.2 / MIT | 模块化、TS，可按需语言/只读扩展 | 有界片段首选候选 |
| 编辑器备选 | Monaco 0.57.0 / MIT | VS Code 风格、worker/资源配置更重 | 需要完整 IDE 功能时再审议 |
| 局部引用图 | Cytoscape.js 3.34.3 / MIT | TS、交互/布局生态、Canvas，插件分别审查 | 局部可展开引用图首选候选 |
| 图备选 | Sigma 3.0.3 / MIT | TS、WebGL/Graphology，适合大量点边绘制 | 规模需求证明后再选，图布局需额外库 |
| IPC 校验 | Zod 4.6.5 / MIT | TS schema，范围/条数/大小校验 | 有界边界校验，不推断数据语义 |
| 文件监听 | Chokidar 5.0.0 / MIT | Node >=20.19，TS；大量目录监听压力要测 | 优先成熟库，需批处理/失效设计 |
| 测试 | Vitest 5.0.3、Playwright 1.63.0 / MIT、Apache-2.0 | peer/Node 与构建链核对；Electron 支持入口需验证 | Phase 1 单元+桌面集成候选 |
| 规范 | ESLint 10.11.0、Prettier 3.9.9 / MIT | 当前 Node engines 可用；Svelte/TS 插件组合未验证 | Phase 1 配置，不在调查阶段运行大套工具 |

npm 包解压字节可比较分发负担：Monaco 当前包约 96.96 MiB，但包含资源/源码；CodeMirror 元包很小但依赖多个模块。**不等于最终 renderer bundle 大小**，不能以二者直接比值作为选择证据。图性能、bundle、布局/虚拟化 DOM 均未实测。

巨大文件的未来展示应是文件大小、记录数、索引状态、搜索/浏览/外部打开，再载入有界片段。不会尝试把数十至数百 MB 原文打开到 Monaco/CodeMirror，也不一次画全数据集关系图。

## 14. Windows/macOS GitHub Releases 可行性

官方工具与 runner 能覆盖目标，未发现阻断；本阶段只核实文档与 Windows 运行时，不配置工作流、不生成安装包。

| 平台 | 建议产物 | 构建路径与签名 |
| --- | --- | --- |
| Windows x64 | NSIS 安装器 + ZIP 预发布/排障包 | Windows runner，本机型原生验证；常规公开分发代码签名，未签名可能有信誉/安全提示 |
| macOS x64 | DMG + ZIP | 明确 Intel runner，例如当前 macos-15-intel；Developer ID 签名与公证 |
| macOS arm64 | DMG + ZIP | 明确 arm64 runner，例如当前 macos-15；单独验证 Helper/addon 签名 |

GitHub 当前 macos-latest 对应 arm64，不能默认它是 Intel。可交叉产出部分包，但签名、公证和原生加载验收建议在对应 OS/架构执行；不要把 Windows 构建成功当 macOS 可发布证明。

建议未来 tag/release → Actions 三目标 matrix → 收集产物 → 单发布步骤上传 GitHub Release，设置 contents:write 并保护发布 secrets。优先在原生矩阵生成各目标产物；先无签名预发布，明确 Gatekeeper/SmartScreen 提示，不宣传免提示正式发行。

macOS 外部分发通常需要 Developer ID、合适 entitlements、notarization 与 stapling；签名凭据尚未配置。Windows 签名可按官方工具支持的证书/服务选项接入；不保存密钥到仓库。许可证/第三方通知与数据来源署名需在正式发行前审查，外部数据本次未打包。

## 15. 风险

| 风险 | 证据/级别 | 控制方向 |
| --- | --- | --- |
| 大整数损坏 | 已实测，高 | 数值 token 无损，区分类型；哈希字符串/TEXT，禁止 Number 中转 |
| ID 合并/候选引用变真相 | SkillID 重复已实测，高 | 文件/物理地址与契约身份分开，复合选择明确 |
| 中文搜索不完整 | 34 vs 6 已实测，高 | 明确语义，再测 tokenizer/trigram/短词回退 |
| 大型嵌套记录内存 | 大顶层项、深度 12，观察，高 | 更细记录边界与有界片段，不能只 streamArray |
| 文件发现/监听规模 | 137916 JSON，观察，中 | 排除 .git、批处理、变化失效与监听压力实测 |
| 工具版本组合 | Vite peer 冲突已核实，中 | pin 已兼容分支，禁止全 latest/force |
| 原生与发行 | Windows utility 通过，其他未测，中 | 对应架构 CI、ASAR、签名/公证后的加载测试 |
| docs 丢失 | 当前未受 Git 管理，高 | 按用户选择不改布局；独立备份，后续审议版本管理 |
| 基准过度外推 | 原顺序 50k、本机缓存和循环均值，中 | 扩充真实有界链路/全量实测再设预算 |

## 16. 未解决问题与实测限制

- 未测完整数据集索引、原始偏移回读、增量更新、损坏/变化中数据源和 watcher 压力。
- 大整数生产类型/IPC 传输方式、记录大小界限和物理地址失效策略未设计；实验字符串不是正式类型。
- SQLite 驱动稳定性取舍、中文子串/分词/短词策略与索引膨胀待批准/实测。
- utilityProcess 仅启动/SQLite 探针；取消、崩溃恢复、MessagePort 性能与 renderer 响应未实现。
- 工具链仅文档/peer 分析，生产构建和 macOS 两架构/签名/公证均未测；不承诺正式 release ready。
- 检查系统信息时 CIM 在沙箱被拒，使用 Node os 获取 CPU/内存；未核实物理存储特征。网络个别重定向/超时已纠正或重试，最终 29 个官方页面有成功获取摘要。

## 17. 建议方向（非已接受决策）

**强推荐**：继续 Electron 桌面方向；数据服务与 main/renderer 分离；无损 token 与原始类型/出处；有界查询与成熟虚拟化；SQLite 作为持久化索引候选；显式契约而非关系推断。证据支持可行，不代表生产已实现。

**暂定推荐**：utilityProcess 单数据服务；小文件按需、大文件流式/索引的混合访问；node:sqlite 优先评审；electron-vite + Vite 7 + builder 的明确兼容组合；TanStack Virtual、CodeMirror、Cytoscape 作为后续 UI 候选。

**仍未解决**：中文检索、原始偏移可用性、全量构建/刷新、记录上限/IPC 类型、跨平台打包签名。不能因本报告直接把暂定建议写入 ARCHITECTURE 为已接受。

## 18. Phase 1 前需要用户接受的决定

1. 接受候选进程方向与明确版本组合，或选择 Forge 路径；Phase 1 先做最小构建/进程验收。
2. 接受 node:sqlite 的 RC API 风险，或采用 better-sqlite3 13.x，并安排原生打包验证。
3. 确认原始检索应支持哪些中文语义与短词行为，再决定 FTS/子串策略；不能默认为 unicode61 全覆盖。

无需再次批准已接受的只读/无推断原则，也不重问 docs 现状选择。签名凭据、发布账户和正式性能预算可在对应阶段处理，不作为调查未完成借口。

## 附录 A：复现与验收

复现见 [工具 README](../../tools/investigation/README.md)。6 个针对性测试通过：结构/计数、整数/词法、坏 JSON、长记录/背压、路径边界、超时/RSS。另有验收脚本复核实验成功、计数/查询、官方来源、文档链接、样本指纹与无生产脚手架。

所有 15 个输入样本 SHA-256/mtime 与开始一致，数据仓库 HEAD 和 porcelain 状态相同、干净。应用仓库仅增加文档/调查工具和锁文件，保留 LICENSE/.gitattributes；未提交、未建分支。数据库正常结束自动清理；依赖、缓存、原始结果均被忽略，不复制上游数据。

[测量证据](evidence/phase-0-measurements.json)、[三次基准](evidence/phase-0-benchmarks.json)、[来源元数据](evidence/phase-0-sources.json) 为小型历史快照；字段标识符保留原文。大型日志/数据库不进入文档目录。docs 未受 Git 管理，这些证据需要用户独立备份。

## 附录 B：官方来源与版本证据

以下页面实际读取，摘要含 URL/最终 URL、字节数和 SHA-256；包发行版本、日期、许可、engine/peer 来自官方 npm 发布元数据。调查日 2026-10-02，不使用过时版本记忆。当前网页可随时间变化，复现应参考保存的发行版本和取样日期。

| 来源 | 官方地址 |
| --- | --- |
| electronStable | [官方文档/源码](https://releases.electronjs.org/) |
| processes | [官方文档/源码](https://www.electronjs.org/docs/latest/tutorial/process-model) |
| security | [官方文档/源码](https://www.electronjs.org/docs/latest/tutorial/security) |
| sqlite | [官方文档/源码](https://nodejs.org/docs/latest-v24.x/api/sqlite.html) |
| forgeVite | [官方文档/源码](https://www.electronforge.io/config/plugins/vite) |
| forgeGithub | [官方文档/源码](https://www.electronforge.io/config/publishers/github) |
| forgeNative | [官方文档/源码](https://www.electronforge.io/config/plugins/auto-unpack-natives) |
| electronVite | [官方文档/源码](https://electron-vite.org/guide/) |
| electronViteWorker | [官方文档/源码](https://electron-vite.org/guide/dev) |
| builderMac | [官方文档/源码](https://www.electron.build/docs/mac/) |
| builderWin | [官方文档/源码](https://www.electron.build/docs/win/) |
| builderSign | [官方文档/源码](https://www.electronforge.io/guides/code-signing/code-signing-macos) |
| windowsSign | [官方文档/源码](https://www.electronforge.io/guides/code-signing/code-signing-windows) |
| builderPublish | [官方文档/源码](https://www.electron.build/docs/publish/) |
| tanstackVirtual | [官方文档/源码](https://tanstack.com/virtual/latest/docs/framework/svelte/svelte-virtual) |
| tanstackTable | [官方文档/源码](https://tanstack.com/table/latest/docs/framework/svelte/guide/table-state) |
| codemirror | [官方文档/源码](https://codemirror.net/docs/) |
| monaco | [官方文档/源码](https://raw.githubusercontent.com/microsoft/monaco-editor/main/README.md) |
| cytoscape | [官方文档/源码](https://js.cytoscape.org/) |
| sigma | [官方文档/源码](https://www.sigmajs.org/docs/) |
| streamParser | [官方文档/源码](https://raw.githubusercontent.com/juanjoDiaz/streamparser-json/main/packages/plainjs/README.md) |
| streamParserTokenizer | [官方文档/源码](https://raw.githubusercontent.com/juanjoDiaz/streamparser-json/main/packages/plainjs/src/tokenizer.ts) |
| streamJson | [官方文档/源码](https://raw.githubusercontent.com/uhop/stream-json/master/README.md) |
| betterSqlite | [官方文档/源码](https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/README.md) |
| betterInteger | [官方文档/源码](https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/docs/integer.md) |
| runners | [官方文档/源码](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) |
| appleNotary | [官方文档/源码](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) |
| sqliteFts | [官方文档/源码](https://www.sqlite.org/fts5.html) |
| utility | [官方文档/源码](https://www.electronjs.org/docs/latest/api/utility-process) |

包级详细日期/许可/peer 见来源 JSON，不重复复制为另一份版本真相。特别检查 Forge experimental、node:sqlite RC、Svelte Table v9 runes 支持以及 electron-vite/Vite/Svelte 插件版本范围。方案评审时重新核实，不将本报告的版本永久视为 latest。
