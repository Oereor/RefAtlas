# Phase 2 Source Browser Slice A：Directory Discovery + Active Source Lifecycle

日期：2026-10-03（UTC+8）。应用起点 `16dda299529b879d69188bdf341081a5e5e63dca`，起始工作树干净。直接设计依据为已评审 [preflight](phase-2-source-browser-preflight.md) 与 ADR-0007～0010。

## 1. Executive Summary

已实现安全 displayName、DirectoryPath、单目录分页/snapshot、metadata 与 parser 调度分离、显式 acquire/release、registration/workspace generation、targeted task/cache 清理和 watcher ownership，以及 Pointer helpers。

修复 preflight 已证明的注册后取消残留；防止旧 release/finally 清理新 registration、旧 queued read 隐式 acquire、旧 workspace completion 发布。并发 metadata 还要求在 registration 发布前重新核实 source 容量，已加回归。

没有新增 UI、Source Explorer、Node Browser、Inspector、Paraglide、Zag、搜索、SQLite index、Dataset Contract 或第三方 dependency。没有偏离已接受 ADR；内部只拆目录、安全路径及有限调度职责。**Windows x64 完整验收通过；Slice A awaiting macOS arm64 validation / review**。代码可供后续 slice 评审，但正式跨平台关闭门槛尚未闭合，不自动进入 Slice B，等待用户与 ChatGPT review。

## 2. API Delta

| API/type | 最终行为 |
| --- | --- |
| OpenResult | opened 增加 Utility 生成的 displayName；cancelled 分支保持 |
| DirectoryPath | 独立 branded string，root `""`，受控 `/` 相对目录地址 |
| DirectoryEntry | directory/name/path 或 source/name/SourceAddress |
| DirectoryResult | workspaceId、directory、items、nextCursor、truncated |
| listDirectory | requestId、workspaceId、directory、limit 1～200、cursor/null |
| releaseSource | requestId、source；返回 released boolean；无 expectedRevision |
| Pointer helpers | splitPointer、joinPointer、parentPointer；严格校验、保留 raw tokens |

Node 未注册时复用 SOURCE_CHANGED，无新增 RawCode。directory 的 UUID cursor 与 Node cursor 分离。RawCommand/RawOutput 扩展后，既有 protocol 的 validRequest/validResult 自动走更新后的 shared validator；Main broker 不绕过 validation。内部 token、task、publish callback 不进入 Renderer contract。

## 3. Directory Discovery Implementation

`raw-directory.ts` 是 RawDataService 内部模块，workspace/canonical root 仍由 service 持有，未新增第二条 public service 或 unrestricted filesystem bridge。

路径逐组件 lstat，最终 realpath 与 separator-aware containment；枚举目录必须为 directory，child 再 lstat。链接/junction/special/non-JSON 过滤，`.JSON` 不接受，不递归、不读取 JSON、不建立 revision/watcher/active source。没有特别隐藏 `.git` 等普通目录。

保留大小写/Unicode/raw filename spelling，不 normalization。目录优先，组内 UTF-16 字符串 `<`/`>`。无法表达为合法地址的条目明确 ACCESS_DENIED，超过地址预算为 RESOURCE_LIMIT/ADDRESS_BYTES，不偷偷省略或改名。

首批枚举前后及续页检查 dev/ino/size/mtimeNs/ctimeNs，排除 atime。snapshot 绑定 generation/directory，cursor 绑定 snapshot ID/offset。变化、TTL、淘汰或错误目录 cursor 为 STALE_CURSOR；真实目录消失为 NOT_FOUND。refresh 必须从 null cursor 建立新 stream。

完整 Utility envelope 按实际 serialized bytes 缩页，非空 continuation 必须能前进，单项无法容纳为 RESOURCE_LIMIT/RESPONSE_BYTES。snapshot metadata 按 entry 序列化成本累计并保留内部元数据余量；JS heap/RSS 不等于该预算。

FIFO cache/固定 TTL/count/bytes/cursor cap 保证有界；过期在下一目录操作清理，workspace reset 全清。目录操作 finally 关闭 handle，每 64 个 dirent yield/abort 检查。

## 4. Active Source Lifecycle

info/reload 是唯一 acquire。registration 使用唯一 Symbol token、delivered/retiring 状态；Node 在接收请求时绑定已交付 registration。旧 revision 或失去 registration 为 SOURCE_CHANGED，已取消任务为 CANCELLED。

release 验证 workspace → 标记 retiring → abort 该地址已有 metadata/read/queued work → 同地址控制链等待旧 task 完成/handle finally → 按 SourceKey/token 清 ranges、按 revision 清 Node cursors、删除精确 registration → 移除 watcher owner → 最后 owner 时关闭 watcher → 返回 true。未知/重复返回 false，错误 workspace 返回 WORKSPACE_NOT_OPEN。进入 retirement 后调用方取消也不放弃内部清理。

