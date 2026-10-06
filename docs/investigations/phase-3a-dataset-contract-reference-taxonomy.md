# Phase 3A：Dataset Contract Identity / Reference Taxonomy 调查

日期：2026-10-06（UTC+8）。状态：**INVESTIGATION COMPLETED / AWAITING REVIEW / STOP**。本文是调查证据与候选能力要求，不是 accepted Contract schema、业务关系声明或 production 验收。

核心结果：所选数据需要表达 localized object-key lookup、同一个 ID 对应多个等级记录、嵌套重复引用、带父级上下文的复合选择，以及 path → source/root。必须分别保存物理地址、引用 occurrence 和候选逻辑分组。匹配成功不证明语义；本轮没有把这些关系注册进 Core。

紧凑证据见 [evidence JSON](evidence/phase-3a-dataset-contract-reference-taxonomy.json)。其中 number 使用 `{kind: "number", lexeme: "…"}`，原始 string 使用 `{kind: "string", value: "…"}`；这是调查文件的编码，不是未来 Contract DSL。

## 1. 范围、基线与授权

用户明确授权按 Phase 3A 调查说明执行已确认计划：调查五个案例、创建中文报告与紧凑 evidence、同步必要状态和入口，随后等待评审。不 commit、push、建分支、创建 PR/issue 或修改远程状态。全程离线，无公网访问、代理配置改动或新依赖。

| 仓库 | 执行起始 HEAD | 分支 / 起始状态 |
| --- | --- | --- |
| RefAtlas | `93843fab250662ecfb9bd67669b9c22dec51f967` | `main` / clean |
| TurnBasedGameData | `724b139d8c9c32d12552eb95745a4fee72bfe48b` | `main` / clean |

计划模式只读预调查与执行阶段基线一致。执行阶段在进一步读取案例前，记录 11 个实际使用的外部文件的 SHA-256、size 和 mtimeNs。外部路径 `../TurnBasedGameData/` 严格只读；文件没有复制进应用仓库。

## 2. 已复核的架构与历史边界

已阅读 [AGENTS](../../AGENTS.md)、[文档入口](../README.md)、[PROJECT](../PROJECT.md)、[ARCHITECTURE](../ARCHITECTURE.md)、[STATUS](../STATUS.md)、[ROADMAP](../ROADMAP.md)，以及以下指定资料：

- [ADR-0011](../decisions/ADR-0011-search-scope-and-reference-first-direction.md)：Search discovers raw content; Dataset Contracts establish reference meaning。
- [Phase 0](phase-0-feasibility.md)、[Phase 2A](phase-2a-data-access-architecture.md) 与 [Phase 2A review closeout](phase-2a-review-closeout.md)：真实样本、精度和身份边界。
- [Search scope closeout](phase-2-search-scope-architecture-closeout.md)、[Slice F](phase-2-source-browser-slice-f-source-locator.md)、[Slice G](phase-2-source-browser-slice-g-find-in-source.md)：当前 discovery/find 范围与历史验收局限。
- 补充 [ADR-0007](../decisions/ADR-0007-node-addressing-and-source-lifecycle.md)、[ADR-0008](../decisions/ADR-0008-parser-capability-contract-and-source-ranges.md) 及现有 FEFF 调查。

当前真相来自 STATUS、accepted ADR 和 PROJECT/ARCHITECTURE；历史调查中的 OPEN、旧 Search 要求或当时“未实现”字样不触发重启旧工作。F/G macOS 未验收及历史 Windows runner 局限继续保留，本轮不补做平台 gate。

接受的边界继续有效：`JSON Node ≠ Structural Record ≠ Logical Entity`；`SourceAddress = {workspaceId, relativePath}` 与 `NodeAddress = {source, pointer}`；SourceRange 仅为 revision-bound acceleration metadata。Core 不由值相等、相似字段、文件名、ID-looking 值、AI 或 wrapper flattening 建关系。Reference resolution 不执行 unconstrained workspace-wide content search。

## 3. 方法、证据等级与复现口径

**FACT** 表示可重复的原始值、类型、地址、存在性和限定 scope 内的匹配集合；**OBSERVATION** 表示这些事实的结构特点；**HYPOTHESIS** 表示尚未得到正式声明支持的业务关系、实体定义或语义选择。章节中的语义候选均明确属于 HYPOTHESIS，不能当作验证过的 edge。

本轮 Python 3.13.5 在独立调查进程中使用标准 JSON decoder：`parse_int`、`parse_float` 返回专用 `Num(str)`，在输出 evidence 前转为显式 number/lexeme；原 string 保持另一类型。`object_pairs_hook` 拒绝受解析对象内的重复键，`parse_constant` 拒绝 NaN/Infinity。没有把 raw number 交给 JS number、float、SQL INTEGER 或默认 JSON.parse。

