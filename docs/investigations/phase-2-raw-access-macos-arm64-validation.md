# Raw Access Foundation：macOS arm64 production validation

日期：2026-10-03（UTC+8）。本轮是已完成 Raw Access Foundation 的跨平台验收，不是新的 implementation slice。

**Raw Access Foundation validated on Windows x64 and macOS arm64.** 本轮必要 gate 全部通过，无 production correctness bug，无源码、测试、依赖声明或 lockfile 修改。Raw Access Foundation 保持 **COMPLETE / AWAITING REVIEW**；Phase 2 production implementation 保持 **STARTED**，不关闭整个 Phase 2，不开始 Source Browser。

## 1. 基线、环境与只读边界

开始前阅读 AGENTS、文档入口、PROJECT、STATUS、ARCHITECTURE、DEVELOPMENT-PROCESS、ADR-0007～0010 和 [Windows 实现报告](phase-2-raw-access-foundation.md)。

| 项目 | 本轮事实 |
| --- | --- |
| 应用基线 | `b3ee84c9d46f0ddf8ae4410eb8afdc26ba1c5e2f`，`Implemented Phase 2: Raw Access Foundation` |
| 分支 / 本地 remote-tracking ref | `main`；HEAD 与 `origin/main` 相同，未 fetch |
| 应用起始工作树 | 干净 |
| 外部只读仓库 | `../TurnBasedGameData/`，HEAD `724b139d8c9c32d12552eb95745a4fee72bfe48b`，起始和结束工作树干净 |
| macOS | 产品版本 `27.0.1`，build `26A434`；runtime `os.release()` 为 `27.0.0`，不是同一版本字段 |
| 硬件 | Apple M2，16 GiB 内存；`uname -m` 为 `arm64` |
| 本机文件系统 | APFS；fixture 位于系统临时目录，`realpath` 解析为 `/private/var/folders/.../T/` |
| shell Node / npm | `24.19.0` / `11.17.0`；`process.platform=darwin`、`process.arch=arm64` |
| shell Node ABI / N-API | `137` / `10` |
| Electron | `44.5.1`；Main 与 Utility 均报告 Node `24.21.0`、ABI `149`、N-API `10` |
| parser | `@streamparser/json@0.0.26` |
| SQLite driver / runtime | better-sqlite3 `13.0.3` / SQLite `3.53.4` |

默认 shell 是 Node `26.5.0` / npm `12.0.1`，超出项目 `>=24 <25`。本轮仅为命令 PATH 前置现有 nvm `v24.19.0/bin`，未改变全局默认版本。Electron、打包后的 RefAtlas 可执行文件及实际 unpack 的 native addon 经 `file` 确认均为 Mach-O arm64；没有 Rosetta 或 x64 验收结果。

所有 source 均只读；写操作仅用于 node_modules、应用构建/本地报告及临时 fixture。未修改、复制大型外部数据或扫描完整 2.438 GiB 数据集。

## 2. 代理与依赖准备

获准的本地 `scutil --proxy` 确认 HTTP、HTTPS 和 SOCKS 均启用 `127.0.0.1:7890`；本轮工具采用 HTTP 代理 `http://127.0.0.1:7890`。`lsof` 确认该地址端口正在监听。受限环境首次 `scutil` 返回空设置、CPU sysctl 返回权限错误，因此没有依据空结果联网，转由获准的只读查询确认。

初始 `npm ls --depth=0 --offline` 发现唯一缺失的直接依赖 `@streamparser/json@0.0.26`，已检查默认与仓库 npm cache 均无该包。通过现有 `proxyEnvironment()` 的端口检查和单次代理环境执行：

```text
npm install --ignore-scripts --cache .cache/npm --no-audit --no-fund
```

实际仅 added 1 package；已有 Electron 二进制保留，无重新下载。HTTP_PROXY/HTTPS_PROXY/ALL_PROXY、大小写等价变量、npm proxy 和 NODE_USE_ENV_PROXY 仅注入当前命令；NO_PROXY 仅豁免 localhost/127.0.0.1。builder 也使用同一 fail-closed helper。未修改用户级 npm/git/系统网络配置，未直连回退，未主动执行额外 registry/version 查询。

补齐后 `npm ls --depth=0 --offline` 通过，所有直接依赖符合声明。安装前后及打包后 SHA-256 均相同：

```text
package.json      e81d08c04f308010ca5179595b81fd45fdba697e967e4e653cb6bd580da1d7bc
package-lock.json 556868ed96b7d1c2c9dea2f0504e97e5c8bd7b932ad61386ffb68ad07374c893
```

## 3. Cheap 与 targeted gates