watcher 按目录共享，owner 是具体 Source 对象；reload 不重复增加 owner，stale 可释放。callback/error 复核当前 watcher，invalidate/drop 复核具体 registration，防止旧回调影响新状态。release A 保留 B 的 range/cursor/watcher；stale invalidation 的原有全 range 保守策略保留。

同地址 info/reload/release 串行控制链，tail 等待整个 execute 的 commit/rollback/finally；新 acquire 等旧 release barrier，不能抢在旧 candidate 回滚前复用它。reload 先取消旧 token 的工作并清理，再生成新 revision。没有公开 lease/ref-count，多窗口/tabs 尚不支持。

## 5. Parser / Metadata Scheduling

解析仍为单 FIFO；directory/info/reload 使用并发 2 的小 metadata scheduler，排队可取消并移除。release/close 不排在 parser/metadata 槽之后，直接建立控制屏障。task 总量受现有 32 pending 上限保护，broker 普通 31 槽与取消控制槽不变。

info 不解析、不 hash、不等待无关 source scan。有限 source poll 仍逐个 stat，避免 poll 重叠；所有验证使用当前 registration 保护。parser adapter、grammar、token/字节预算及 raw semantics 未重写。

## 6. Race Fixes

- post-registration cancellation：candidate 未交付时回滚；已有成功交付 registration 不因一次 info 取消而删除。
- Utility 交付窗口：RawDataService 最后 check 与同步 publish/reply 在同一无 await 步骤完成，避免 execute 返回后外层取消检查留下 source。reply 失败仍回滚 candidate。
- old release/new acquire：same-address control chain 等待，旧 drop/cache/watcher cleanup 以对象/token 匹配。
- queued read after release：请求绑定旧 registration，release 定向取消；无可注册 source lookup。
- workspace reset：先提升 generation、移除 workspace、abort、清 cache/ownership，再等待旧 task done；旧 handle 与完成不发布到新 workspace。
- metadata 容量竞态：异步 stat 后、registration 发布前再次检查 256 source cap，两个槽不能同时占最后名额。
- watcher/stale 发布竞态：Node 在异步 verification 后再次检查 stale，不能把失效 registration 重新置为 validated。
- enumeration child 消失：复核目录自身，仍存在则 STALE_CURSOR，自身消失才 NOT_FOUND。

info/reload metadata 保留原 15 s work budget；移出 parser queue 不移除执行预算。最后预算检查失败同样回滚未交付 candidate。

## 7. Tests

测试按风险与可观察行为组织，不以数量为目标。

| 层次 | 核心风险覆盖 |
| --- | --- |
| unit/contract | DirectoryPath 非法组件/Unicode/bytes；Pointer empty/~1/~0/numeric token/malformed；排序、exact shape、entry 地址和 cursor 一致性 |
| directory service | root/nested/empty/filter、分页完整性、变化/删除、link/junction/security 复核、Unicode 长路径 shrink、scan/metadata/work/cache/TTL budgets、实际 dir handle 取消关闭 |
| lifecycle integration | acquire/release/stale/unknown/wrong workspace、post-registration abort、未删除已交付 source、targeted active/queued cancel、same-address cleanup barrier、watcher 最后 owner、B range/cursor 保留、source cap 并发 |
| scheduling/reset | scan 被同步门阻塞时 B info/directory 完成，最多 2 directory active、第三个取消、新 workspace 等旧工作 drain |
| broker | 新 directory/release 完整响应接受；错误 discovered address 拒绝/PROTOCOL_ERROR；原有 wire ID/owner/字节验证 |
| real-data | 三目录全分页、排序/集合完整、2253 个发现 source 均 release=false、取消、六样本 lossless/range/release/reacquire/指纹 |
| smoke | 真实 Renderer→Preload→Main→Broker→Utility，新增 displayName/directory/cancel/release/released-read/reacquire，保留 raw/revision/服务重启/native 安全 gate |

测试中的边界同步/资源观察仅位于 tests（内部 acquisition 截点、真实 handle close、watcher close），没有新 test-only IPC 或 packaged 控制开关。single-item response fail 分支使用内部较小 response budget 验证；默认 4 KiB 地址预算下通常先限制地址，无需制造不合法 production item。

最终普通 `npm test`：10 个文件 / 106 项通过；外部 gate 按设计 skip，由独立 `test:raw-data` 明确启用并通过。typecheck 为 0 error/0 warning，format/doc/pipeline gate 通过。测试规模不是验收数量指标。

## 8. Real-data Results

外部 root `../TurnBasedGameData`，HEAD `724b139d8c9c32d12552eb95745a4fee72bfe48b`，前后工作树干净。最终扩展 gate 13.29 s，通过，报告 `artifacts/raw-real-data.json`（ignored），测量时间 `2026-10-03T08:30:17.804Z`。