完整物化只限 AvatarConfig、AvatarSkillConfig、MonsterConfig、两个 RelicSet 表及选定 CharacterConfig，属于非生产检查，不构成未来 Resolver 的执行策略或内存承诺。Stage 只读取前 65,536 code points，以标准 `raw_decode` 解析前三条记录。TextMap 使用 UTF-8-sig line streaming 至 EOF，解析指定 key 所在的完整 member line，检查根括号及所选 key 的出现次数；未物化整份 TextMap。

TextMap 探针依赖本快照的一行一个 member 形态，只证明所选项的原值与未见同布局重复项，不是完整文件 grammar、全部 key 唯一性或 production parser 的验收。`utf-8-sig` 仅处理文件开头 BOM，保留 string 内 U+FEFF。所有调查 hash 都是原始文件指纹，不是业务 TextMap hash 算法的验证。

没有全库 schema mining、source catalog 重建或全库内容扫描。指纹与历史证据相同后复用 7,040 / 711 / 7,040 统计；新测量只为回答选定关系的目标数量、等级差异、复合约束和 source 存在性。

复现时按 evidence 的 relativePath 读取同一快照；用上述 decoder 取 source Pointer，再在声明的单个 target array 中比较原始 number 类型与 lexeme，或按指定 TextMap string key 访问。证据中的 `{relativePath, pointer}` 是离线位置描述，均绑定本次 TurnBasedGameData 根；没有伪造运行时 workspaceId，也不是完整 production NodeAddress。

## 4. 代表案例及选择理由

| 案例 | source / target | 新增调查价值 |
| --- | --- | --- |
| A | AvatarName.Hash → CHS/EN TextMap | number → string object-key、derived Pointer、localization dimension |
| B | Avatar.SkillList[] → AvatarSkillConfig | 同 ID 多等级记录；引用 occurrence 与实体/物理身份分离 |
| C | Stage.MonsterList[] 的显式成员 → MonsterConfig | object/array 嵌套、重复 source occurrence 和重复目标 |
| D | RelicSet.SetID + SetSkillList[] → RelicSetSkillConfig | source 父级上下文与数组值组合，决定复合目标选择 |
| E | Avatar.JsonPath → CharacterConfig source/root | 目标是文件及 root，不依赖业务字段匹配 |

C 不重复 B 的“数组里有值”发现：它额外要求定位 nested object member 且保留重复 occurrence。D 是真实的多成分 source selector，不只是目标表恰好有复合 discriminator。E 与 object-key/field lookup 的目标种类不同。未为扩大领域覆盖另选 Monster → Skill 或 Relic → Set。

## 5. Case A：AvatarName.Hash → TextMap

**FACT**：`ExcelOutput/AvatarConfig.json` `/0` 的 AvatarID 是 number `1001`，AvatarVOTag 是 string `"mar7th"`；`/0/AvatarName/Hash` 是 JSON **number**，原词法为 `6186714091647966180`，超过 JS safe integer。`AvatarName` 是原始嵌套 object，不能自动 flatten。

| 目标 source | 原 key 类型 / 内容 | Pointer | 原值类型 / 内容 |
| --- | --- | --- | --- |
| `TextMap/TextMapCHS.json` | string `"6186714091647966180"` | `/6186714091647966180` | string `"三月七"` |
| `TextMap/TextMapEN.json` | string `"6186714091647966180"` | `/6186714091647966180` | string `"March 7th"` |

**OBSERVATION**：在各自选定 TextMap source 中，本 key 各出现一次；目标是 object property 的 scalar value，不是携带 ID 字段的 object record。key 可作为原始 Pointer token，通用 Pointer 仍使用 `~0`/`~1` 转义。定位不需要对文本做 Contains/Exact search，也不涉及相同 ordinal。

**HYPOTHESIS**：`AvatarName.Hash` 是本地化文本引用。旁证为名称与 AvatarVOTag 一致、两种语言均存在对应 key；外部 README 的 TextMap Hashing 章节只说明 xxhash 的总体使用，没有逐字段定义、locale 选择或 reader 的引用声明。因此成功匹配与看似合理的名称不能升级成已验证业务关系。也没有在本轮计算 hash 来“证明”原文与 hash 的关系。

未来声明该关系时，至少需规定 exact source/structural location、source number 的接受形式、如何无损得到 key string、明确 locale → target source、key/Pointer 派生和每个选定 source 的目标基数。**这是有名的 number-to-key 转换规则，不是 Core 的跨类型 equality**。本样本是普通十进制整数；没有证据自动接受 exponent、decimal、负零或 string hash，也不定义它们的转换。

一个选定语言 source 对应一个目标；两个语言 source 是两个 context 下的目标，不是单语言内 ambiguity。没有预设 locale fallback、跨文件 shard 合并或 APP locale 自动绑定。若已适用的引用规则遇到 key 缺失，应表达目标未找到，不能改为“不是引用”，也不能悄悄换语言。该失败路径是 lookup 所需语义，未宣称本轮遇到 missing key。

