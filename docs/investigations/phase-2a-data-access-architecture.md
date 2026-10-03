# Phase 2A：原始数据访问与记录模型架构调查

评审补记（2026-10-03，UTC+8）：用户已确认的 Node 地址/结构浏览/只读 revision 原则进入 [ADR-0007](../decisions/ADR-0007-node-addressing-and-source-lifecycle.md)，parser 能力/范围进入 [ADR-0008](../decisions/ADR-0008-parser-capability-contract-and-source-ranges.md)，搜索完整性/optional accelerator 进入 [ADR-0009](../decisions/ADR-0009-search-completeness-and-optional-acceleration.md)，新增 UI-only localization 决定见 [ADR-0010](../decisions/ADR-0010-ui-localization-boundary.md)。Phase 2A 已 CLOSED / REVIEWED，Phase 2 production implementation 仍 NOT STARTED。下文保留调查时的状态、RecordAddress 命名、推荐和实测；具体库、RawValue/schema/API、匹配选项、预算、revision 检测和 trigram 默认覆盖未因评审自动接受。NodeAddress 是正式底层地址，Structural Record 仅为浏览角色；接受与候选对照、验证及下一步建议见 [评审收尾](phase-2a-review-closeout.md)。

日期：2026-10-03（UTC+8）。应用基线：`ced692a Closeout Phase 1A`，开始工作树干净。外部数据基线：`724b139d8c9c32d12552eb95745a4fee72bfe48b`，起止工作树干净。状态：**调查完成，候选设计待评审；Phase 1 CLOSED；Phase 2 产品实现 NOT STARTED**。

本报告是可评审的候选与证据，不是新增已接受架构。既有约束以 [ARCHITECTURE](../ARCHITECTURE.md)、ADR-0001–0006 为准；当前阶段见 [STATUS](../STATUS.md)。本轮没有生产数据功能、Dataset Contract、引用、产品 UI 或生产数据库。

## 1. 执行摘要

调查覆盖 21 个真实文件、267,002,888 原始字节：复核并扩展 Phase 0 的 15 个样本，覆盖小配置、数组、TextMap、嵌套数组、嵌套键值对象、scalar map、Story 与 Stages。15 个历史样本 SHA-256 全部一致，因此复用既有 137,916 JSON / 2.438 GiB 规模统计，没有重新扫描全库。另完成受限真实数据 SQLite、搜索、范围回读、子节点摘要、Node 序列化及 Electron Main↔Utility MessagePort 实验。

最重要事实：

- 样本包含 85,798 个超 JS safe integer 的整数 token、47,261 个超 signed64 的整数、447,607 个带小数点的 token，以及真实 `-0`。不能按文件小就采用 JSON.parse。
- 样本中的 numeric-looking string 仍是 string。Floor 的 `/DimensionList` 原始范围约 28.06 MiB，候选带类型表示约 43.60 MiB；流式顶层分项并不自动产生小记录。
- unicode61 MATCH 会漏掉中文短词、ASCII 子串及标点；literal verification 只能去除假阳性，不能补回遗漏。trigram 对三 Unicode code point 以上的受测查询保持完整，一、两字符需有界扫描回退。
- byte range 在固定源版本上的选定记录回读有效；偏移库有 BOM 基准问题，需要适配。宽对象树的传输成本还明显受节点数量影响。

推荐方向：**Data Service 拥有只读来源与可重建 SQLite 索引；保留带类型的 raw value；文件 + JSON Pointer 是物理地址；版本绑定的 byte range 是优化元数据；通过显式 collection pointer 浏览直接子值；有界 Query API 返回完整小记录或节点摘要／分页；Exact 使用类型与词法索引，Contains 使用 trigram 候选 + 字面验证与短词回退。**

建议用户集中评审三项长期取舍：structural record 的统一直接子值规则、parser/byte range 路线、全标量索引与搜索加速的磁盘成本。接口和预算在本报告中给出可验证初案，不要求用户逐项选择实现小细节。

证据：[机器可读测量](evidence/phase-2a-measurements.json)。复现：[调查工具](../../tools/investigation/README.md)。下文“实测”均限于该证据和明确注明的历史测量。

## 2. 真实数据结构发现

下表路径相对只读 TurnBasedGameData；记录数为根容器直接子值数，scalar 根的候选计数为 1。最大记录是原始 UTF-8 value 范围字节，不含对象成员键与分隔符；对象键由 Pointer 和 provenance 保存。它不是逻辑实体数，也不是 renderer 内存。