| directory | entries / sources | pages | max 完整 envelope bytes | 完整 listing 单次 ms |
| --- | --- | --- | --- | --- |
| root | 6 / 0 | 1 | 532 | 2.95 |
| ExcelOutput | 2253 / 2253 | 12 | 35496 | 197.09 |
| Config/Level/Mission | 2845 / 0 | 15 | 15477 | 146.91 |

逐页顺序和全量直接 child 集合一致，无 duplicate/missing；每个发现 source 在 acquire 前 release=false，目录自动注册为 0。目录取消返回 CANCELLED。六个原有代表样本前后 streaming hash/size/mtime 一致，lossless/raw gate 保留，每个样本完成后 release/旧 read 拒绝/reacquire 新 revision/再释放。

数字含服务分页和无注册验证，不含 Electron IPC；未控制 OS cache，每目录一次，不是 SLA/RSS 上限。没有 full-parse 全仓 JSON，未扩大六样本。

runner maxRSS 216036 KiB 包括 Vitest、hash、parser/service，不能分解为独立 Utility 高水位。PERFORMANCE 保留首次 gate 观察口径，不与最终单次波动作性能比较。

## 9. Electron Validation

dev、built、packaged 本轮均通过；只使用最终代码对应的新报告。隐藏 Renderer smoke 新增 root/nested/pagination/directory cancellation、release 后拒绝 Node read、reacquire root 与 directory cursor 保留，原始类型/词法、Node revision、reload/deleted/service restart gate 同样通过。

| mode | 本轮最终报告 UTC 时间 | 结果 |
| --- | --- | --- |
| dev | 2026-10-03T08:30:25.644Z | passed |
| built | 2026-10-03T08:30:31.894Z | passed |
| packaged | 2026-10-03T08:31:39.996Z | passed |

三态实测 sandbox=true、contextIsolation=true、nodeIntegration=false；ASAR runtimeOnly/externalDataExcluded/nativeUnpacked 全 true，三个 SQLite smoke 均 cleaned=true；普通 packaged diagnostics=false 且拒绝故障注入。builder 使用本机 Electron distribution、win32/x64、--dir、--publish never、原有无签名策略，无安装器/发布。

报告保存在 ignored `artifacts/foundation-{dev,built,packaged}-win32-x64.json`。raw initial 的既有 cancelMs 字段现在包含取消后路径检查与 release/reacquire 的复合收尾成本，本轮只作为流程观察，不拿它当纯取消延迟或性能结论。

## 10. Platform Status

| 平台 | 本轮状态 |
| --- | --- |
| Windows x64 | 实现、cheap/targeted/real-data、dev/built/ASAR packaged 与十步完整验收通过 |
| macOS arm64 | 新实现未运行；awaiting native validation |

Mac 需原生 Apple Silicon、Node 24，确认当地 7890 代理后运行 `npm run validate:foundation -- --real-data`。不能借用旧 Raw Foundation 的 Mac gate。全平台门槛未闭合，不宣称 Slice A 正式关闭或整套 Source Browser 已完成。

## 11. Resource Limits

| directory 预算 | 实际默认 |
| --- | --- |
| page / direct dirent scan | 200 / 20000（含过滤项） |
| single snapshot / total cache | 4 MiB / 8 MiB |
| snapshot / cursor count | 32 / 256 |
| fixed snapshot/cursor TTL | 60 s |
| active metadata / directory work | 2 / 5 s |
| yield | 每 64 dirent |
| request / 完整 response | 16 KiB / 64 KiB |
| path / displayName | 沿用 serialized addressBytes 4096 |

这些是 engineering starting points, not SLA；serialized metadata 不含所有 JS 对象/GC 成本。原 parser 15 s/read/token/scalar/value 等预算不变。内部模块预算注入仅供 tests 构造小边界，产品不暴露预算修改入口。

## 12. Security Review

Renderer 只获 canonical leaf displayName，root/drive/home absolute path 不进入结果。DirectoryPath 独立校验，lstat 拒绝 traversal，realpath containment 用 path separator 边界，child symlink/junction 不 follow。source listing 不能替代 acquire 的安全检查。

Main 继续可信窗口/frame/URL 与 typed forwarding，不枚举、不持 source truth；Preload 仅新增两个 typed API，无 fs/path/readdir/stat/ipcRenderer 暴露。broker 校验完整 64 KiB envelope 与返回 entry/source/order/上下文；raw error 不携 raw exception 或翻译消息。

## 13. API Compatibility / Raw Semantics

没有改变 NodeAddress、SourceRevision 的外部失效语义、RawValue 六类型、有序 object entries、number lexeme、parser truth 或 SourceRange identity 规则。唯一刻意收紧是 Node 必须先 info/reload acquire，release 后不隐式重建；以稳定 SOURCE_CHANGED 表达。raw locale-independent，新增结果无用户文案。