| Gate | 结果 |
| --- | --- |
| `npm run format:check` | 通过，所有受管文件符合 Prettier |
| `npm run typecheck` | 通过；Svelte 0 errors / 0 warnings |
| `npm test` | 8 文件 / 65 项通过；外部真实数据 1 文件 / 1 项按设计 skip；约 1.75 s |
| `npm run docs:check`（初始） | 29 份 Markdown 链接/锚点通过 |
| 临时 macOS filesystem probe | 获准的原生执行下 2 项通过，无 unhandled error；约 251 ms |
| `npm run test:raw-data` | 专用 1 项通过；约 9.94 s |

普通测试中的 production raw access 和 broker 测试作为本轮 targeted synthetic gate，不另行重复。覆盖六类型/词法/键顺序、Pointer escaping、BOM/UTF-8/escape 的 1/2/3/7/4096 字节分块与 range 恢复、large summary、分页、scalar segment、active/queued/close 取消、duplicate key、invalid JSON/UTF-8、resource limits、修改/替换/删除、stale cursor、workspace restart、路径逃逸及响应预算。

临时探针初次在受限环境运行时，2 项断言通过，但额外观察用 `fs.watch` 异步触发未处理的 `EMFILE: too many open files, watch`，命令退出 1；此轮不算通过。production watcher 已有 error handler，原生事件观察器遗漏该 handler。为临时观察器补上错误记录，并转到获准的本地执行环境后通过；这是探针/执行环境问题，没有将其当作 production bug 或修改应用。没有机械重复失败，也未延长 timeout。

临时 `tests/raw-macos-validation-probe.test.ts` 已删除，不保留新的平台 wording/snapshot 测试；被忽略的 `artifacts/raw-macos-filesystem.json` 保留观察证据。

## 4. macOS filesystem、revision 与 watcher

production 逐组件 `lstat` 拒绝链接，最终 `realpath` 校验 containment；来源与句柄的 bigint stat 使用 `dev/ino/size/mtimeNs/ctimeNs`，扫描前后复核，旧 revision/range/cursor 不跨更新继续使用。

实际临时 fixture 验证：

- `workspace/link -> outside`，读取 `link/secret.json` 返回 `ACCESS_DENIED`；直接文件 symlink `file.json -> outside/secret.json` 同样拒绝。没有触及外部真实数据。
- 同长度 `{"n":1}` → `{"n":2}`：size 保持 7、dev/ino 保持一致，mtimeNs/ctimeNs 改变；已建立 range 的旧请求返回 `SOURCE_CHANGED`，info 表达 stale，reload 产生新 revision 并返回 lexeme `2`。
- 临时文件 rename 覆盖原文件：dev 保持一致、ino 改变；旧请求返回 `SOURCE_CHANGED`，reload 后读到 lexeme `9`。
- 删除已缓存来源：旧请求返回 `SOURCE_CHANGED`，stale 状态不再 validated；reload 返回 `NOT_FOUND`，没有旧 range 成功命中。原测试另验证从未存在的 source 为 `NOT_FOUND`。
- 既有测试验证旧分页 cursor 在 reload 后为 `STALE_CURSOR`，扫描中变化拒绝混合 revision，关闭/重启不恢复旧 workspace。

bigint metadata 实例（十进制字符串；仅为本机观察）：

| 操作 | ino 前 → 后 | mtimeNs 前 → 后 |
| --- | --- | --- |
| 同长度写入，watcher 不可用 | `27034513` → `27034513` | `1791002894400146025` → `1791002894401853772` |
| rename replacement，watcher 不可用 | `27034513` → `27034514` | `1791002894401853772` → `1791002894404913558` |

该组 dev 为 `16777233`；replacement 的 ctimeNs 为 `1791002894405116724`。这些数值不要求与 Windows 一致。

本机 native 目录 watcher 对 sample 更新观察到 `rename / sample.json`；不把事件类别、次数或延迟当成契约，也不据此证明所有 production stale 都来自 watcher。另通过仅测试内的模块替换让 production watcher 创建失败 3 次，并只冻结 interval 时钟、不推进 polling：真实文件修改、替换、删除仍在读取时被 production stat verification 检出。无需 watcher 或一秒轮询先发现变化，旧 cache 不能因此成功返回。没有加入 production 故障注入开关或改变检测架构。

## 5. Raw semantics

实际 production `RawDataService` / parser adapter 的冷扫描与缓存 range 回读结果一致：