provenance 必须保留源 number/lexeme、显式转换、locale/source 选择和目标 string key/NodeAddress；不能只返回显示名称。

## 6. Case B：Avatar → Skill

**FACT**：Avatar `/0/SkillList` 是六个 JSON number 组成的 array，每个成员只含 SkillID-looking 值，没有 Level。下面的匹配只限 `ExcelOutput/AvatarSkillConfig.json` 根 array 的 number `SkillID` 字段。

| source Pointer | lexeme | 匹配物理记录数 | Level | 全部 target record Pointers |
| --- | --- | ---: | --- | --- |
| `/0/SkillList/0` | `100101` | 10 | 1–10 | `/3983`–`/3991`，`/4571` |
| `/0/SkillList/1` | `100102` | 15 | 1–15 | `/2219`–`/2233` |
| `/0/SkillList/2` | `100103` | 15 | 1–15 | `/3992`–`/4006` |
| `/0/SkillList/3` | `100104` | 15 | 1–15 | `/4007`–`/4021` |
| `/0/SkillList/4` | `100106` | 1 | 1 | `/0` |
| `/0/SkillList/5` | `100107` | 1 | 1 | `/1` |

表中 Pointer 区间仅简写连续成员，evidence 保存逐个地址与 typed SkillID/Level。六个成员共 57 个不同物理目标；`100101` 的 Level 10 不紧邻 Level 9，不能以连续 array slice 定义该组。

**FACT**：`/3983` 的 `(SkillID, Level) = (100101, 1)`，`ParamList = [{Value: 0.5}]`；`/4571` 的 `(100101, 10)`，`ParamList = [{Value: 1.4}]`。差异字段为 Level、ParamList、SimpleParamList；两条 MaxLevel 都是 `10`。**OBSERVATION**：多条记录保存不同等级数据，不是可以去重的 raw duplicates。

历史 [Phase 0 evidence](evidence/phase-0-measurements.json) 中的 7,040 physical records、711 distinct SkillID、7,040 distinct `(SkillID, Level)` 在文件 SHA-256 相同的前提下复用。**OBSERVATION**：Level 是所选 SkillID 组的物理记录 discriminator；该复合组合在当前快照是候选记录键。它不替代 NodeAddress，不保证跨版本唯一或稳定身份。

**HYPOTHESIS**：SkillList 成员表达逻辑技能或全部等级 view；若契约声明按 source + SkillID grouping，一个候选 Logical Entity 可拥有多个 physical NodeAddresses。原字段没有足够信息独自选一个等级；本轮没有游戏 reader、官方业务 schema 或已接受规则支持 `Level = 1`。源码表恰好有 Level 1、数组中第一个匹配是 Level 1，均不能构成该选择的授权。

未来 deterministic scope 必须指定 AvatarConfig 的 SkillList member、AvatarSkillConfig root records、typed SkillID matching，以及返回整组还是显式逻辑分组/view。若用户以后要求单等级选择，必须另给 Level 的来源或声明的选择规则，不静默 first-match。B 证明最少要容纳多物理目标；“必须实例化 Logical Entity 对象还是返回 contract-defined view”仍待设计。

## 7. Case C：Stage → Monster 的嵌套与重复 occurrence

**FACT**：`ExcelOutput/StageConfig.json` `/0/StageID` 为 number `103201`；`/0/MonsterList` 是 array，其第一个 object 如下。

| source Pointer | number lexeme | `ExcelOutput/MonsterConfig.json` target Pointer / MonsterID |
| --- | --- | --- |
| `/0/MonsterList/0/Monster0` | `1022020` | `/502` / `1022020` |
| `/0/MonsterList/0/Monster1` | `1023010` | `/532` / `1023010` |
| `/0/MonsterList/0/Monster2` | `1022020` | `/502` / `1022020` |

完整检查 MonsterConfig 后，这两个所选 ID 各匹配一条 record；不是所有 MonsterID 唯一性的普查。前三条 Stage 的 MonsterList 形态保存在 evidence，不外推全部 29,515 条 Stage。

**OBSERVATION**：有 3 个 source occurrences、2 个 distinct target Nodes；Monster0 和 Monster2 的重复数值来自两个真实地址，不能在 source 侧合并掉。**HYPOTHESIS**：这些成员表示关卡怪物槽位；字段位置和目标 record 是旁证，wave/slot 的正式业务意义尚无声明支持。

候选 source selector 需要明确到 root record 下的 MonsterList array 和显式观察到的 `Monster0`、`Monster1`、`Monster2` 成员。不能为方便而把所有 nested number、所有 `Monster*` 字段或未知混淆字段都标引用。目标限定 MonsterConfig root array 的 typed MonsterID；Stage 同 record 的 Level 是其他原始信息，本轮不推断它参与怪物身份。

