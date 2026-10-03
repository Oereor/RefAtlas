# Phase 2：Raw Access Foundation 实现与验收

日期：2026-10-03（UTC+8）。应用起点：`6316ccd Closeout Phase 2A`，起始工作树干净。外部只读来源：`724b139d8c9c32d12552eb95745a4fee72bfe48b`，起始和结束工作树干净。

**Phase 2 production implementation：STARTED；Raw Access Foundation：COMPLETE / AWAITING REVIEW。** 用户明确授权的首个 production slice 已实现并在 Windows x64 验证。本报告交付后停止，不自动开始 Source Browser 或关闭整个 Phase 2。

## 1. 接受架构、实现与候选

| 层级 | 本轮事实 |
| --- | --- |
| accepted architecture | ADR-0001～0010；NodeAddress、无损 raw semantics、只读来源、可重建范围、有界跨进程访问和 presentation 本地化边界 |
| implemented behavior | typed raw bridge、受控 workspace、revision/stale/reload、统一 parser、完整小值/摘要/分页/片段、资源限制和真实取消 |
| measured evidence | 65 项普通测试、独立真实数据 gate、Windows dev/built/ASAR packaged smoke 与完整九阶段验收 |
| remaining candidate | 更大 scalar 的 streaming segment、child index、持久缓存、产品性能预算、搜索及 localization library；本轮没有实现这些候选 |

不新增或改写 ADR，不引入 HSR 语义、关系推断、搜索、Dataset Contract、raw 编辑、正式产品 UI 或发布能力。

## 2. Production 模块与进程结构

Renderer 的 `window.raw` → sandbox Preload → Main 的固定 `raw:*` channels → RequestBroker / MessagePort → Utility 的 `RawDataService` → parser adapter → `open(path, 'r')`。

- `src/shared/raw.ts`：production types、资源策略、输入和响应校验、稳定错误 code。
- `src/utility/raw-parser.ts`：成熟 tokenizer/grammar 的统一无损、范围与预算适配。
- `src/utility/raw-service.ts`：workspace/source、变化检测、单任务队列和内存缓存。
- Main 仅负责原生目录选择、可信调用来源、服务生命周期和转发；不解析 raw JSON。
- 原 foundation bridge 保留原职责，Renderer 无 Node API、任意 IPC、SQL、文件句柄或绝对路径读取接口。

## 3. 最终 production 类型与 API

`WorkspaceId`、`RelativePath`、`JsonPointer`、`SourceRevision` 为轻量 branded string；由运行时 validation 保护 wire 边界。`SourceAddress = { workspaceId, relativePath }`；`NodeAddress = { source, pointer }`。根 Pointer 为 `""`；key 的 `~`、`/` 分别转义为 `~0`、`~1`。

`SourceRange = { startByte, endByteExclusive }` 是可空半开字节范围，返回时关联 revision；不进入 identity。source 与 address 的比较按字段语义进行，不依赖对象属性的序列化顺序。

`RawValue` 的 number 只含 `lexeme`；string 保存解码后的原始 UTF-16 内容；boolean/null 分别有独立 kind；array 保存 items；object 保存有序 `{ key, value }[]`。不提供不安全的数值附件，不以普通 JS object 组装事实。

| Bridge 方法 | 契约 |
| --- | --- |
| openWorkspace | 只接收 requestId；Main 原生目录选择；返回 opened/workspaceId 或 cancelled |
| closeWorkspace | requestId、workspaceId；取消该 workspace 工作并清理状态 |
| getSourceInfo / reloadSource | requestId、SourceAddress；返回 revision、current/stale、sizeBytes、validated |
| readNode | requestId、NodeAddress、expectedRevision；返回 `mode: complete` 与完整 RawValue，或 `mode: summary` |
| listNodeChildren | Node 请求加 limit/cursor；源顺序直接 children、摘要、nextCursor/truncated |
| readScalarSegment | Node 请求加 limit/cursor；string decoded 内容或 number lexeme 的有界片段 |
| cancelRequest | 目标 requestId；owner-scoped accepted 状态 |