| 原始输入 | production 结果 |
| --- | --- |
| `16752756560315677817` | `kind=number`，`lexeme="16752756560315677817"` |
| `-0` | `kind=number`，`lexeme="-0"` |
| `1.00` | `kind=number`，`lexeme="1.00"` |
| `1e+3` | `kind=number`，`lexeme="1e+3"` |
| `"16752756560315677817"` | `kind=string`，原字符串保持 |

语义断言直接来自 production adapter，不靠 JSON.stringify/parse roundtrip 推断。中文、emoji、转义孤立 surrogate、`a~b/c` 的 `/a~0b~1c` 地址及 UTF-8 字节范围通过。重复键返回 `AMBIGUOUS_OBJECT_KEY`；非法 JSON/UTF-8 返回 `INVALID_JSON`；超限为 `RESOURCE_LIMIT`，不返回截断的完整真值。

## 6. 六来源只读真实数据 gate

复用现有 runner，没有修改选择或扫描策略。六文件合计 101,689,694 bytes（约 96.98 MiB），每文件前后 streaming SHA-256/size/mtime 一致；真实 AvatarSkill unsafe integer 和 Equipment `-0` 均通过。TextMap/Floor/SoundBank 另验证十项 children page 和选定 child 的有界访问。

| 来源 / 选定 Node | 模式 / payload bytes | cold / warm ms | cold / warm read bytes | cold / warm tokens |
| --- | --- | --- | --- | --- |
| `ExcelOutput/AvatarConfig.json` `/0` | complete / 5,206 | 24.79 / 1.59 | 232,941 / 2,569 | 21,821 / 245 |
| `ExcelOutput/EquipmentConfig.json` `/56` | complete / 2,058 | 14.27 / 0.66 | 125,814 / 743 | 17,527 / 102 |
| `ExcelOutput/AvatarSkillConfig.json` `/0` | complete / 2,927 | 722.30 / 0.76 | 10,833,842 / 1,127 | 1,597,850 / 172 |
| `TextMap/TextMapCHS.json` root `""` | summary / 327 | 1,923.77 / 0.57 | 51,925,455 / 0 | 1,896,773 / 0 |
| `Config/LevelOutput_Baked/Floor/P10401_F10401001_Baked.json` `/DimensionList` | summary / 372 | 1,617.57 / 0.74 | 28,196,929 / 0 | 3,048,925 / 0 |
| `Config/SoundBankLookUp.json` `/Events` | summary / 337 | 591.05 / 0.50 | 10,374,731 / 0 | 1,241,108 / 0 |

payload 是 NodeResult 大小，不含 envelope；gate 另断言实际完整 response envelope ≤64 KiB。read 统计包含三字节 BOM sniff；summary warm read=0 仍有路径/stat 复核。cold 表示 service 尚无 range cache，OS cache 未控制，且 fingerprint 已先读取文件，不能称磁盘冷读。不包含 Electron 传输；每 source 仅一次 cold/warm observation，不是 SLA，不与 Windows 作性能排名。

runner 输出 maxRSS 为 214,768 KiB，包含 Vitest、hash 和 service，不是独立 Utility/parser 高水位。完整本机指纹与 metrics 保存在被忽略的 `artifacts/raw-real-data.json`。

## 7. Electron dev/built/packaged 与 ASAR

实际顺序：cheap gates → filesystem probe → real-data gate → `smoke:dev` → `build` → `smoke:built` → native builder → `smoke:packaged`。复用正式 runner 导出的 `validationSteps` 前四步；打包复用 `packageSteps(...)[1]`、`packagingEnvironment`、`executeSteps`。这是既有正式编排的等价路线：仅一次 production build，避免独立 `package:mac:arm64` 再构建；未新增 skip-build 脚本或改动打包策略。

| runtime | 结果 / 本轮新报告 UTC 时间 | raw cancellation observation |
| --- | --- | --- |
| dev | 通过，`2026-10-03T04:49:05.463Z` | 2.5 ms |
| built | 通过，`2026-10-03T04:49:38.357Z` | 2.0 ms |
| packaged | 通过，`2026-10-03T04:50:03.787Z` | 1.0 ms |

真实隐藏 Renderer 调用 `window.raw` → sandbox Preload → Main RequestBroker → MessagePort → Utility → RawDataService。各报告包含 raw initial/changed/deleted/restart 四阶段；逐项核对类型/词法、Unicode、range repeated read、summary、children continuation、segment、resource/invalid JSON、取消、path/operation 注入拒绝、stale/reload/cursor、删除/missing，以及 crash/restart 后 `SERVICE_UNAVAILABLE` / `WORKSPACE_NOT_OPEN` 与新 workspaceId。summary payload observation 为 319 bytes；原始 bridge/broker gate 另覆盖独立完整响应预算。