引用边需要保留两条各自的 `/Monster0`、`/Monster2` 来源；目标浏览列表可以展示两个 distinct Nodes，但不能因此抹去两条引用的证据。该案例要求 nested occurrence selection，与目标字段匹配及展示去重策略分离。

## 8. Case D：RelicSet 的父级上下文与复合选择

**FACT**：`ExcelOutput/RelicSetConfig.json` `/0/SetID` 为 number `101`，`/0/SetSkillList` 为 `[2, 4]`，成员均为 number；`ExcelOutput/RelicSetSkillConfig.json` 的目标如下。

| source member | 必需的 parent context | typed target pair | target Pointer | 只用 RequireNum 的匹配数 |
| --- | --- | --- | --- | ---: |
| `/0/SetSkillList/0` = `2` | `/0/SetID` = `101` | `(101, 2)` | `/0` | 62 |
| `/0/SetSkillList/1` = `4` | `/0/SetID` = `101` | `(101, 4)` | `/1` | 34 |

**FACT**：target `/2` 为 `(102, 2)`、`/3` 为 `(102, 4)`；`/0`、`/1` 的 SkillDesc 是 string `"RelicDesc_1012"`、`"RelicDesc_1014"`。仅使用成员值会产生跨 Set 的多个候选；加入 parent SetID 后两组各剩一个物理 record。没有假设 SkillDesc 自身是 TextMap key，也没有按字符串拼接产生新的关系。

**OBSERVATION**：这是从 source 两个位置取值，分别约束 target SetID 和 RequireNum 的复合 lookup。不同于 B：B 的引用值只给 SkillID，Level 是 target 的 discriminator；D 的 source 本身有两个选择成分，能限定所选具体 record。

**HYPOTHESIS**：SetSkillList 成员对应套装效果的 RequireNum；命名和成对记录支持候选解释，但没有正式 reader/契约证据。不能因为字段叫 SetSkillList，就假定数字 `2` 是一个全局 SkillID。

最少需要 source context extraction、绑定同一 parent record 的值、typed 多条件 matching、bounded target collection 和所选 pair 的基数检查。若 SetID 缺失，不应降级成只查 RequireNum；应区分 incomplete selector 与 lookup miss。所选 pair 各唯一是事实，不是全表 composite uniqueness 或已接受业务主键。

## 9. Case E：JsonPath → local source/root

**FACT**：Avatar `/0/JsonPath` 是 string `"Config/ConfigCharacter/Avatar/Avatar_Mar_7th_00_Config.json"`，工作区内该 regular JSON 文件存在，root 为 object，`/$type` 为 `"RPG.GameCore.CharacterConfig"`，SomatoType 为 `"MiddleAvatar"`。目标位置是这个 source 的 root Pointer `""`。

**OBSERVATION**：原字符串已经提供完整 workspace-relative source path，不必猜文件名、拼 AvatarID 或扫描所有文件找内容。root 是 JSON Node，不自动成为唯一 Character Logical Entity。path/root 定位不需要 target ID 字段。

**HYPOTHESIS**：JsonPath 是对应 Avatar 的 CharacterConfig source reference；文件存在和 `$type` 是结构旁证，不证明该文件所有内部 SkillList、Buff 或路径字段的语义。本轮没有追踪它们。

对照 **FACT**：同 record 的 DefaultAvatarModelPath 是 `"Characters/CharacterPrefabs/Avatar/Mar_7th_00/Avatar_Mar_7th_00.prefab"`，本地数据集中不存在。该原始资产路径并非已声明 JSON reference；不能将所有 path-looking string 都纳入 source Resolver，更不能把此缺失报告为已验证 broken reference。

如果未来声明 E，需指定 path 基于受控 workspace root、允许的 source 类别、target root Pointer 和现有 confinement/link checks。文件不存在是 target source absence；不通过 source stem/大小写/模糊匹配换另一文件。无需新增任意绝对路径读取权。

## 10. Identity taxonomy

| 概念 | 本轮依据 | 结论与边界 |
| --- | --- | --- |
| Physical Node identity | A `/…/Hash`、C nested scalar、E root | SourceAddress + Pointer；保存原始位置，无业务语义 |
| Structural Record | B root-array child、A keyed scalar value | 显式 collection 的 direct child 浏览角色；不等于 entity |
| Physical record discriminator | B Level | 区分同 SkillID 的记录；单独 Level 不是全局身份 |
| Candidate composite record key | B `(SkillID, Level)` | 当前快照唯一证据；不是 accepted PK 或跨 revision identity |
| Candidate logical entity key | B source scope + SkillID | HYPOTHESIS；需要契约定义 scope/group，不能 global ID 合并 |
| Logical Entity / physical members | B 一组 10/15 个 Nodes | 可声明 group/view；物理地址与每条 Level 数据继续独立 |
| Composite target selector | D `(SetID, RequireNum)` | 两个 source 位置共同选择；不要求“复合主键万能模型” |
| Reference source | A Hash、B member、C member、D member+context、E path | source occurrence 与 parent context 都需要来源地址 |
| Reference target / scope | 五案各自 source/collection | 明确文件及结构；同数字在别的 scope 无意义 |
| Target selection rule | A key、B/C typed field、D pair、E path/root | 选择与逻辑 grouping、cardinality 是不同职责 |
| Localization dimension | A CHS/EN | dataset context 选择 target source，独立于 APP 文案翻译 |
| Nested reference | C 与 A 的 wrapper | 显式结构 selector，不自动 flatten 或按字段名泛化 |
| Optional / nullable | A 补充 SimpleSkillDesc presence | 只确认缺失形态；业务 optional 尚为 HYPOTHESIS，未证明 nullable |