所有 raw 错误使用 `{ ok: false, error: { code, details? } }`，无用户文案；details 只允许有界的 limit 标识。保留现有 foundation 的历史诊断消息，不将其文案传播到新增 raw 协议。

## 4. 只读 workspace / source 生命周期

只保留一个活动 workspace，Main 选择路径后由 Utility realpath canonicalize。Renderer 只取得随机 workspaceId。关闭、切换或服务重启均不重放请求，也不恢复旧 workspaceId。

相对路径使用 `/`，保留大小写，只允许 `.json` 普通文件；拒绝绝对路径、盘符、UNC、反斜杠、空段、`.`、`..` 和 NUL。逐组件 lstat 拒绝 symlink/junction，最终 realpath 再核实 containment。不存在来源返回 NOT_FOUND，越界/链接访问返回 ACCESS_DENIED。

没有 workspace discovery 或全库扫描。所有 raw handle 以 `r` 打开并在 finally 关闭；应用仅写自身 smoke fixture、构建产物和报告。未写入 TurnBasedGameData，未建立 submodule 或复制数据。

## 5. Parser library 与统一语义

唯一 production parser dependency 为固定版 `@streamparser/json@0.0.26`，MIT，无 runtime dependencies。使用公开 Tokenizer、TokenParser，后者配置 `paths: [] / keepStack: false`，不组装整根文档。

通过公开允许覆盖的 parseNumber 入口直接返回 lexeme。上游 TypeScript 返回类型仍固定为 number，adapter 内使用一个集中类型适配；实际运行从未先执行 Number/parseFloat。业务模块不直接调用第三方 parser。

冷 source 校验、Pointer 扫描、缓存范围回读和 scalar segment 共用同一 adapter。UTF-8 BOM 显式跳过并补回字节基准；容器范围来自公开 token offsets，scalar 尾部通过有界 raw byte window 与 JSON whitespace bookkeeping 恢复。没有自研 tokenizer、grammar 或读取库私有状态。

`16752756560315677817`、`-0`、`1.00`、`1e+3` 保留完整 lexeme；numeric-looking string 不转换。转义的字节拼写由 revision-bound range 保存，decoded string 不宣称保留原转义拼写。

## 6. Bounded Node 与范围策略

完整值在物化过程中累积节点、深度和表示成本；超限立即停止构建 RawValue，但仍在工作预算内完成必要来源校验。返回 summary，不把删掉成员的树伪装成完整值。最终再次检查实际序列化字节数。

children 仅保留当前页及一个 lookahead；按 ordinal 返回直接 child，array 的 key 为索引，object 的 key 为原键。结果字节先于条数达到上限时缩页并保留 continuation。超长地址明确 RESOURCE_LIMIT，不截断 identity。

scalar segment 在 256 KiB token 上限内读取，按 Unicode code point 分段，保留孤立 surrogate，不拆开合法 surrogate pair。超过 token 上限的 scalar 明确 RESOURCE_LIMIT；本轮未实现任意巨大 scalar 的 chunk 内容访问。

范围 cache 按地址/revision 保存已访问 Node 和当前页 children，总计最多 8 MiB，采用有限 FIFO 淘汰。没有全 scalar index。无范围时走 Pointer 扫描恢复；有范围时仍经相同 parser。已验证巨大容器的热摘要只检查来源，不重新扫描整个容器。分页可能重新扫描父范围，不承诺 O(page size)。

## 7. Revision / stale 与 race

revision 是当前服务内随机 UUID；内容 hash 是首次完整校验时建立的内部验证 metadata，不是 Node identity。reload 先失效旧状态，再建立新的、尚未解析的 revision；首次新 Node 访问重新完成校验。

