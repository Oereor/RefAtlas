# Phase 2A：架构评审收尾

日期：2026-10-03（UTC+8）。应用基线：`e049ab4 Complete Phase 2A investigation`，开始工作树干净。外部只读数据基线：`724b139d8c9c32d12552eb95745a4fee72bfe48b`，开始工作树干净。

**Phase 2A investigation：CLOSED / REVIEWED；Phase 2 production implementation：NOT STARTED。** 本轮依据用户的 Phase 2A Review Closeout 请求及确认的收尾计划，将明确接受的原则正式归档。交付是 architecture/documentation closeout，不表示 parser、查询、索引、搜索或 localization 已生产实现。

## 1. 正式接受的架构决定

本轮接受的依据是用户明确评审结果，而非调查 recommendation 自动升级：

- SourceAddress + JSON Pointer 定位原始 JSON Node；Structural Record 只是显式容器直接 child 的浏览角色，Logical Entity 由未来契约赋予。
- Pointer 是地址真值；SourceRange 是 nullable、version-bound、rebuildable 的访问元数据。
- parser 接受能力契约，类型、numeric lexeme、资源约束与所有路径 raw semantics 一致，具体库可替换。
- 搜索完整性是正确性要求，延迟是优化问题；基础 SQLite 可重建，accelerator coverage 不决定搜索 coverage。
- source workspace 严格只读；外部 revision 改变后 stale/invalidate/reload/reindex，不恢复跨版本逻辑身份。
- 从第一批 Phase 2 production UI 起建立 UI-only、集中且类型化的 localization 和 formatting 边界。
- 功能测试验证行为和稳定语义，不依赖具体译文；localization 专项测试验证消息与格式。

已接受不等于已实现。当前约束由 [PROJECT](../PROJECT.md)、[ARCHITECTURE](../ARCHITECTURE.md) 与已接受 ADR 表达；本报告记录接受范围和收尾证据，不能替代规范文档。

## 2. ADR 与文档变更

| ADR | 本轮操作与职责 |
| --- | --- |
| [ADR-0007](../decisions/ADR-0007-node-addressing-and-source-lifecycle.md) | 新增已接受：NodeAddress、结构浏览、只读来源与 revision lifecycle |
| [ADR-0008](../decisions/ADR-0008-parser-capability-contract-and-source-ranges.md) | 新增已接受：parser capability contract、一致 raw semantics、SourceRange 能力及边界 |
| [ADR-0009](../decisions/ADR-0009-search-completeness-and-optional-acceleration.md) | 新增已接受：完整搜索、可重建缓存、回退与 optional accelerator |
| [ADR-0010](../decisions/ADR-0010-ui-localization-boundary.md) | 新增已接受：presentation localization、raw/protocol/formatter 与测试边界 |
| [ADR-0002](../decisions/ADR-0002-lossless-raw-data-and-bounded-access.md) | 仅增加日期补记；地址由 ADR-0007 细化、parser/range 由 ADR-0008 补充，无损和有界原则继续有效 |
| [ADR-0004](../decisions/ADR-0004-deterministic-search-semantics.md) | 仅增加日期补记；ADR-0009 补充覆盖/加速原则，原确定性方向继续有效，Text 与 APP 翻译区分 |

ADR-0001/0003/0005/0006 保持原样。新 ADR 分别承担定位/lifecycle、解析/range、搜索/index、presentation 四个长期问题，不为页大小、错误枚举、表字段或某个库建立重叠决定。

同步 PROJECT、ARCHITECTURE、STATUS、ROADMAP、DEVELOPMENT-PROCESS、AGENTS 和文档/应用/决策/调查入口。旧调查只追加日期明确的评审补记，正文、实验数字及当时“待评审”状态保留；PERFORMANCE 的口径与基线不变。

## 3. 调查推荐中被接受的部分

| 主题 | 已接受原则 | 接受限度 |
| --- | --- | --- |
| raw value | 原始六类型、numeric lexeme、出处和安全转换边界 | 不接受某个具体 RawValue union 或 helper |
| 地址 | SourceAddress + Pointer 的 NodeAddress | 不沿用 RecordAddress 作为底层事实命名，不创建实体身份 |
| 结构浏览 | 显式 collection/container 的直接 child 可作 structural record | 不保证完整返回，不猜 wrapper/metadata/entity，不锁默认列表策略 |
| 范围与 parser | 版本绑定可重建范围、可替换能力契约 | 不接受调查库及偏移适配为生产方案 |
| 索引 | SQLite 为可重建基础 cache/index，raw JSON 为真值 | 可保存类型、词法、地址、字段、revision 等，不接受具体表结构 |
| 搜索 | 完整 raw scalar/field/file-path coverage，正确回退及可观察状态 | 不默认全 scalar trigram，不锁 planner 或匹配选项 |
| 后续阶段 | first slice 应小且优先 raw access foundation | 只是建议，不授权实施或锁定完整阶段拆分 |