一份数据集可以同时拥有以上形态；不能强制所有记录用单字段 primary key，也不能把浏览记录数作为实体数。

## 11. Reference-shape taxonomy

这里是调查分类，不是预批准的 schema vocabulary。structural route、matching、结果基数和 context 是不同轴，不将它们塞进一个互斥枚举。

| 已有 raw 证据的形态 | 案例 | 需要的显式声明 |
| --- | --- | --- |
| source number → target object-key / derived Pointer | A | 接受 source 类型、key derivation、locale/source scope |
| array member → target record field，保留全组 | B | typed SkillID rule；多个等级 record 的返回语义 |
| nested object member → target record field | C | 明确数组层级和成员字段；保留 source occurrences |
| context + member → composite target fields | D | parent binding、两成分 matching、完整性和基数 |
| path string → source/root | E | workspace-relative source rule、root Pointer、访问边界 |
| many physical records → candidate group/entity | B | group scope/key 与成员地址；语义仍为候选 |

没有发现并验证 key → key 引用、任意 JsonPath 查询语言、通用多跳链、hash 计算规则或 conditional union target；它们不进入最低能力集合。“one-to-one / one-to-many”在下一节单独表达。

## 12. Physical Record、Logical Entity 与 cardinality

**OBSERVATION**：B 的物理重复 SkillID 是预期的数据分层；逻辑键若取 SkillID，group 会拥有多个 Nodes。若把 `(SkillID, Level)` 当逻辑技能身份，会把等级视为不同技能；若把 SkillID 当唯一物理身份，会丢掉升级参数。两个选择都必须明确表达，不能由 Core 默选。

| 案例 | 所选 raw 匹配基数 | 候选语义中的解释 |
| --- | --- | --- |
| A | 每个选定 language source 为 1 | 一个 localized target/context；跨语言数量另算 |
| B | 每个 member 为 1、10 或 15 | 多 physical targets 可预期；group/entity/view 的载体待评审 |
| C | 每个 member 为 1；3 occurrences 指向 2 Nodes | per-occurrence cardinality 与 distinct target count 不同 |
| D | 每个完整 pair 为 1；缺 parent 时会匹配 62/34 | composite selection 与错误的 broad match 必须区分 |
| E | 所选 path 为 1 source root | source/root 不自动拥有 Logical Entity 语义 |

上述匹配数量是 FACT；将“一条”或“多条”写成 Contract 的 expected cardinality 是未来声明。不能把所有多结果统一报 ambiguity；若声明单目标才检测 unexpected multiplicity。也不能承诺所有等级组永久固定为 10/15。

## 13. 最少 forward-resolution 信息

以下是必须存在于某个声明/上下文中的信息，不规定 JSON/TypeScript 属性名或调用 API。

| 案例 | source applicability / extraction | bounded target / matching | selection 与结果 context |
| --- | --- | --- | --- |
| A | exact AvatarConfig、record 下 AvatarName/Hash、number 词法 | locale 指定的 TextMap root object；显式 number-to-key、Pointer derivation | 每个 selected source 一个 scalar target；缺 key 可区分 |
| B | exact AvatarConfig、SkillList array member、number | AvatarSkillConfig root records；typed SkillID | 全部 matching Nodes，或显式 group/view；没有隐式 Level |
| C | exact StageConfig、MonsterList array、显式 member names | MonsterConfig root records；typed MonsterID | per-occurrence 结果，重复 source 仍保存 |
| D | exact RelicSetConfig、member 和同 parent SetID | RelicSetSkillConfig root records；typed SetID AND RequireNum | context 缺失不执行 broad lookup；完整 pair 基数 |
| E | exact AvatarConfig、JsonPath string | 受控 workspace 内指定 source path/root | target source kind 与访问检查；missing source 独立呈现 |

最少 source applicability 可用 exact relative path 和显式 structural route；不需要 path-family/glob、名称启发式或 generic expression language。target array lookup 的选择范围已受契约限定，可按需有界读取，不依赖 Global Search；本轮不决定缓存、index 或 streaming 实现。