源检查包含 dev/ino/size/mtimeNs/ctimeNs、路径边界和句柄 stat。已访问目录 watcher 按匹配文件事件标记 stale；watcher 失败退回 stat 检查，已知 source 每秒一次轮询。访问前、扫描后和关闭句柄后复核来源，已知变化优先返回 SOURCE_CHANGED，不发布混合 revision 成功结果。

变化保守清空 range cache，并移除该 source cursor；旧 expectedRevision 返回 SOURCE_CHANGED。cursor 绑定地址、revision、操作和位置，淘汰/失效返回 STALE_CURSOR。没有跨 revision ID/值迁移。

这不是密码学快照隔离；能同时绕过 watcher 并保留全部 stat 信息的外部改写仍可能暂时不可见，显式 reload 会重新校验内容。未提供 watcher 压力或跨机器文件系统的普适保证。

## 8. 取消与初始资源限制

Utility 同时运行一个 raw parsing 任务，其他请求在现有最多 31 个普通 pending 槽中等待；第 32 槽保留取消控制。队列任务同样可取消。每个最多 4 KiB 的 read/feed 块检查 signal 并 setImmediate yield；每个 token 检查 work budget。

| 限制 | production 初始值 |
| --- | --- |
| request / response envelope | 16 KiB / 64 KiB；foundation 控制消息仍 16 KiB |
| complete RawValue | 48 KiB、1,000 Node、深度 8 |
| children / segment | 最多 100 项 / 4,096 code point |
| 请求实际 read / token / parser depth | 128 MiB / 800 万 / 128 |
| scalar、key、未完成 token/空白窗口 | 256 KiB，最多一个 4 KiB feed 块超额 |
| work / broker timeout | 执行 15 秒 / 请求含排队 20 秒 |
| known source / range cache / cursor | 256 / 8 MiB / 256 |
| 同时存活 duplicate-key metadata | 524,288 个 key / 16 MiB key 内容 |

3 字节 BOM sniff 计入实际读取预算。source 全校验和后续解析不重置同一请求预算。限制是工程起点，不是 SLA；字节与 key 内容限制不等同于硬 RSS 上限，JS 容器和 GC 仍有额外成本。

窗口销毁、超时、关闭/switch workspace 和 MessagePort 关闭都会中止工作；迟到响应无法匹配新 wire ID。source stale、invalid JSON、missing source、resource limit、parser failure 和 service lifecycle failure 都有稳定 code。

## 9. IPC、安全与 localization

Preload、Main 和 Utility 都校验 raw 输入；Main broker 校验完整响应 envelope、嵌套 RawValue、revision 和 address context。客户端不能通过额外 `kind/root` 字段覆盖固定 bridge operation，此风险有直接行为回归及 Electron smoke。

Raw response policy 独立于 foundation LIMITS，没有全局调大旧限制。保留 sandbox/context isolation、安全 URL/frame/source 校验、owner cancellation、generation 与普通打包态诊断保护。

没有新增产品 UI、按钮或用户消息，因此不添加 localization runtime。raw 协议不传 locale；raw path/key/value/Pointer/lexeme 均不本地化。第一批正式产品 UI 仍必须遵守 ADR-0010。

## 10. SQLite 与 edge cases

本轮未使用 SQLite 保存 revision、range 或 raw 数据，未新增 schema、搜索索引或磁盘 cache。原 foundation 的独立临时 SQLite smoke 保留并在打包态验证，不能当作本轮生产存储实现。

- duplicate key：完整 source 校验失败 AMBIGUOUS_OBJECT_KEY，包含重复值所在 source 的其他 Node 也不宣称可唯一访问。
- malformed JSON、尾随垃圾、非法 number、无效 UTF-8：INVALID_JSON；grammar 完成不代表允许尾随坏内容。
- 转义孤立 surrogate：在 JS/IPC 中保持原 UTF-16，不进入可能有损的 SQLite TEXT。
- 深度、巨大 scalar/key、太多 key、超长地址、读取/token/时间成本：RESOURCE_LIMIT；不静默省略后宣称完整。