| 文件 | 文件字节 | 顶层／记录结构 | 直接记录数 | 最大记录字节 | 深度 | 数值／字符串特征 |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| ExcelOutput/AvatarConfig.json | 240,466 | array / object | 94 | 2,815 | 3 | 243 个不安全整数，decimal |
| ExcelOutput/EquipmentConfig.json | 132,304 | array / object | 170 | 794 | 3 | 170 个不安全整数，真实 -0 |
| ExcelOutput/RelicConfig.json | 209,615 | array / object | 774 | 269 | 2 | 普通整数、string |
| ExcelOutput/MonsterConfig.json | 4,534,605 | array / object | 2,722 | 8,377 | 6 | 5,443 个不安全整数，嵌套列表 |
| ExcelOutput/MonsterSkillConfig.json | 2,742,427 | array / object | 3,566 | 1,331 | 4 | 14,260 个不安全整数，decimal |
| ExcelOutput/AvatarSkillConfig.json | 11,438,925 | array / object | 7,040 | 2,295 | 4 | 35,056 个不安全整数；不按 SkillID 合并 |
| ExcelOutput/StageConfig.json | 26,939,432 | array / object | 29,515 | 1,890 | 4 | 68,827 个 numeric-looking string |
| ExcelOutput/SpecialAvatarRelicMainValue.json | 53,642,663 | array / object | 64,400 | 856 | 5 | 386,400 个 decimal token；未知原始字段 |
| TextMap/TextMapCHS.json | 52,399,646 | keyed object / string | 474,193 | 11,433 | 1 | 217 个 numeric-looking string；最长解码值 11,309 UTF-8 字节 |
| TextMap/TextMapVI.json | 73,607,269 | keyed object / string | 474,196 | 18,188 | 1 | 最大文件；最长解码值 18,026 UTF-8 字节 |
| Config/LevelOutput_Baked/Floor/P10401_F10401001_Baked.json | 29,480,186 | object / 大型嵌套 array 等 | 4 | 29,421,783 | 12 | `/DimensionList` 有 18 项，内层 GroupList 很大 |
| Config/SoundBankLookUp.json | 10,920,724 | object / nested array | 1 | 10,920,706 | 7 | `/Events` 有 22,301 项；单 event 可达 339,961 字节 |
| ExcelOutput/IdleLiveQuestionSpEquip.json | 52 | array / object | 1 | 44 | 2 | 极小文件，普通整数 |
| Config/Resolution/ResolutionAdaptionMapping.json | 305 | object / scalar dictionary | 1 | 286 | 2 | `/Configs` 的 11 个 string 成员，键含冒号／小数形式 |
| Config/GlobalConfig/RealtimeConst.json | 1,303 | object / 混合嵌套对象和数组 | 4 | 656 | 4 | `/StateHitLayerWeightMap` 是小型 numeric scalar map |
| Story/Mission/9999999/Story999999904.json | 1,308 | object / 多层 task arrays | 4 | 1,205 | 6 | 原始 `$type`、路径 string；不推断类型语义 |
| Stages/SceneConstValueConfig.json | 291 | object / scalar 与 array 混合 | 6 | 46 | 2 | scalar 与列表并存 |
| Stages/TAMonoTickLodSettingTemplate.json | 3,396 | object / nested keyed object | 1 | 3,370 | 5 | `/LodTemplateMap` 有 4 个 object 成员 |

其余 AvatarMazeBuff、ChallengeMaze、ChallengePeak 样本及所有分位数保存在证据。样本容器深度最大 12；TextMap 大对象的重复键检测在 100,000 distinct keys 后停止维护 Set，因此“未见重复”不等于证明全文件无重复键。

词法发现的边界：21 个文件共 1,945,792 numeric token，未见 scientific notation、fractional trailing zero，最长 20 ASCII 字节。真实等值异词法观察为 EquipmentConfig 的 `0` 与 `-0`；等值跟踪最多保存 50,000 个规范化样本，仅用于调查，不能作为无其他异词法的全库证明。`123.0`、`1e3`、`1.00` 与 2,049 字节数字均为明确标注的合成验证，不冒充真实数据。

整数 token 的前导零如 `01` 是非法 JSON，已验证拒绝；`1000` 的末尾零、`0.027648` 的小数前导零合法。string 中的数字形式不按 JSON number 规则转换。没有以 sample absence 推导全库 absence。

## 3. Raw Value 候选模型

推荐使用显式 discriminated union，禁止裸 JS number 作为原始数据事实：

```typescript
type RawScalar =
  | { kind: 'null' }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'string'; value: string }
  | { kind: 'number'; lexeme: string; safeIntegerValue?: number }

type RawValue =
  | RawScalar
  | { kind: 'array'; items: RawValue[] }
  | { kind: 'object'; entries: { key: string; value: RawValue }[] }
```

这是完整小值的表示，不能意味着任意 array/object 都能物化。大值用第 9 节的 NodeSummary；provenance 放在响应根，子 Pointer 由源顺序和原键推导，不给每个 scalar 重复附加完整文件路径。

object 用 entries 保留源成员顺序和原键，避免 JS object 对整数样式键重新排序，且不触发 `__proto__` setter。本轮 `{"10":1,"2":2,"01":3}` 的源顺序回读与分页通过。重复键在调查表示中可被观察到；生产初案对重复键文件报告 `AMBIGUOUS_OBJECT_KEY`，不让相同 Pointer 静默覆盖或声称唯一。原文片段仍可有界查看，源文件不修改。未来若需 occurrence address，应单独评审。

| 真实来源 | 原始值 | 推荐表示 |
| --- | --- | --- |
| AvatarConfig `/0/AvatarName/Hash` | 6186714091647966180 | `{ kind: 'number', lexeme: '6186714091647966180' }` |
| AvatarSkillConfig `/0/SkillTag/Hash` | 16752756560315677817 | number lexeme；不 CAST INTEGER |
| EquipmentConfig `/56/BattleDialogOffset/1` | -0 | `{ kind: 'number', lexeme: '-0' }` |
| StageConfig `/0/StageConfigData/0/MNDFOPKBHKP` | "1" | `{ kind: 'string', value: '1' }` |
| RealtimeConst `/StateHitLayerWeightMap/Idle` | 0.5 | `{ kind: 'number', lexeme: '0.5' }` |

safeIntegerValue 仅可在 token 是规范十进制整数、不是 `-0`，且先通过 BigInt 边界检查后附带；超安全范围、decimal、exponent 与负零在初案中保持纯 lexeme。附件只用于明确的显示／计算辅助，Exact、地址和缓存键始终使用原始类型与 lexeme。生产代码应禁止对 RawNumber 直接 `Number`、`parseFloat` 或隐式算术；需要转换时经过单一显式 helper，不把转换结果回写 raw value。