## 14. Incoming References / Referenced by

**OBSERVATION / 架构后果**：同一组 forward declarations 能描述选定五案的反向边，不需要另发明“全工作区等值”规则。前提是反向执行仍只枚举声明适用的 source scope，并携带相同转换、上下文、选择、基数和 revision。是否持久化/增量更新、如何证明全部声明 scope 已覆盖是后续执行设计，不在本轮建立 index。

| 案例 | 生成合法 incoming edge 所需语义 |
| --- | --- |
| A | 指定 AvatarName/Hash source rule、无损 key conversion、selected TextMap source/locale；不是所有相等 number/hash |
| B | SkillList member applicability、AvatarSkill scope、SkillID matching、physical member/group 的反向归属 |
| C | nested member rule、各 occurrence 的完整 source Pointer；Monster0 和 Monster2 是两条来源 |
| D | 同 parent SetID 与 member 绑定；target `(101,2)` 不接受 SetID=102 的 `2` occurrence |
| E | 已声明 JsonPath source field、受控 source/root derivation；不是所有相似路径字符串 |

真实反例是 D：RequireNum `2` 在 target 表中有 62 条；仅 raw equality 会跨 Set 生成错误边。B 的 Level 也不是 source SkillList 引用值；A target string key 与 source number 不属于 raw 同类型 equality。E 的 prefab 路径对照说明“像路径”本身不产生 source edge。

最少需要边保存 source occurrence、rule 和解析 target(s)，以及 group membership 信息（如规则选择 group）；没有证据要求独立 reverse-only declarations。B 仍需评审“Referenced by logical skill”与“Referenced by 某等级 record”的展示/归属语义：可保存一条 occurrence → group，再由 membership 查看成员，不应默认伪造 15 条独立业务引用。C 则确有两个不同 source occurrences，不能与 B 的组展开混为一谈。

如果未来采用 Reference Edge Index，它只是 explicit forward semantics 的可重建派生结果，不能建立语义、以 partial coverage 冒充“无人引用”或跨 revision 继续返回旧边。

## 15. 最小 failure taxonomy

这里区分调查实际事实与未来操作需要表达的状态，不设计最终 error enum，也未注入 production 故障。

| 状态类别 | 案例依据 / 实测边界 | 最少区别 |
| --- | --- | --- |
| 不适用 / 未声明 | E prefab 对照，未知字段 | 没有适用规则，不代表已声明引用 broken |
| source 输入缺失或类型/上下文不完整 | 补充 SimpleSkillDesc absent；D parent binding | declared missing、optional absence、wrong type/incomplete composite 不混成 target miss |
| target source 不可访问/不存在 | E 成功定位所需前提；prefab 只为非引用对照 | 已适用规则下的 source failure；不切别的文件。JsonPath 实例未发生失败 |
| target key/record 缺失 | A direct key、B/C/D bounded lookup | 匹配 scope 已查完的无目标，不等于 not-a-reference；所选实例都找到目标 |
| 结果基数不符 / identity 不确定 | B 多等级与 D broad match | 多物理目标可能预期；只有与声明冲突才是 multiplicity failure。语义声明不足不能假装 resolved |
| stale / incomplete / raw access failure | A/B 地址与既有 ADR-0007/0008、FEFF | source/context/target revision 变化使旧结果失效；取消、资源限制、invalid raw 或 decoder defect 不得报完整无结果 |
| 声明无效或关系形态不支持 | A 转换、D composite、E path/root 的必要表达 | definition error 与 raw invalidity 不同；不要 fallback 到 heuristic Search |

前三类缺失与后四类诊断包含派生的未来要求，不冒充本轮实际出现的失败。`no target found` 与 `not a reference` 必须分开；未知语义、所选 source 未读完和确定 miss 也不同。

**FACT（A 的补充 presence 探针）**：AvatarSkill `/0` 没有 SimpleSkillDesc 字段；`/1/SimpleSkillDesc/Hash` 为 number `5424063220840392374`，CHS/EN 各有对应 key。**OBSERVATION**：类似文本字段在真实记录中可以缺失。**HYPOTHESIS**：若未来把此位置纳入文本引用声明，可显式允许 absent；不能只凭缺字段断言业务 optional。AvatarConfig 的 94 条记录中，AvatarName、AvatarFullName、SkillList、JsonPath 均存在，未见 null 或空 string/container；不外推全库，不建立 nullable、zero-sentinel 或 empty-string-sentinel 规则。

## 16. Contract provenance / explainability

以下信息应能跨未来 Contract/Resolver 边界保留；不是 Inspector UI、IPC 类型或巨大记录的返回要求。