调查已提供样本、范围、搜索和 IPC 证据；证据本身仍有采样和实验环境局限。新增只读产品边界、revision 政策、UI localization 及测试约束来自本次用户确认，不声称这些新增内容在历史实验中已验证。

## 4. 仍为候选与延后事项

| 内容 | 当前状态 | 后续需解决的问题 |
| --- | --- | --- |
| `@streamparser/json` / `stream-json` | production prototype candidates | 持续分块、取消、巨大 scalar、范围恢复与路径一致性验证 |
| RawValue、safeInteger 附件、特殊 Unicode/重复键策略 | 具体表示候选 | 用统一 adapter 明确行为与边界，避免不同路径静默分歧 |
| Query API 操作/线格式/code 全集 | 接口候选 | 受控标识、revision、预算、取消和错误的实际协议 |
| SQLite tables、键/索引、存储编码 | schema 候选 | 覆盖、完整内容与来源回退、更新重建、实际容量 |
| hash/stat/watcher 组合、cache 布局 | 实现候选 | 可靠变化检测、race 处理、失效与恢复成本 |
| Exact 相等、BINARY/case/normalization、分页顺序/参数 | 匹配与访问候选 | 在类型/词法保真约束下明确行为并验证 |
| 64 KiB envelope、48 KiB full value、1,000 nodes、depth 8 等 | 初始实验建议 | 完整产品链路实测；不修改/继承 foundation 16 KiB 为产品上限 |
| trigram 启用与文件/语言覆盖 | optional accelerator 候选 | 完整数据集容量、性能与 candidate completeness |
| Paraglide JS、初始 locales（如 zh-CN/en） | localization 实现候选 | 首批正式 UI 的最小合理集合与类型化 integration |
| 全量索引、端到端延迟/内存目标 | 未实现、未测 | 不将本机采样或敏感性外推升级为产品 SLA |

Dataset Contract、引用、graph 留在 Phase 3；签名、公证、发布仍属独立后续工作。无任何候选因本次 closeout 自动成为已接受实现细节。

## 5. Node / Structural Record / Logical Entity 的最终区分

JSON Node 是原始 value，根、array 成员、object 属性值、container 和 scalar 都可以定位。例如 `""`、`/0`、`/0/AvatarID`、`/0/AvatarName`、`/0/AvatarName/Hash` 是位置，不自带 Avatar 语义。

Structural Record 是浏览指定容器时赋予直接 child 的角色。例如选 root array 列出 `/0`、`/1`；选 `/Events` 列出 `/Events/0`、`/Events/1`。scalar dictionary 和混合对象同样可浏览，不要求对象或 ID 字段。designation 不改变 Node 事实，也不承诺整体 materialize 或一次 IPC 返回；巨 Node 仍需摘要、分页或有界片段。

Logical Entity 由 Phase 3 的显式 Dataset Contract / dataset adapter 定义。Core 不根据 ID/value/name 猜实体、metadata、wrapper 或逻辑身份，不自动 flatten 以“找到实体”。这是 JSON Node ≠ Structural Record ≠ Logical Entity 的最终边界。

## 6. Pointer / SourceRange / parser contract 的关系

```typescript
type SourceAddress = { workspaceId: string; relativePath: string }
type NodeAddress = { source: SourceAddress; pointer: string }
type SourceRange = { startByte: number; endByteExclusive: number }
```

上述类型是接受的概念契约，本轮没有写入 production src。Pointer 使用根 `""` 与 `~0`/`~1` 转义，是物理定位真值。SourceRange 是原文件字节坐标上的半开区间，可空、随 revision 绑定、可重建；不是 identity，不代替 Pointer，不跨 revision 迁移。

parser adapter 保留六类型及 numeric lexeme，unsafe number 不先经过 JS number；支持大文件 bounded/streaming、巨大 scalar 资源边界、source range 产生或恢复、取消与限制。indexing、range-read、search 不允许产生不同 raw truth。成熟库隐藏于可替换 adapter 后；生产范围回读必须验证 UTF-8/BOM/转义/空白/分块与源变化，不将调查的 Buffer 实验等同恒定内存方案。

## 7. Search completeness / accelerator 的关系