IPC 使用普通带类型对象与字符串，不需要把 BigInt 发到 renderer；可选的安全整数附件可省略。字符串保留解码值，转义写法、空白和原始拼写由版本绑定的源范围保留，不声称 decoded string 本身字节保真。

合成边界还发现：`\uD800` 能经 tokenizer 保留为孤立 UTF-16 surrogate，但直接写 SQLite TEXT 后变为 U+FFFD。推荐 string/field/key 的 Exact 键保存 `JSON.stringify(decodedString)` 的规范字符串字面量；well-formed Unicode 另存可用于 substring 的 TEXT。不良 surrogate 的搜索使用原解码值／来源回退，不把替换后的文本索引当真值。BLOB UTF-16 也可保真，但本轮不引入第二套常规存储表示。

## 4. Physical Address 候选模型

```typescript
type SourceAddress = { workspaceId: string; relativePath: string }
type RecordAddress = { source: SourceAddress; pointer: string }
type SourceRevision = { contentSha256: string }
type SourceRange = { startByte: number; endByteExclusive: number }
```

- relativePath 为相对工作区的原大小写路径，用 `/` 序列化；Main 选择根目录，Data Service 校验实际路径和 symlink 边界。renderer 不提供任意绝对读取路径。
- pointer 使用 JSON Pointer，根为 `""`，`~` 与 `/` 分别转义为 `~0`、`~1`。array `/0`、dictionary `/12518437936274253375`、nested `/Events/10000` 均是物理定位；对象键不转换成数值。
- ordinal 只是某个 container 内的源顺序和分页游标，不是跨来源主键或 identity。byte range 与 revision 绑定，是可失效、可重建的访问元数据，不进入主地址。
- source 变化后，array 插入／重排会改变后续 Pointer 含义；对象键成员顺序改变可保留 Pointer，但值仍可能变化；空白变化只会改变 range。没有可跨任意更新保持实体身份的物理地址。
- tabs/history/search result 将保存 RecordAddress 与 lastSeenRevision。重开时核对版本并明确提示来源已变；不按同值 ID 自动迁移到另一条记录，不保存 file handle 或裸 range。

生产刷新初案：索引建立时计算 hash；工作区 reopen／显式 refresh 校验版本；读取前后检查同一文件句柄的 stat，结合 watcher 使已知变化立即失效，不复用旧 range。stat 与 watcher 是优化，不是密码学证明；同尺寸、保留 mtime 的外部改写可能需要重新 hash 才能发现，本轮没有实现强快照一致性。来源持续变化时应失败或重试一个明确的新版本，不能把混合版本标成成功。范围基准不包含每次重新 hash 全文件的代价。

文件和 byte count 是资源元数据，不是 JSON 数值事实；当前值在 JS safe integer 内。超过安全元数据范围需明确 `RESOURCE_LIMIT` 或十进制字符串扩展，不能静默截断。

## 5. Structural Record Boundary

推荐一个不用字段语义的统一规则：**在显式选定的 JSON container 中，每个直接子值是一条可打开的 structural record；根和任意选定子树自身也可打开。默认 collection pointer 是根。**

| 结构 | 默认列表 | 向内导航 |
| --- | --- | --- |
| top-level array | `/0`、`/1`… | 选定成员的属性／数组子项 |
| top-level keyed object / TextMap | 每个原始键对应 value record | scalar 可打开；键只是地址成分 |
| wrapper object with array | 如 `/Events` 是可打开 array record | 显式 collection `/Events`，列出 `/Events/0`… |
| nested keyed object | 如 `/LodTemplateMap` | 显式 collection 后按原键列出成员 |
| 小 scalar map | 每个 scalar 成员 | 不要求 object 或 ID 才能成为 record |
| mixed object | 每个直接子值，包括 metadata scalar | 不猜哪个成员是真实体集合 |
| root scalar / empty container | scalar 根一项；空容器列表为空 | 根仍可打开 |

该规则刻意不自动 flatten 单 wrapper、按 ID 划界或跳过“看起来像 metadata”的键。record count 必须带 collection pointer；同一文件的根有 1 条、`/Events` 有 22,301 条并不矛盾。行大小只决定返回策略，不改变记录边界。

index 初案只持久化根直接记录和实际需要的 collection 记录范围；更深的任意节点可按需扫描父范围并建立有限缓存。不提前把每个 numeric array 元素都升级成持久 record 行；scalar 索引保留完整节点 Pointer，仍能从搜索命中打开节点。避免依照对象深度在数据库内制造大量重叠“大记录”。

覆盖 21 个样本的上述结构；root scalar、空集合、Pointer 特殊键与重复键由合成测试补充。未完成全库所有 JSON 变体、非 UTF-8 文件或恶意深度普查。**structural record != logical entity**；没有声明 SkillList 指向某文件、TextMap 哈希对应某实体或 `$type` 定义业务 schema。

## 6. Query API 候选

候选运行边界仍为 Renderer → 窄 Preload → Main → Utility/Data Service。Main 只负责工作区对话框、权限、生命周期与请求编排，Data Service 负责 discovery、解析、SQLite、范围回读和搜索。以下仅为接口设计，没有修改现有 FoundationBridge。

通用 request 带 requestId；数据请求带 workspaceId，访问已知来源时带 expectedRevision。cursor 是不透明服务令牌，绑定工作区、索引代次、操作、scope 与查询参数；源或 generation 变化返回 `STALE_CURSOR`。文件按原大小写路径的 binary 顺序，成员按源 ordinal，搜索命中按文件路径／源出现顺序确定性分页。