## 14. Known Limitations

macOS 新实现待验。目录 snapshot/stat 与原 source watcher/stat 都不是恶意外部严格快照隔离；未测网络盘及其他文件系统。OS 单次 filesystem await 没有强制硬中断，预算/取消在其返回后检查。首次目录 page 收集有界完整直接子项再排序，不承诺 O(page size)，没有目录 push watcher。FIFO/TTL/cursor 淘汰可导致 STALE_CURSOR，刷新从 null 开始。

Windows fixture 的一次快速 mkdir 后目录 stat 没有可观察变化，stat-only 续页仍能返回旧 snapshot；不能把检测声明成每次 filesystem mutation 都必然被发现。变化测试显式用临时目录 utimes 建立不同 stamp，避免依赖时间戳精度。保持 preflight 的 stat-based snapshot 边界，未增加目录 watcher/full rescan 或隐藏修改行为。

仍是单窗口/source-only release；未来多 owner tabs 需另评审。原巨大 scalar/read/key 预算、首次 source 完整校验及 Node 分页重扫描边界保留。

## 15. Final Diff

生产改变：shared raw types/validators、Main 固定 command 分派/smoke fixture、Preload 两方法、Utility 同步成功 publish、RawDataService 生命周期。新增三个内部模块：raw-directory、raw-filesystem、raw-scheduler。

测试：新增 raw-directory、raw-lifecycle；扩展 raw-broker、raw-real-data 与 pipeline。Renderer 仅 raw-smoke。validate runner 增加可选 --real-data，默认九阶段不变；显式数据 gate 失败阻断后续 smoke/build/package，仍只生产构建一次。

权威文档：STATUS/ARCHITECTURE/ROADMAP/PERFORMANCE/DEVELOPMENT-PROCESS、应用 README、docs 入口和 investigations 索引；新增本报告。历史调查/ADR 未重写；package.json 与 lockfile 不变，无新增第三方依赖。

最终改动文件清单（18 tracked 修改 + 6 新文件，无暂存）：

```text
README.md
docs/README.md
docs/STATUS.md
docs/ARCHITECTURE.md
docs/ROADMAP.md
docs/PERFORMANCE.md
docs/DEVELOPMENT-PROCESS.md
docs/investigations/README.md
scripts/validate.mjs
src/main/index.ts
src/preload/index.ts
src/renderer/src/raw-smoke.ts
src/shared/raw.ts
src/utility/index.ts
src/utility/raw-service.ts
tests/pipeline.test.js
tests/raw-broker.test.ts
tests/raw-real-data.test.ts

新增：
docs/investigations/phase-2-source-browser-slice-a-directory-lifecycle.md
src/utility/raw-directory.ts
src/utility/raw-filesystem.ts
src/utility/raw-scheduler.ts
tests/raw-directory.test.ts
tests/raw-lifecycle.test.ts
```

## 16. Cleanup

初始 app/data clean。最终 app/package SHA-256 `e81d08c04f308010ca5179595b81fd45fdba697e967e4e653cb6bd580da1d7bc`，lockfile `556868ed96b7d1c2c9dea2f0504e97e5c8bd7b932ad61386ffb68ad07374c893`，与开始相同。app HEAD 保持起点，未暂存；外部 HEAD 与 clean status 再次核实一致。

测试 fixture 在应用临时目录，close/drain/dispose 后移除；smoke runner 清理自身 verified-boundary fixture/profile/process tree。artifacts/out/dist/cache 保持 ignored，留最新报告供本地 review。没有修改外部数据、submodule、大规模复制、commit、branch、push 或 PR。

系统设置及 listener 已核实 `127.0.0.1:7890`，单命令 HTTP 代理访问固定 parser registry 返回 200；后续打包仅当前 shell 设置代理并由既有 proxyEnvironment fail closed，localhost bypass，不永久修改配置。普通沙箱存在已知 esbuild 父目录读取限制，测试使用获准的本地执行路径，未降低 Electron 安全设置或延长 timeout。

最终 `npm run validate:foundation -- --real-data` 全十步退出 0，每轮仅一次 production build。首轮全流程也通过；之后自查补 stale/budget/完整控制屏障及回归后，才进行最终这轮，不用旧包作为证据。期间一次目录 timestamp fixture 未产生 stat 差异的失败明确记录于第 14 节，修改测试假设后复验，不增加 timeout 或机械重试。

2026-10-03 本轮原生只读进程复核：匹配此项目路径的 node/Electron/RefAtlas/esbuild/app-builder 进程为空；对应 temp fixture/smoke-run 目录为空，不停止其他用户应用。最终文档同步后另跑 docs:check、format:check、git diff --check；可审查改动保留，本轮到报告为止。