三态 BrowserWindow 实测 `sandbox=true`、`contextIsolation=true`、`nodeIntegration=false`；Main 与 Utility runtime 版本相同。没有降低安全配置或增加任意 mutation bridge。

builder 使用 `--dir --mac --arm64 --publish never`，本机 Electron distribution、`npmRebuild=false`、identity=null；未签名、公证、生成 DMG 或发布。packaged 通过 parser 实际读取；另检查 ASAR 中 `@streamparser/json` package version 为 `0.0.26`、CJS entry 存在、Main/Utility CJS 产物存在。97 项 parser package 内容记录于 `artifacts/raw-macos-package.json`。

packaged smoke 确认 runtime-only ASAR、外部数据排除、better-sqlite3 `darwin-arm64.node` 的 ASAR unpack 和实际加载。三次 SQLite Unicode/大整数文本往返均成功并 cleaned=true；normal packaged diagnostics=false，故障注入保护通过。SQLite smoke 仍是基础设施探针，不代表新增 production index。

本轮原始报告为被忽略的 `artifacts/foundation-{dev,built,packaged}-darwin-arm64.json`；仅使用本轮新时间及命令退出 0，不借用历史 Phase 1A 或旧成功报告。取消时间仅为单次观察。

## 8. Bug 判断、跨平台 contract 与局限

未发现需要修复的 production correctness bug，没有新增持久 regression。唯一失败为临时观察 watcher 在受限执行下的 unhandled EMFILE，处理与复验见第 3 节。未改 public API、NodeAddress identity、parser/raw semantics、revision architecture、资源限制或 ADR。

结合 Windows 已通过的 [实现验收](phase-2-raw-access-foundation.md)，同一 production 实现在两个正式支持平台均通过：不越界、不读取 workspace 下 symlink、revision 改变使旧访问失效、raw 类型/词法一致、有界结果/取消及稳定 machine-readable code。macOS inode/dev、canonical path 和 watcher event 细节属于允许的平台差异，不为日志一致加入平台分支。

结论可以认为 Raw Access Foundation 已通过 Windows x64 与 macOS arm64，当前 foundation 可供后续经授权的产品功能使用；依然等待用户和 ChatGPT review。

明确局限：本轮只有本机 APFS 与代表性来源，没有验证网络盘、其他文件系统、watcher 压力或跨机器行为；watcher/stat 不提供严格 snapshot isolation，能够绕过事件并保留全部 stat 信息的变化仍可能暂时不可见。首次读取的全来源校验、128 MiB read / 256 KiB token 等现有上限、分页重扫描、FIFO 内存缓存和单 parsing 队列限制继续存在。隐藏窗口 smoke 不证明正式可见产品 UI 帧率；单次测量不建立 SLA。无签名、公证、release、Source Browser、Node View、搜索、生产 SQLite index、Dataset Contract 或其他后续功能。

## 9. 文档变更与最终工作树

仅新增本报告并更新 STATUS、investigations 索引及应用 README 的 raw 验证状态。ARCHITECTURE、历史 Windows 报告、ADR、生产代码、tests、scripts、配置和 package/lockfile 均未变。

外部 HEAD 保持上述基线、工作树干净，六样本 gate 的前后 fingerprint 一致。获准的进程/临时目录复核未发现项目 Electron/验证进程或 `refatlas-smoke-run`、raw test/outside、macOS probe/fallback fixture 残留；证据为 `artifacts/raw-macos-cleanup.json`。临时探针源码已删除，out/dist、node_modules/cache 和本地报告在忽略范围，保留供 review。

最终文档检查、`git diff --stat` 和工作树清单见下方验收补记。所有文档改动保留未暂存；未 commit、建分支、push 或创建 PR。本轮验证结束，不启动后续实现。

### 最终验收补记

- 文档同步后 `npm run docs:check`：30 份 Markdown 链接/锚点通过；`git diff --check` 通过。
- 应用 HEAD 与本地 `origin/main` 仍为 `b3ee84c9d46f0ddf8ae4410eb8afdc26ba1c5e2f`；外部 HEAD 不变且工作树干净。
- `git diff --stat` 仅统计已跟踪文件，不包含下面新增的 untracked 报告：

```text
 README.md                     | 2 +-
 docs/STATUS.md                | 7 ++++---
 docs/investigations/README.md | 1 +
 3 files changed, 6 insertions(+), 4 deletions(-)
```

最终 `git status --short`：

```text
 M README.md
 M docs/STATUS.md
 M docs/investigations/README.md
?? docs/investigations/phase-2-raw-access-macos-arm64-validation.md
```

这四份文档是本轮全部可审查变更；无暂存内容，保留等待用户和 ChatGPT review。