完整搜索覆盖 raw scalars、field names、files/relative paths，匹配结果只是原始观察。SQLite 是可重建索引，保存类型/词法/text/provenance 等，不把 raw number、ID-like value 或大 hash 强制压成 INTEGER。Exact/Contains/Field/File/Text 方向沿用 ADR-0004；Text 是原始文本，不是 APP UI 翻译。

Search coverage ≠ acceleration coverage。Trigram 可作为 Contains/Text 候选生成，但不默认用于全部 scalar；未加速、特殊或未索引来源仍经 bounded scan/instr/source streaming fallback。最终 literal verification 可去假阳性，却无法补回 candidate 遗漏；不以 preview 替代完整搜索内容。短查询不提前自研复杂单字/双字倒排索引。

慢搜索允许 searching、progress、coverage、partial results 和 cancellation。未覆盖完 scope 的结果、取消/失败/资源限制不能标成 full workspace search completed。具体 API、批次、状态枚举和 UI 仍未实现；完整数据集测量后才决定 accelerator 启用范围。

## 8. 只读来源与 revision invalidation

当前 raw source 是只读 viewer / investigation 来源。应用可写自己的缓存目录，source workspace 不写；不设计编辑、保存、合并、冲突解决、undo/redo、事务写入或格式改写。

外部变化按 `old revision → stale → invalidate → reload/reindex → new revision` 处理：旧范围和文件索引失效，旧视图提示 stale；新 revision 可尝试相同 Pointer，但不保证同一 logical entity。位置不存在即表达 location no longer exists，不按 ID、值或 heuristic 恢复，不追踪 array reorder 的“原记录”。

目标是可靠检测并响应 source change，不要求每次 read 重新 hash 全文件或数据库级 strict snapshot isolation。检测与 race 行为需实施时验证，不能继续信任已知 stale 元数据；tabs/history 保留物理定位和 revision 上下文，不用 range 冒充长期身份。

## 9. i18n/l10n boundary

首批正式 Phase 2 UI 起，APP 按钮、菜单、标题、对话框、tooltip、empty/loading/searching、用户错误、a11y 和其他 message 经过集中、类型化 localization layer。locale-specific 文案不散落组件、业务逻辑、Data Service、IPC、parser 或 SQLite。

raw field/string/numeric lexeme/path/Pointer/NodeAddress 永远尊重来源：`AvatarID`、`DamageType`、`Ice` 不因 APP locale 翻译，`1.00`、`-0`、`1e3` 不做 locale 数值改写。APP 自有 date/time/count/byte size/普通 UI number 经共享 `Intl.*` formatter。

内部协议用稳定 code，例如 SOURCE_CHANGED/STALE_CURSOR/RESOURCE_LIMIT/INVALID_JSON；presentation 按 code 和参数翻译，locale 无需传到 Data Service。code 示例不锁定协议全集。Paraglide JS 只是候选；集中 message sources 为权威，generated artifact 不手工维护。本轮没有 runtime、catalog、locale selector 或 formatter 实现，也没有 localization 库实测。

## 10. Test Policy 更新

AGENTS 与 DEVELOPMENT-PROCESS 增加：除 localization 专项测试，不以具体译文作为功能行为的核心断言。source-change 测试优先 stale 状态、稳定 code、可执行 reload 和 request/result 行为，而非“重新加载”字样。

优先 semantic state、machine-readable code、role、稳定 DOM/data identifier、可观察行为和控件可用性。专项 localization tests 可验证 messages 存在、参数生成、切换、fallback、formatter 和 raw 数据边界。继续现有风险/行为/边界/回归价值政策，不引入 test-count 或 coverage quota；本轮纯文档修改不添加机械源码字符串测试。

## 11. 留给 Phase 2 implementation 与首片建议

建议第一块 production slice：**Data Service / raw access foundation**，保持小范围：NodeAddress types、source revision、parser abstraction contract、只读 source lifecycle、bounded query primitives。需证明无损语义、源变化失效、取消和资源边界，再扩展后续功能。

首片不纳入 full search/trigram、Source Browser UI 或 Dataset Contract；不同时实现全部 SQLite schema 和产品 UI。后续浏览、Node/Structural Record View、有界 JSON、完整搜索、tabs/history 的拆分与顺序仍是建议。第一批正式 UI 另按 ADR-0010 建立 localization 基础；本次收尾不实施。

目前 parser adapter、revision 检测、生产 query/scanner/index/search、浏览/视图、i18n runtime、contracts/references/graph 均未因本轮启动。下一步是用户评审本次 closeout，再单独授权实现。

## 12. Validation 结果与局限

本轮实际检查如下；这些结果只证明文档、历史保留与变更范围，不宣称生产能力已经实现。