- 声明的 identity/name 与可区分的版本、命中的 source applicability/extraction rule、完整 source NodeAddress、原始 kind 与 number lexeme/string value。声明版本的表达方式待设计，用于区分边依据而非建立永久实体身份。
- 所用 parent context 的地址与 typed 值（D 的 SetID）；explicit conversion（A 的 number-to-key）或 path derivation（E）；target source/collection 和 typed matching/selection rule。
- selected dataset context（A 的 locale/source）、完整 target NodeAddresses 或显式 group identity/成员关系、声明基数与实际 physical count；B 不能只给一个名称或 Level 1。
- source、context 与 target 的 revision，以及 complete/partial/failed 结果边界。range 可附加但不成为 identity；revision 变化后重新执行而非按相同 ID 迁移地址。

调查报告的语义证据等级不必照搬成最终运行协议，但 Contract 来源需要可解释。本轮不能把 HYPOTHESIS 伪装成某个已存在的 accepted contract name；也不返回全 source 内容来解释边。

## 17. 最小 Dataset Contract 能力要求

**以下是表达所选候选关系的最小候选能力，不是已经批准的业务规则或最终 schema。** 每项都有真实结构依据；确认关系、业务键与 optional 政策仍需评审。

| 能力 | 必需的最小含义 | 案例依据 |
| --- | --- | --- |
| M1：显式 source applicability 与 occurrence selection | exact source、显式结构位置、nested array/object member；不靠字段名泛匹配 | A Hash wrapper、B SkillList member、C nested Monster member |
| M2：类型保真与声明的转换 | 保留 kind/lexeme；同类型 matching 与显式 number-to-key conversion 分开，不普遍 coercion | A unsafe hash / string key；B/C/D number selectors |
| M3：bounded target scope 与三种定位入口 | object-key/Pointer、record fields、workspace-relative source/root；不转成 global search | A、B/C/D、E |
| M4：父级上下文与复合 selector | 引用成员可使用同 parent 的另一字段；完整两成分匹配，不能缺成分降级 | D SetID + SetSkillList[] |
| M5：独立物理身份、可声明分组与多目标 | Physical Node 保留；允许同一引用得到完整多记录集，并可显式赋予 group/entity/view 身份 | B SkillID 与 Level 的分离，参数确实变化 |
| M6：显式基数与 source occurrence | 区分 per-occurrence、physical targets、logical group；重复 source 不丢失 | A 单语言、B 1/10/15、C 3→2、D pair→1 |
| M7：明确 dataset localization context | 明确语言选择的 TextMap source，保留到结果/provenance；不把 APP locale 或 fallback 当隐含规则 | A CHS/EN |
| M8：缺失状态、解析依据与可反向派生信息 | applicability/absence/miss/partial 区分，带 source/target/rule/context/revision；同 forward 声明提供 incoming 依据 | A presence 补证与 lookup、D context、B group、C occurrences、E source |

M8 要求支持声明的 absence policy，但不预先批准某字段 optional，也不添加 nullable/sentinel 语法。M5 要求可以区分实体/组与物理记录，不要求第一版必有独立 Logical Entity class 或永久 entity registry。M3 的 direct Pointer 能力只在可声明派生时成立，不把 array ordinal 猜成 ID。上述要求不指定 TypeScript property names、registry、query API 或 SQLite 表。

## 18. 尚未由证据支持的能力

- universal single-field PK、跨 source 的同 ID 实体合并、跨 revision 自动 identity migration，以及默认 Level=1/first-match。
- wildcard path family、任意 predicate/expression language、自动 flatten、field-name inference、fuzzy/AI relations、自动 schema mining。
- key → key 引用、多跳/recursive relation、conditional union targets、任意 join/transform、动态 hash 算法、业务计算和全数据集图。
- locale fallback、split TextMap source 优先级/合并、APP locale 自动决定 dataset locale、跨语言缺 key 补齐。
- nullable、Hash=0、空 string/list 的业务 sentinel 政策；SimpleSkillDesc 的具体 optional 语义仍为候选。
- 独立 reverse-only DSL、persistent Edge Index、SQLite reference schema、background full-workspace enumeration。前向声明语义足以描述本次反向需求，执行存储策略尚无新增测量依据。

这些并非永久拒绝，只是不进入当前最低集合。已经 accepted 的 raw/revision/resource invariants 不因未新增测量而取消。

## 19. 下一次设计评审与 FEFF 依赖

### 真正未决的问题

1. 将哪些候选关系明确接受为 dataset declarations？现有 README/JSON 没有逐字段规范；需决定维护者审定的声明及其证据出处，不能用此次匹配直接生成“已验证边”。
2. B 采用全部 Nodes、Logical Entity grouping 还是 contract-defined view？确定 logical skill 与某个 Level record 的 incoming 归属；若要单等级结果，补充 Level 选择的显式来源。
3. A 的 locale/context 由谁提供，first slice 覆盖哪些明确 TextMap sources？缺 key 不 fallback 是本轮分析边界，未批准完整 localization policy；是否接受样本十进制整数到 string key 的规则？
4. 先支持哪些 shape 的最小 schema/API，如何表达 source route、D parent binding、基数和 provenance？absence policy 对 SimpleSkillDesc 如何审定？这些是设计问题，不应再扫描全库来代替决定。