## 11. 自动化与真实数据验证

普通 `npm test`：8 文件、65 项通过；真实数据文件在默认测试中明确 skip，由 `npm run test:raw-data` 独立启用，单项集成 gate 通过。不是 test-count 或 coverage 目标。

测试重点覆盖六类型/词法、源键顺序、__proto__、Pointer escaping、BOM/UTF-8/escape 的 1/2/3/7/4096 字节分块与范围一致性、摘要/分页/片段、重复键、损坏 JSON/UTF-8、深度/scalar/work/key 限制、取消/排队/close、修改/删除/替换、stale cursor、重启、路径逃逸/junction 及独立 wire response budget。

真实 gate 对下列六个 source 做 streaming SHA-256/size/mtime 前后对照，全部一致。真实数据 aggregate 约 99.77 MiB，没有重扫 2.438 GiB 全库。冷访问指服务无 range cache，OS cache 未控制，不能称磁盘冷读。

| source / 选定 Node | cold ms | warm ms | 返回模式 / payload bytes | cold read / warm read bytes |
| --- | ---: | ---: | --- | --- |
| AvatarConfig `/0` | 35.95 | 2.46 | complete / 5,206 | 240,469 / 2,658 |
| EquipmentConfig `/56` | 18.57 | 1.69 | complete / 2,058 | 132,307 / 780 |
| AvatarSkillConfig `/0` | 928.32 | 1.86 | complete / 2,927 | 11,438,928 / 1,181 |
| TextMapCHS root | 2,349.29 | 1.58 | summary / 327 | 52,399,649 / 0 |
| Floor `/DimensionList` | 2,349.42 | 1.19 | summary / 372 | 29,480,189 / 0 |
| SoundBank `/Events` | 891.66 | 1.60 | summary / 337 | 10,920,727 / 0 |

AvatarSkill 的真实 unsafe integer 和 Equipment 的真实 -0 均通过。大型来源另外验证十项 children page 和 child 访问，均有界。cold token count 最大为 Floor 3,048,925，低于 800 万预算。

环境为 Windows x64 / Node 24.21.0；每 source 一次 cold、一回 warm，不含 Electron 传输。payload bytes 不含 envelope，但测试另断言完整 envelope ≤64 KiB。该轮 Vitest+前后 streaming hash+production service 的进程 maxRSS 为 170,588 KiB，不能当成独立 Utility 或单 parser 的内存高水位。详见本地被忽略的 `artifacts/raw-real-data.json`。

## 12. Electron / packaging 与实际验收

最后执行 `npm run validate:foundation`：format:check → typecheck（0 error/0 warning）→ 65 项普通测试 → docs:check → dev smoke → 一次 production build → built smoke → Windows x64 builder → packaged smoke，全九阶段通过。文档同步后另做最终 docs/diff 检查。

raw smoke 由真实隐藏窗口调用 production bridge，Main 在自身临时目录建立和修改 fixture；覆盖 unsafe integer、-0、decimal、numeric string、Unicode/孤立 surrogate、range repeated read、summary、children continuation、scalar segment、resource/invalid JSON、取消、路径/operation 注入拒绝、stale/reload/deleted/missing、服务崩溃和重启后旧 workspace 拒绝。

ASAR 目录包实际加载 parser，包含 Utility 和 runtime dependencies；原 better-sqlite3 native unpack/读写清理、runtime-only 内容检查、外部数据排除和普通打包启动 diagnostics protection 均通过。报告保存在被忽略的 `artifacts/foundation-{dev,built,packaged}-win32-x64.json`，临时 fixture/profile 由 runner 清理。

此次没有新的 macOS arm64 原生执行环境；既有 Phase 1A gate 是历史证据，不能声称本轮 parser/raw path 已在 Mac 原生验收。Windows 目录包不签名、不发布、不生成安装器。