| Operation | Request 的关键字段 | 有界 response | limit / cursor |
| --- | --- | --- | --- |
| openWorkspace | requestId；通过 Main 选择目录，不接受 renderer 任意 root path | workspaceId、generation、发现／索引状态 | 单工作区摘要；扫描后台分批进行 |
| getWorkspaceStatus | requestId、workspaceId | 发现文件数、完成／错误文件数、索引 coverage、任务进度 | 单摘要，无路径／标量全量清单 |
| listDirectory | workspaceId、受控 relativeDirectory、cursor、limit | 直接目录／JSON 文件摘要 | 默认／最大 100，且响应字节受限 |
| listFiles | workspaceId、directory scope、cursor、limit | relativePath、size、mtime、index state | 默认／最大 100 |
| getFileInfo | SourceAddress | shape、revision、根 recordCount、错误和可用 metadata | 未解析项为 unknown，不先阻塞扫描求计数 |
| listRecords | source、collectionPointer、expectedRevision、cursor、limit | RecordAddress、ordinal、kind、大小和 preview | 默认／最大 100，按直接成员分页 |
| getRecord | RecordAddress、expectedRevision | FullRecord 或 NodeSummary，含 provenance | 第 9 节预算；超限降为 summary，不截掉子树冒充完整 |
| getJsonChildren | node address、expectedRevision、cursor、limit | object key／array index、child address 与摘要 | 最大 100，同时受字节预算；长 key 只给 preview + 受控 continuation |
| readScalarSegment | address、expectedRevision、cursor、limit | decoded string 或 number lexeme 的片段、truncated、nextCursor | 默认／最大 4,096 code point／ASCII 字符，实际序列化仍检查 |
| search | workspaceId、mode、typed exact value 或 literal query、scope、cursor、limit | 物理 node/record address、字段／值 preview、coverage、nextCursor | 最大 100 命中；扫描不足一页时允许空页 + 进度 cursor |
| cancelRequest | requestId、targetRequestId | accepted | 控制请求，小固定响应，保留取消槽 |

初始 query 上限建议 1,024 Unicode code point、request 16 KiB；默认大小写敏感、不 normalize Unicode，空搜索串拒绝。Exact 输入是 RawScalar（number lexeme 完整且合法），Field/File 初案支持 explicit exact/contains match，Contains/Text 始终字面子串。显式 dataset ID 在 Phase 2 尚无契约，只能作为 typed scalar 查询，不增加 ID resolver。

错误沿用 Result envelope，并候选增加 `WORKSPACE_NOT_OPEN`、`NOT_FOUND`、`SOURCE_CHANGED`、`STALE_CURSOR`、`INVALID_JSON`、`AMBIGUOUS_OBJECT_KEY`、`RESOURCE_LIMIT`、`INDEX_NOT_READY`；保留现有 CANCELLED、BUSY、TIMEOUT、SERVICE_EXIT 等生命周期错误。禁止 SQL、文件句柄、任意 IPC channel 或任意路径读操作。错误消息不带巨大原文。

取消是 cooperative：文件按块、索引按事务批次，SQL 查询按有限候选范围执行，批次间让出 event loop；取消／退出不发布半成品 generation。better-sqlite3 的同步 SQL 不能由同线程 timer 在执行中打断，因此不能只给一条全表 instr 加 timeout 就声称可取消。初案限制每批扫描行数／文本字节，巨 scalar 使用分块来源扫描并保留跨块 substring overlap。查询 coverage 未完成必须显式表达，不把部分索引返回标成全工作区已完成。

## 7. SQLite 候选 schema

以下为可评审字段，不是 SQL migration。SQLite 归 Data Service 所有，better-sqlite3 方向沿用 ADR-0003；不引入 ORM 或实体语义。

| 表／索引 | 关键字段与键 | 用途 |
| --- | --- | --- |
| index_meta | schema_version、parser_version、boundary_version、workspace_fingerprint、generation、build_state | 配置／来源失效与可重建 generation |
| files | file_id INTEGER PK；relative_path TEXT UNIQUE BINARY；size_bytes、mtime、content_sha256、root_kind、root_count、scan_state、error | 文件发现与源版本 |
| records | record_id INTEGER PK；file_id；collection_pointer TEXT、pointer TEXT、ordinal、kind、source_bytes、byte_start/byte_end nullable、child_count | 根／已访问 collection 的物理记录；UNIQUE(file_id,pointer)，分页索引(file_id,collection_pointer,ordinal) |
| field_names | field_id INTEGER PK；name_exact TEXT UNIQUE；name_text TEXT nullable | decoded 原键的 canonical Exact 与可搜索 Unicode 文本 |
| field_occurrences | file_id、owner_pointer、field_id、ordinal；member range 可选 | Field 搜索能命中 scalar 与 container 属性；不能只索引 scalar 的最后一个字段 |
| scalar_values | scalar_id INTEGER PK；file_id、record_id nullable、pointer TEXT、source_ordinal、kind、exact_text TEXT、search_text TEXT nullable、source range、search_storage、accel_eligible | 每个原始 leaf 的类型、Exact、substring 与 provenance；UNIQUE(file_id,pointer) |
| scalar_fts（可选） | FTS5 external-content，rowid=scalar_id，trigram case_sensitive=1 | 有条件的 literal candidate generation |

外键／数字 PK 只是本地索引内部关联，不是业务 ID。relative path、Pointer、number lexeme、大整数 ID-like scalar、TextMap 对象键始终使用 TEXT；不对这些值建 INTEGER/REAL numeric affinity 或 CAST。null/boolean 用明确 kind 与固定 exact_text；string 与字段名的 exact_text 为规范 JSON string literal，number 为原 token。Exact 索引建议 `(kind, exact_text, scalar_id)`。