| 检查 | 结果与口径 |
| --- | --- |
| `npm.cmd run docs:check` | 通过，28 份 Markdown 的本地链接与锚点有效 |
| `npm.cmd run format:check` | 通过，受管生产文件无格式回归；Markdown 被现有配置排除，本轮没有运行全目录 formatter |
| `git diff --check` | 通过；首次检查发现 PROJECT/DEVELOPMENT-PROCESS 工作副本的 CRLF 提示，仅将这两份已修改文档规范为 LF，没有仓库 renormalize 或历史批量格式化 |
| 历史正文对比 | 临时 Node 检查移除新增日期补记后，与 HEAD 中 ADR-0002、ADR-0004 和 Phase 2A 调查逐字相同；未重写原决定或实验结论 |
| 变更范围与 index | 临时 Node 检查精确匹配 13 份修改、5 份新增 Markdown，staging index 空、应用 HEAD 仍 e049ab4；无生产 src/tests/scripts/package/lockfile/config、PERFORMANCE、tools 或 evidence 修改 |
| 新文档/whitespace/行尾 | 18 份变更文件为 LF，无尾随空白，单份小于 64 KiB；收尾报告具备 13 章节，无大型产物 |
| 当前入口一致性 | 对当前文档搜索旧 awaiting review/调查待评审、记录一等对象/单记录返回表述，无残留；历史调查及旧 ADR 原时态继续保留 |
| 外部 source 起止 | HEAD 均为 724b139d8c9c32d12552eb95745a4fee72bfe48b，工作树均干净；只读 Git 核对，未运行数据写操作 |
| 人工架构/diff 审查 | 四份 ADR 职责清楚，Pointer/range、Node/角色/实体、完整性/加速、raw/UI translation 和接受/候选边界一致 |

本轮没有新增性能实测，不重复 fingerprint 扫描或 Phase 0/2A 数据实验；历史样本一致性证据仍在原报告。没有 runtime 功能变化，按 expensive command policy 不执行 Electron build/package、native packaged smoke、全量测试。新 ADR 的 parser/搜索/revision/localization 不变量是后续生产实现验收要求，本轮没有以静态文档检查冒充 runtime 验证。

## 13. 最终 Git diff / 工作树状态

`git diff --stat` 如下。该命令统计已受管文件，不包含下面单列的 5 份未跟踪新文档；合计实际文档范围为 **18 份（13 修改 + 5 新增）**，没有删除文件。

```text
 AGENTS.md                                          |  9 +++-
 README.md                                          |  2 +-
 docs/ARCHITECTURE.md                               | 52 +++++++++++++++++-----
 docs/DEVELOPMENT-PROCESS.md                        |  6 +++
 docs/PROJECT.md                                    | 11 +++--
 docs/README.md                                     |  2 +-
 docs/ROADMAP.md                                    |  8 ++--
 docs/STATUS.md                                     | 26 ++++++++---
 ...DR-0002-lossless-raw-data-and-bounded-access.md |  2 +
 .../ADR-0004-deterministic-search-semantics.md     |  2 +
 docs/decisions/README.md                           |  6 ++-
 docs/investigations/README.md                      |  3 +-
 .../phase-2a-data-access-architecture.md           |  2 +
 13 files changed, 100 insertions(+), 31 deletions(-)
```

最终 `git status --short`：

```text
 M AGENTS.md
 M README.md
 M docs/ARCHITECTURE.md
 M docs/DEVELOPMENT-PROCESS.md
 M docs/PROJECT.md
 M docs/README.md
 M docs/ROADMAP.md
 M docs/STATUS.md
 M docs/decisions/ADR-0002-lossless-raw-data-and-bounded-access.md
 M docs/decisions/ADR-0004-deterministic-search-semantics.md
 M docs/decisions/README.md
 M docs/investigations/README.md
 M docs/investigations/phase-2a-data-access-architecture.md
?? docs/decisions/ADR-0007-node-addressing-and-source-lifecycle.md
?? docs/decisions/ADR-0008-parser-capability-contract-and-source-ranges.md
?? docs/decisions/ADR-0009-search-completeness-and-optional-acceleration.md
?? docs/decisions/ADR-0010-ui-localization-boundary.md
?? docs/investigations/phase-2a-review-closeout.md
```

应用 HEAD 与分支未变，staging index 空；所有修改留在工作树供评审，不 commit/push，不建分支/PR/issue。外部数据 HEAD 与干净工作树起止一致。Phase 2A CLOSED / REVIEWED；Phase 2 production implementation NOT STARTED。完成后停止，等待用户评审本次收尾；首个 production slice 仅为第 11 节的建议。