公网步骤先通过显式 `http://127.0.0.1:7890` 确认固定版 registry 返回 HTTP 200，安装使用单次代理、ignore-scripts、独立 cache、no-audit/no-fund；未永久修改用户网络配置。首次普通沙箱测试因 esbuild 父目录访问限制失败，在获准本地环境通过；未关闭 Electron sandbox、调整 ACL 或以延长 timeout 掩盖失败。

## 13. 未完成事项与技术债

没有 Source Browser、正式 Node View、search/trigram、Dataset Contract、references、tabs/history、graph、compare/diff/pin、Agent、编辑或 release/updater。

明确局限：首次 Node 访问需要完整校验单个 source；分页可能重新遍历父范围；超过 128 MiB source 或 256 KiB scalar 可能明确失败；单 parsing 队列和 FIFO cache 暂无产品吞吐承诺；watcher/stat 不提供严格快照；缓存不持久化；source count 上限需要未来 Source Browser 再基于使用场景评审。

这些是已表达的 resource/correctness 边界，没有静默截断真值。后续优化仍须复用同一 Data Service/parser contract，不为 UI 或搜索重新增加 raw JSON 读取逻辑。

## 14. 变更与最终工作树

本轮修改 production package/lockfile、Main/Preload/Utility/shared 边界；新增 parser/service/raw smoke、三份风险导向测试和真实数据 runner；同步 STATUS/ARCHITECTURE/ROADMAP/PERFORMANCE/开发及入口文档。没有改写旧 ADR 或历史 investigation。

`git diff --stat` 只统计已跟踪文件，新增源码/测试/报告仍是 untracked，因此另列新增清单；最终数字记录于下方验收补记。工作树保留全部可审查修改，没有暂存、commit、分支、push 或 PR。node_modules、out、dist、artifacts 和 cache 均在忽略范围。

下一块建议为 **Source Browser**，消费本轮受控来源与 raw API；只建议，不开始实施。本轮结束等待用户和 ChatGPT review。


### 最终验收补记

- 文档同步后 `npm run docs:check`：29 份 Markdown 链接/锚点通过；`git diff --check` 通过。
- 外部 HEAD 保持 `724b139d8c9c32d12552eb95745a4fee72bfe48b`，最终工作树干净；六个实际读取样本的前后 hash/size/mtime 一致。
- 进程与临时目录复核无本轮 RefAtlas/Electron 残留；runner fixture/profile、测试目录已清理。受忽略的构建包/本地报告仍保留供审查。
- tracked 变更 18 文件，新增 9 文件；均未暂存。

最终 `git diff --stat`（不含 untracked）：

```text
 README.md                     | 20 +++++++--
 docs/ARCHITECTURE.md          | 20 ++++++---
 docs/DEVELOPMENT-PROCESS.md   |  4 ++
 docs/PERFORMANCE.md           | 22 +++++++++-
 docs/README.md                |  2 +-
 docs/ROADMAP.md               |  6 +--
 docs/STATUS.md                | 13 ++++--
 docs/decisions/README.md      |  2 +-
 docs/investigations/README.md |  1 +
 package-lock.json             |  7 ++++
 package.json                  |  4 +-
 src/main/index.ts             | 98 ++++++++++++++++++++++++++++++++++++++++++-
 src/main/request-broker.ts    | 32 ++++++++++++--
 src/preload/index.ts          | 24 +++++++++++
 src/renderer/src/env.d.ts     |  3 ++
 src/renderer/src/main.ts      |  5 ++-
 src/shared/protocol.ts        | 22 ++++++++--
 src/utility/index.ts          | 25 ++++++++++-
 18 files changed, 279 insertions(+), 31 deletions(-)
```

新增文件：

```text
docs/investigations/phase-2-raw-access-foundation.md
scripts/raw-real-data.mjs
src/renderer/src/raw-smoke.ts
src/shared/raw.ts
src/utility/raw-parser.ts
src/utility/raw-service.ts
tests/raw-access.test.ts
tests/raw-broker.test.ts
tests/raw-real-data.test.ts
```