search_text 存完整可搜索 decoded 值或 number lexeme，不能拿截断 preview 代替搜索真值。well-formed string 可进入 FTS；特殊 Unicode、过大 scalar、未完成范围使用明确 source-stream-only 状态并参与确定性回退。Text 模式先限定原始 string，不把数字键本地化、不跨语言映射；TextMap 目录是本次真实采样 scope，初案通用核心仍可搜索所有 string。

Source Browser metadata 分工：

- directory、文件名、size、mtime 可低成本 discover/stat，并持久化 files；本轮沿用历史扫描，不声称重新测了 137k 文件发现。
- shape、record count、hash、byte ranges、scalar count 随解析得到；index 前显示 unknown/building，不为目录浏览先全解析。
- 读取前后 stat／可访问性实时检查；目录汇总由 files 聚合。深度分布、所有嵌套 childCount、长文本完整 preview 不预计算成 UI 数据。

索引放 Electron userData 下的 workspace-cache 目录，工作区真实根的 hash 区分缓存身份；根路径只存在服务侧。源目录只读，DB/事务/临时文件在可写缓存；可以重建，不写回外部数据。初始完整 rebuild 建新 generation，成功后切换；source refresh 以文件为单位原子替换相关行，查询游标绑定旧代次并失效。schema/parser/boundary 版本变化触发 rebuild；不把 Git HEAD 当作非 Git 工作区的唯一 revision。

容量证据：69,396 个真实 leaf 加 19 个合成 string，简化 scalars 表及 Exact/field btree 为 20.29 MiB；unicode61 为 23.48 MiB；trigram 为 30.17 MiB（约 +49% 对基础 DB）。它重复存路径／Pointer，与上述拆分 schema 不同，不能作为完整生产容量。

按该混合样本每行均摊，单个约 474k 行 TextMap 的粗敏感性外推约 139 MiB（基础）／206 MiB（trigram）；29 个等行数语言约 3.9／5.8 GiB。只是 `sample DB bytes / sample rows × assumed rows`，忽略真实语言长度、键重复、fields/records 新表、所有非 TextMap leaf、WAL/free pages、全量分词变化，不是容量估计或磁盘预算。**结论是需要分文件测量与磁盘检查，不能宣称 2.438 GiB 源数据的索引也只占相同体积。**

## 8. 搜索执行架构

语义沿用 ADR-0004；大小写敏感、无 Unicode normalization 是本轮推荐默认，检索原始解码内容，不做语义分词、embeddings、引用或 ID 合并。

| 模式 | semantic truth | 候选／执行 |
| --- | --- | --- |
| Exact | 同 RawScalar kind；string decoded 值精确相等；number lexeme 精确相等 | BINARY `(kind,exact_text)` btree；string canonical JSON 表示，number 纯 TEXT |
| Contains | literal Unicode substring；`%`、`_`、引号均字面 | 合格 ≥3 code point 查询用 trigram MATCH quoting + literal verification；其余分批 instr／来源流式 |
| Field | 原字段名 explicit exact 或 contains | field_names + field_occurrences；container key 也能命中 |
| File | 原 relativePath explicit exact 或 contains | files 表，路径 TEXT；不自动 lower-case 全部平台路径 |
| Text | 原始 string 中的 literal substring，可限定文件／目录 | 同 Contains 路线，只选 string；TextMap value 无损，键是字段／地址 |

`123`、`123.0`、`1e3`、`1.00`、`-0` 与 `0` 不因数学等值合并，`"123"` 不等于 numeric token `123`。真实索引样本中 `16752756560315677817` number 有 8 个命中，合成同字面 string 有 1 个，类型条件可明确区分。合成 SQLite 不变量另外验证全组 lexeme，无 INTEGER 溢出。

搜索实测输入：CHS 源顺序前 50,000 项、全部 AvatarConfig leaf、AvatarSkill/MonsterSkill 各前 7,000 leaf、RealtimeConst 全部 leaf。合成 string 仅补齐 snake_case、CamelCase、emoji、通配符、引号、NUL 和 normalization 对照。baseline 同时由 JS includes 的完整 ID 集合与 SQLite instr 交叉核对，没有用 LIMIT 100 掩盖遗漏。

| 查询 | literal 命中 | unicode61 验证后 | trigram 路线验证后 | 说明 |
| --- | ---: | ---: | ---: | --- |
| 拍 | 98 | 0 | 98 | trigram 短词回退；真实 CHS 96 |
| 拍摄 | 36 | 7 | 36 | 真 CHS 34；全样本另含 2 个合成 |
| 拍摄模式 | 1 | 1 | 1 | 本次此长词只在合成 string 存在 |
| Skill | 1,836 | 0 | 1,836 | 真实 ASCII 子串，不能当 token 相等 |
| Avatar_Mar_7th | 8 | 8 | 8 | 真实 snake_case 路径片段；unicode61 多生成 2 个候选 |
| 123 | 66 | 5 | 66 | 数字子串也不能只做 token MATCH |
| ABC | 1 | 1 | 1 | LIKE/unicode61 原候选 2 个，大小写 verification 去掉 abc |
| 🙂特殊 | 1 | 0 | 1 | 合成 3 code point 查询，不按 JS UTF-16 length 判长 |

另外验证 literal `，`、`🙂`、`%_`、`a"b`、CamelCase、snake_case、`é` 与 `e` + combining acute。全部 18 个查询的 trigram/回退集合和 literal truth 一致；大小写敏感、组合形式不合并。没有证明任意 Unicode/tokenizer 变体均完备。

