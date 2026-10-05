# 产品定义

## 定位

RefAtlas 面向开发者、逆向研究者和配置维护者，是桌面原始配置与显式引用调查工作台。首个数据集为 TurnBasedGameData，但不是 HSR 玩家百科或 HSR-Database 重制版。

目标是通过 raw data browsing、Dataset Contract、deterministic reference resolution、incoming references 与 reference navigation / local graph 减少跨文件重复调查，保留内部 ID、字段和出处。V1 discovery/find 范围为 Source Locator 与 active-source Find；历史、标签页、固定/比较和 diff 留作后续 UX 原语，不规定研究路径。

## 已接受原则

- 原始数据优先：JSON Node 是底层事实，以 SourceAddress + JSON Pointer 定位，保留类型、数值词法和出处。Structural Record 只是显式容器直接 child 的浏览角色，Logical Entity 由未来显式契约定义。
- 引用优先：跨配置导航是痛点，Avatar 不享有特权；覆盖装备、遗器、怪物、技能、Buff、关卡、终局、文本等。
- Core 无推断：相等数值、相似字段、启发式或 AI 不能制造关系真相。
- 显式契约：真实引用来自确定性 Dataset Contract 或等价来源，未验证关系只作假设。
- 通用 Core：文件、Node、结构浏览、字段、索引、查询等一般概念；数据集知识放在契约边界。
- 自由组合、成熟依赖优先，不轻率自研基础设施。
- 当前 raw source 严格只读；应用可以写自己的缓存，外部变化后使旧访问元数据失效并重新加载，不以 ID/值推断跨 revision 的同一实体。
- 搜索完整性约束查询声明的范围；V1 不要求 workspace-wide raw content coverage，未完成查询仍须明确表达进度、部分结果和取消。Source Locator、active-source Find 与契约引用职责分层，见 [ADR-0011](decisions/ADR-0011-search-scope-and-reference-first-direction.md)。
- UI 本地化属于 presentation：用户消息统一管理，raw 数据保持原貌，内部协议 locale-independent；从首批 Phase 2 production UI 开始遵守。

## 当前 discovery 与引用模型

| 层级 | V1 方向 | 限制 |
| --- | --- | --- |
| Workspace | Source Locator：source filename / relative-path search | 不解析全部 JSON，不要求 occurrence index、S1、FTS/trigram、persistent content index 或 dedicated Search Utility |
| Active source | Find in Source：bounded literal Contains/find | 当前 source 内渐进匹配、取消、revision safety、previous/next navigation、有界 Renderer payload；不要求持久索引 |
| Cross-source semantic navigation | Dataset Contract / Reference Resolver | 契约明确 target scope、structure、matching rule，确定性访问目标 NodeAddress / Logical Entity |

Source Explorer 当前仅提供单目录 discovery，不代表完整 workspace source catalog 已存在。Source Locator 与 Find in Source 尚未实现，均需独立授权。

**Search discovers raw content; Dataset Contracts establish reference meaning.** **Reference resolution must not be implemented as unconstrained workspace-wide content search.** Referenced by 必须来自显式 contract semantics，不能把所有相等 number/string occurrence 当引用；可由契约推导 TextMap key / Pointer 时直接访问目标。

V1 明确 defer workspace-wide raw scalar、field、text 和 ID/hash occurrence search；因此不提供全工作区 `1407` / `140701` / `MonsterSkill` / `AvatarID` 的全部命中是接受的产品缺口，不是 bug。S1 content cache、FTS/trigram 与 dedicated Search Utility 同样 defer；compact hash 为 DROP from current V1 candidate set。调查 evidence 保留，未来真实需求可触发复审。

## 平台与非目标

Windows x64 与 macOS arm64 桌面，GitHub Releases 分发。macOS x64 不属于正式支持目标。已接受 Electron、Svelte 5、TypeScript，采用 electron-vite + electron-builder 构建／打包路线，版本快照不成为永久产品要求。[ADR-0005](decisions/ADR-0005-macos-platform-scope.md) [ADR-0006](decisions/ADR-0006-electron-build-and-packaging-toolchain.md)

不建设网页部署、玩家百科、语义归一化、自动引用推断、AI 真相层或全数据集图。未来可选 Agent 只是 Query API 客户端，不改变事实规则。

当前产品是 raw source 的只读 viewer / investigation tool，不提供 raw file editing、save、merge、conflict resolution、undo/redo、transactional source writes 或 source-format rewrite。[Node 与来源边界](decisions/ADR-0007-node-addressing-and-source-lifecycle.md)、[当前搜索范围](decisions/ADR-0011-search-scope-and-reference-first-direction.md)、[搜索完整性历史及部分替代](decisions/ADR-0009-search-completeness-and-optional-acceleration.md)、[UI 本地化](decisions/ADR-0010-ui-localization-boundary.md)

生产 segmented TextDecoder 丢失 U+FEFF 是仍 OPEN 的 Raw Access correctness defect，影响未来 TextMap / reference preview fidelity；不能因 Search defer 而关闭。真实来源及复现见 [全库调查](investigations/phase-2-search-architecture-full-dataset-investigation.md)，修复需独立授权。

阶段见 [ROADMAP](ROADMAP.md)，约束见 [ARCHITECTURE](ARCHITECTURE.md)。

当前已实现 Source Explorer 和当前 revision 内的 generic raw Node Browser/Inspector。选择 child 只更新 Inspector，Enter/双击才进入 Node；精确 numeric lexeme 和 semantic string 保持原文，一页/一段有界浏览。检测到来源变化后保留旧内容并标 stale，禁止新结构读取；已提供 stale recovery Reload、同 Pointer 恢复与 LOCATION_MISSING/Return to Root；只恢复 current Pointer，不推断实体。搜索和 History 未实现。Slice D 结果见 [报告](investigations/phase-2-source-browser-slice-d-node-browser-inspector.md)，Apple Silicon A/B/C/D 累计验收已 PASS WITH FIXES，见 [报告](investigations/phase-2-source-browser-macos-arm64-validation.md)；共享 watcher Windows 补验已在 Slice E preflight 完成；Slice E 新 diff 已完成 [macOS 定向验收](investigations/phase-2-source-browser-slice-e-macos-arm64-validation.md)，仅 harness 修复；A/B/C/D/E generic browsing foundation 平台 gate 已关闭，Mac minimize 通过范围为台前调度关闭，开启组合保留限制。后续阶段需独立授权。