### 下一 Phase 3 slice 的输入

本报告可作为最小 Contract schema/API 的设计输入，先审定 M1–M8 与五案语义，再选择 implementation slice。建议设计中以 A 的 direct-key 和 B 的多记录行为验证不能简化的边界，以 C/D/E 检查最小模型是否遗漏 nested/context/path。不是授权同时实现全部形态、registry、Resolver、Incoming References、Inspector 或 graph。

没有新增/更改 public API、types、IPC 或生产接口；也没有更改 accepted ADR、PROJECT、ARCHITECTURE、ROADMAP、PERFORMANCE 或历史调查。状态同步只记录本轮 investigation 已完成、待评审，不规范化候选结论。

### FEFF：仍 OPEN，未修复

**FACT**：独立 raw 探针确认 `TextMap/TextMapJP.json` `/7505878640962067595` 的 decoded value 为 `"\uFEFF{F#私}{M#俺}が大魔王？マジで？"`，第一个 code point 是 U+FEFF。当前 production raw-parser 导入 @streamparser/json Tokenizer；本地 dependency 的 string accumulator 仍使用未设置 ignoreBOM:true 的分段 TextDecoder。复用既有 [full-dataset fidelity 证据](phase-2-search-architecture-full-dataset-investigation.md) 与 [Round 2 prerequisites](phase-2-search-candidate-source-index-investigation.md#25-feff--duplicate-key-prerequisites)，没有重跑或修复 production decoder。

这不阻止本轮讨论 object-key/Pointer 或 Contract 能力，但在独立修复与验收前，**不能接受依赖该 decoder 的 production TextMap value resolution、Inspector/reference text preview 或声称无损的 localized-text result**。即使 CHS/EN 正常样本成功，不能据此关闭 JP/分块保真缺陷；调查 Python decoder 正确也不证明 production 路径已安全。address-only key 定位能力与 string fidelity 是不同验收边界。

## 20. 验证、只读审计、Git 状态与停止点

验证结果和起止文件指纹由紧凑 evidence 保存。最终检查包含：

| 检查 | 结果与口径 |
| --- | --- |
| 选定 evidence 复核 | 五案 source/target Pointer、kind/lexeme、全部 B 目标集合、C occurrences、D composite 唯一候选与 E source/root 已复核；非 production Resolver test |
| 历史计数复用 | Avatar/AvatarSkill/Monster/Stage/CHS 共 5 个 SHA-256 与 Phase 0 相同；不重跑全表 distinct census |
| docs:check / format:check | PASS；46 份 Markdown 的链接/锚点有效，受管文件格式符合要求；Markdown/evidence 不在生产 formatter 范围，无批量 rewrite |
| whitespace / evidence JSON | PASS；改动文档 LF、无尾随空白，JSON 有效，数值 token 保留为 typed lexeme |
| Git diff --check / 变更范围 | PASS；仅报告、紧凑 evidence、STATUS 和调查入口，production files/accepted ADR 未改 |
| 外部 read-only audit | 起止 HEAD 相同，status clean，11 个文件 SHA-256/size/mtimeNs 全部相同 |
| app Git | HEAD/branch 不变，staging index 空；4 个 local working-tree 文档/evidence 变更，未提交 |

验证期间未运行 production tests、build、package、Electron/native smoke、Mac F/G gate 或全库基准，因为没有生产实现/行为变更。也没有新增 investigation 工具或依赖。首次 evidence 组装曾因历史 JSON 的 fingerprints 位于 scan 下而中止；检查实际结构并修正后成功。地址/类型/集合 replay 完成后，首次最终 audit 又因辅助函数 strip() 删除 porcelain 首行前导空格而误解析变更路径；核对原始 status 后改为只去除 CR/LF，精确四路径检查通过。这两次是调查辅助命令的错误，未改变 baseline、原数据、历史 evidence 或 production files，修正记录保留在 evidence。

最终 local diff/status：`docs/STATUS.md` 和 `docs/investigations/README.md` 修改；本报告及 `evidence/phase-3a-dataset-contract-reference-taxonomy.json` 新增。Untracked 文件不进入普通 git diff --stat，报告和 JSON 需一并 review。没有 commit/push/branch/PR/issue/remote mutation；外部来源始终只读。审计只能证明所列 Git/内容/mtime 起止一致和本轮命令未写外部来源，不宣称操作系统级原子 snapshot。

**STOP / WAIT FOR REVIEW。** 本轮交付到调查报告为止，不进入 Contract schema、Reference Resolver、Incoming References、Inspector preview、reference navigation/local graph、FEFF repair 或另一次 Search investigation。