LIKE 必须 escape `\`、`%`、`_` 并再次验证；SQLite 默认 ASCII case-fold 会产生额外候选，不能直接当最终结果。含 NUL 的 query 直接 instr 回退，本轮不依赖 LIKE/FTS query 的 NUL 处理。生产还需为非 FTS-eligible 行并入 source/literal 回退；遗漏这一支会让普通查询漏掉特殊来源。短查询不额外自研单字／双字倒排索引。

Field 实验计数来自简化 scalar 表的最后一级字段，不覆盖所有 container 属性；正式 field_occurrences 的覆盖、分页与容量需要下一阶段验证，不能把本轮 3,335 个 Hash 命中当作完整字段索引证明。

初案 query planner 先 scope，再按 scalar ordinal 分批；候选生成、字面验证、分页顺序共同保持确定性。候选分页和最终结果分页不等价，若本批 verification 不足 100 条，继续扫描或返回 progress cursor；不许把过滤后的空页当作搜索已结束。对未完成索引记录 coverage，不能声称全部来源无命中。

## 9. Bounded JSON 策略

原始字节、候选 RawValue 序列化字节与节点数是不同成本。所有受测典型 ExcelOutput 顶层记录都小于 16 KiB 带类型值；Monster 最大 15,097 字节，AvatarSkill 最大 4,785。CHS 最大 11,459，VI 最大 18,214，VI 有 4 个值超过 16 KiB。Floor 最大带类型值 45,719,080，SoundBank 的 Events 为 18,584,178，不能完整返回。

推荐用于下一阶段验证的初始策略，不是永久 SLA：

嵌套集合补充扫描按同一直接子值规则统计，表中 wire 是完整候选 RawValue，仍不含 envelope：

| Collection | 子记录数 | source p99 / max 字节 | wire p99 / max 字节 | wire ≤64 KiB |
| --- | ---: | ---: | ---: | ---: |
| SoundBank `/Events` | 22,301 | 1,675 / 339,961 | 2,695 / 531,949 | 22,271 |
| Floor `/DimensionList` | 18 | 1,995,960 / 1,995,960 | 3,104,587 / 3,104,587 | 0 |
| Floor `/DimensionList/0/GroupList` | 802 | 20,485 / 214,295 | 32,120 / 345,669 | 800 |

因此内层 records 通常更小，但仍存在需要摘要／分页的长尾；不能通过递归到任意固定层级就保证所有记录小。嵌套 keyed object／小 scalar map 的分布也保存在证据。

- query response 总预算 64 KiB（含 envelope、地址和 metadata），list/search 最大 100；foundation 控制接口 16 KiB 保持原职责。产品 bridge 将来需要独立 query policy，不直接改大 foundation LIMITS。
- 完整记录试用值预算 48 KiB、最多 1,000 节点、展开深度最多 8；预估不足时逐 token 累计，触限停止物化并返回 summary。最后仍按真实序列化结果检查 64 KiB，不按源文件长度决定。
- NodeSummary 包含 kind、address/受控节点 token、source bytes、已知 childCount、bounded preview、truncated；不是被截掉属性的 RawValue。超长 key/pointer 也进入摘要／受控 continuation，不能仅截断 string value 就宣称整个消息有界。
- object 属性与 array 元素均按 ordinal 分页；每个 child 默认摘要，不递归附带整个子树。长 string preview 试用 256 code point，完整内容通过 readScalarSegment 获取；长 number lexeme 预览另有 truncated 标志，不能冒充完整 number。
- 父容器巨大时只扫描所需范围并尽早停止，按需缓存有限 child ranges；源版本变化使该缓存失效。deep nesting 使用显式栈并设资源限制，读取预算与展示预算分离。

64 KiB 的依据是样本最长 string 值约 18 KiB，加上地址／分页仍有余量；Main↔Utility 实测约 80 KiB 的宽树中位 1.58 ms，约 320 KiB 为 6.47 ms，约 1.25 MiB 为 27.34 ms。它支持保守小包与节点约束，不能证明 renderer memory 或全桥性能。48 KiB、1,000 节点和 depth 8 是待 Phase 2B/Record View 实测修订的工程起点；本轮未做可见 UI memory/帧率实验。

真实子节点摘要实验：Avatar `/0` 40 个 child 为 5,136 字节；Floor `/DimensionList/0` 两个 child 仅 240 字节，但完整候选 RawValue 为 3,104,587 字节。当前实验为整段 token 扫描后只保留有限摘要，尚不能声称有 child index 或 O(page size) 访问。

任何 parser 的“streaming”都不自动保证单 scalar 的内存有界。@streamparser/json 会聚合完整 string/number；需部分 token 的资源监控／中止，或改用 stream-json 的未 packed chunk 路径。对于超大 scalar，Exact/Contains 要走完整分块真值，不能只索引 preview。巨 numeric token 超过输入 query 上限时明确 RESOURCE_LIMIT，不悄悄截断 Exact。

## 10. Parser 与 source byte range 路线

| 候选 | numeric lexeme | 流式／大 scalar | token position | 本轮结论 |
| --- | --- | --- | --- | --- |
| JSON.parse | 默认丢数值词法与不安全整数 | 整文件解码／物化 | 无 | 不作为未经无损处理的 raw parser；Phase 0 已证实真实舍入 |
| stream-json 3.7.0 | numberValue/numberChunk 保留原 token | chunk + 背压；pack=false 能不聚合完整 string | parser token 无公开 source offsets；verifier 错误位置不是完整范围 API | 成熟流式／长 scalar 候选；不使用默认 Assembler parseFloat |
| @streamparser/json 0.0.26 | 覆盖 parseNumber 返回 lexeme；默认 Number 不可用 | Buffer 分块；默认仍聚合 scalar；TokenParser 需禁止整根组装 | onToken 有 UTF-8 byte start offset；容器闭合 token 可计算 end | 推荐偏移原型候选，须适配 BOM／scalar end／类型声明与资源限制 |

0.0.26 固定版本来自官方 npm 元数据，通过已监听的 `http://127.0.0.1:7890` 安装到独立调查 package，`--ignore-scripts`；无 root production package/lockfile 变化。MIT、无运行时 dependencies；版本号仍为 0.0.x，不把“已实测”说成长期 API 保证。[官方源码](https://github.com/juanjoDiaz/streamparser-json)、[固定版本元数据](https://registry.npmjs.org/@streamparser%2fjson/0.0.26)、[stream-json](https://github.com/uhop/stream-json)。源码来源还复用 Phase 0 已存官方文档，不为普通数据调查拉取上游。

本轮实验用 tokenizer 识别字节语法，用 TokenParser 进行 grammar validation；`paths: []` + `keepStack: false` 避免默认聚合整根。观察器只维护 container/pointer/ordinal 与指标，不自研 JSON tokenizer。数值 override 在 JS 中返回 string，生产 TypeScript 适配不能因此混淆 number token 与 string token。

source range 证据：

- split size 1/2/3/7/65,536 覆盖 UTF-8 中文、emoji、转义、空白、Pointer 特殊键、容器与 scalar；所有受选 value range 可重新解析为相同带类型值。
- 0.0.26 接受 BOM，却从 0 计算偏移，导致原文件范围错 3 字节。适配显式跳过 UTF-8 BOM 后加回 3，针对性测试通过；不能照抄 onToken.offset 即认为绝对源地址正确。
- 容器 start/end 来自公开 token offset。string 的精确末尾需等待下一 token，再去掉范围尾部 JSON whitespace；实验利用完整只读 Buffer 验证，不读取 parser 私有字段。
- 生产版应改成有界源窗口／范围回读的 end 适配，验证长 whitespace、跨块尾部和异常源变化；本轮没有交付这个生产适配，不把 70 MiB raw Buffer 实验当作常量内存流式证明。

推荐 **Pointer + version-bound nullable byte range**：Pointer 是地址真相；范围是可重建加速，有范围优先受控回读，无范围按需 token scan。对顶层／已访问 container children 优先保存范围，不预存所有 scalar 的行列号／编辑器跳转信息。范围可以支持以后 snippet、偏移到行列的按需计算，但尚未实现 external editor jump。不能凭 byte range 推导增量文件编辑；源文件一变，先文件级重建。

解析路径建议：小范围用成熟 lossless token adapter 物化有界 RawValue；大文件使用 chunked token 扫描和批次 indexing；超长 scalar 使用 stream-json chunks 或显式受控失败后按流式路径重新处理。大文件／精度敏感文件不能走裸 JSON.parse；不同时无条件运行两套 parser。最终 parser 接受前仍需生产级持续分块、取消与失败资源证明。

## 11. 性能证据、方法与局限

实验环境 Windows x64，Node 24.21.0 / npm 11.16.0，better-sqlite3 13.0.3 / SQLite 3.53.4；Electron 44.5.1 Utility 内 Node 24.21.0。CPU/内存见紧凑证据。未清 OS 缓存，不宣称冷读、跨平台排名、并发负载或产品 SLA。结构每文件一次，查询预热一次后测 3 次；IPC 每 payload 预热一次后 10 次。3 次实验的 p95/p99 等同极值，不用于尾延迟结论；表只列中位数。

| 问题／方法 | 样本 | 结果 | 局限 |
| --- | --- | --- | --- |
| 完整 typed 记录还是摘要：token 统计 source/wire 分布 | 21 个文件 | 典型配置小；Floor 顶层 value 29,421,783 / typed 45,719,080 字节 | 保留完整 raw Buffer，无生产 streaming RSS 结论；不含 envelope |
| range vs pointer：已知 range read+token parse，与 stream-json pick 全文件 scan | SoundBank `/Events/10000`，123 字节 | 0.116 ms vs 128.08 ms | 不含建范围、每次 hash、IPC；pick once 只停输出，仍全文件扫描，不代表最佳提前停止 |
| 同上，大 nested record | Floor `/DimensionList/0`，1,995,960 字节 | 71.00 ms vs 303.78 ms | 大子树依然昂贵；必须避免完整物化 |
| 同上，小文件 | Avatar `/0`，2,658 字节 | 0.178 ms vs 3.84 ms | 缓存、Node/runtime 热态；不能外推为 UI 延迟 |
| 子节点摘要：扫描选定范围，保留最多 100 摘要 | Floor `/DimensionList/0` | 240 字节响应；扫描中位 68.18 ms | payload 有界不意味着查询成本有界；需早停／缓存 |
| SQLite partial index：相同 source rows，三独立临时 DB | 69,396 真 leaf + 19 合成 | 基础插入约 244–247 ms；unicode61 rebuild 255 ms；trigram 678 ms | 不含 source parsing；同步单连接、单事务实验，不代表生产可取消建库 |
| short literal 搜索 | 全 partial corpus，“拍摄” | instr 约 6.65–7.09 ms；trigram 路线回退约 7.49 ms | 全结果集合；没有全库、scope 分页或 UI；短词未加速 |
| 长子串候选 | 同 corpus，“Skill” | instr 约 5.50 ms；trigram 0.342 ms + verification | 1,836 命中；tokenizer 候选必须有完整性条件 |
| Unicode 跨进程传输 | Main↔Utility，真实 Avatar `/0` | 4,835 字节；RTT 0.122 ms | 无 renderer/Preload/UI，无 packaged gate |
| 相近字节量，宽树 vs 长 string | 合成 327,626 / 262,171 字节 | RTT 6.47 / 0.487 ms | 节点成本显著；echo 双向、一次进程对，不是完整产品链路 |

Node same-process MessageChannel、JSON.stringify、structuredClone 的 4–1,024 KiB 补充结果保存在证据，不能替代 Electron MessagePort。结构实验 RSS 高水位最高约 342 MiB，包含源 Buffer、统计数组与模块，非生产 parser / renderer memory。

本轮没有全量生产索引、冷工作区打开、跨平台真实数据访问、UI 内存／帧率、持续更新或 watcher 压力；性能证据保留在此报告，不修改 PERFORMANCE 的既有产品口径／基线。

执行失败也保留：首次 registry curl 在沙箱中遇到 Schannel credentials 错误，使用相同 7890 代理在获准本地环境成功；首次 Electron 探针被 Windows sandbox ACL 阻断并由 runner 停止，获准执行成功。不修改 ACL、不禁用 Electron sandbox，不延长 timeout 或使用旧成功报告冒充本次结果。

## 12. 后续 Phase 2 实施顺序建议

以下是评审后的建议顺序，名称与范围尚未锁入已接受 roadmap，本轮均未实施：

1. **数据服务与索引基础**：接受 record/address/parser 候选，建立 source revision、可取消扫描、文件级事务索引、容量检查和类型化 Query API；先证明特殊 scalar／BOM／变更源／崩溃与 payload 预算。
2. **Source Browser**：消费目录／文件 metadata、coverage 与结构记录列表，不等待完整索引才能显示文件；验证 137k 文件的分页与发现成本。
3. **Record View / bounded JSON**：完整小记录与摘要／分页、长 scalar 片段、nested collection；验证真实宽树、深度、renderer memory 和端到端预算。
4. **确定性搜索**：Exact/Field/File 后覆盖 Contains/Text，完成短词回退、trigram coverage、candidate pagination、scope 与取消；测真实全量索引空间后评审 accelerator 默认开启范围。
5. **Tabs/history/polish**：持久物理地址和 source-change 提示，缓存生命周期与恢复体验。这里只保存物理定位，不加入 contract logical identity。

每步使用已有双平台工具链，生产 IPC/native 边界变更才按 cadence 重验相应平台；调查收尾本身不重跑 packaged gate。Dataset Contract、出入引用和 graph 继续留在 Phase 3，签名／发布不在本轮。

## 13. 待评审事项与收尾验收

真正影响长期架构的用户评审项：

1. 是否接受“显式 collection 的直接子值”作为 Phase 2 structural record，包括 scalar／wrapper／混合对象；不自动 flatten 或猜 entity。
2. 是否接受 Pointer 主地址 + nullable version-bound range，以及 @streamparser/json 偏移适配原型／stream-json 长 scalar 路线；接受前需补齐生产流式资源与源更新证明。
3. 是否接受全 raw scalar/field coverage 的可重建 SQLite 方向与 trigram 候选；索引空间有显著膨胀风险，先按真实目录／语言测量，再决定默认 accelerator 覆盖。

其他初案明确为工程默认：typed lexeme、BINARY Exact、源顺序分页、userData workspace cache、64 KiB query envelope、48 KiB full-value、1,000 节点与 depth 8。用户可在报告评审中调整；不为每个表列、错误名或页大小新增 ADR。已有六项 ADR 的原则不重新请求接受，本轮不新增已接受 ADR。

Phase 1 housekeeping：STATUS/ROADMAP 明确 Phase 0 / Phase 1 / Phase 1A CLOSED，其他当前入口同步；历史 closeout 中“未关闭整个 Phase 1”仍保留为当时事实。`.gitattributes` 固定 `* text=auto eol=lf`，当前索引全部 LF，无 CRLF 专用文件，不新增复杂例外。仅必要工作副本行尾处理，未暂存或 renormalize，没有大规模格式 diff。

调查代码在独立 tools/investigation；只增加固定版 @streamparser/json 实验依赖，production package/lockfile 和 src 不变。三个临时 SQLite DB 均在实验 finally 中 close/remove；原始 artifacts、Electron profile、依赖／日志被忽略。长期证据约 85 KiB，不包含 DB 或原始数据 dump。外部起止 HEAD、干净工作树及 21 个样本 SHA-256/mtime 一致。

针对性检查覆盖八组风险：六类型／长 numeric token；UTF-8/转义/Pointer/分块范围；BOM／surrogate canonical TEXT；stream-json chunks；坏 JSON／重复键；ordinal 分页；source revision 失效；SQLite 类型与词法 Exact。搜索实验另以完整 literal ID 集合断言 LIKE 验证和 trigram/回退 correctness。

本轮实际验收：

| 检查 | 结果 |
| --- | --- |
| `npm run format:check` | 通过；生产受管文件无格式回归 |
| `npm run docs:check` | 23 份 Markdown 的本地链接／锚点通过 |
| `git diff --check` | 通过；必要工作副本已 LF，无大规模纯行尾 diff |
| investigation `npm run test:phase2a` / `npm test` | 8 / 6 组通过，既有调查工具无回归 |
| 所有新 investigation scripts 的 `node --check` | 通过；独立 `npm ls --depth=0 --offline` 有效 |
| source Git / 21 个指纹与 mtime | 起止一致，工作树干净；旧 15 个 SHA-256 匹配 Phase 0 |
| 生产 src/tests/scripts/package/lockfile/runtime config diff | 无变更；没有生产功能实现 |
| DB、probe 生命周期与忽略规则 | 三个实验 DB 已关闭／移除；探针无残留进程，专用 profile 已清理；raw artifacts/依赖被忽略 |

没有 commit、push、分支、PR、issue、上游改写、关系推断或产品 UI。下一步是**用户评审本报告**，不自动开始 Phase 2 产品实现。
