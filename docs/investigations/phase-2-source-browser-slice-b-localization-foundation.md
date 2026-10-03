# Phase 2 Source Browser Slice B：Localization Foundation

日期：2026-10-03（UTC+8）。应用起点 `1b141bde8c8bf623c357655f0f00c4861ffeb40b`（Complete Phase 2 Slice A），起始工作树干净。依据 Slice B 提示、已评审 preflight 与 ADR-0007～0010。用户明确接受 Slice A review 后继续开发，macOS 累计 gate deferred，未豁免。

## 1. Executive Summary

正式实现 Renderer-only Paraglide、en/zh-CN catalogs、类型化入口、系统语言窄 bootstrap、挂载前初始化、存储/no-reload 切换、Svelte reactive locale、html lang/dir、metadata formatters 与稳定错误 presentation。

普通 tests 148 项通过（真实数据普通模式显式 skip），51 项 targeted tests 通过；typecheck 与 dev smoke 通过。Windows x64 各验收阶段均通过（末阶段 ASAR 检查脚本修正后单独复验，详见第 13 节），全程一次 production build。macOS arm64 not yet validated / cumulative Source Browser validation deferred。技术接口可供 Slice C 使用，推进仍需 review 与用户授权。

没有正式 selector、settings/product shell、Source Explorer、Node Browser、SourceSession、Zag、TanStack Virtual、搜索或持久索引；历史 Foundation 诊断文案未整体迁移。Raw protocol/parser/service 保持原语义。

## 2. Dependency / Version

正式 devDependency `@inlang/paraglide-js@2.25.4`，MIT。固定为 preflight 已测试版本，没有升级 Vite/Svelte/TypeScript。2026-10-03 经核实的本机 7890 HTTP 代理复核 [官方固定版本 metadata](https://registry.npmjs.org/@inlang/paraglide-js/2.25.4)：peer Vite >=5、TypeScript >=5.6，与 Vite 7.3.6 / TS 6.0.3 相容；[官方编译文档](https://paraglidejs.com/compiling-messages) 与 [locale 文档](https://paraglidejs.com/basics) 仅作为当前 API 参考，具体依据固定发布包源码与实测。

新增 lock entries 61 个（含跨平台 optional variants），实际安装 27 包；既有包版本没有变化，也没有删除。SDK 3.0.6、Lix/WASM、jiti、unplugin、valibot、JSON5 等为 dev/build 依赖；生产 dependencies 仍只有 streamparser 与 better-sqlite3。lockfile 部分既有 peer/dev flags 是 npm 解析图的调整，非混入升级。

message-format 插件固定 4.4.0，不另增加 production package。固定 [发布资源](https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4.4.0/dist/index.js) 118,959 bytes；SHA-256 `9486558801c08ebb018223c51c2044b6c3c23fc2a8c0e7894a57882b34feb6ca`。插件 registry metadata 未声明 license；不将 compiler 的 MIT 字段错误套用于插件。compiler/SDK 的依赖许可证以 lock metadata 为准，jco optional native artifacts 含 Apache-2.0 WITH LLVM-exception，均不进入应用运行时包。

## 3. Localization Architecture

Main ready 后 `app.getSystemLocale()` → pure normalize → trusted additionalArguments → sandboxed Preload frozen readonly `window.appPresentationConfig` → Renderer locale lifecycle → generated Paraglide → Svelte consumers。

bootstrap 仅 `{ initialLocale: 'en' | 'zh-CN' }`。重复或无效参数回退 en；不提供任意 app/fs/IPC 信息、原始 system locale 或测试修改系统语言能力。独立 shared presentation types/helpers 不导入 Paraglide。统一 Renderer i18n 入口管理 locale、messages、formatters、errors；Main/Preload/Utility 无翻译 runtime。

## 4. Message Catalog

tracked source 为 `project.inlang/settings.json`、`messages/en.json`、`messages/zh-CN.json`。base en，supported en/zh-CN；稳定 flat IDs，工具型短文案，限 app/common/workspace/status/unit/error。

generated 路径 `src/renderer/src/i18n/generated` ignored，不手改/格式化。SDK project metadata 全部 ignored，只有 settings tracked。英文 diagnostics_fallback_probe 故意没有中文，只在隐藏 localization harness/tests 中使用，不属于正式 visible product copy。

## 5. Locale Initialization

Main 系统语言 `zh*`（含 zh-TW/zh-Hant/zh-Hans）→ zh-CN；其他、空值或异常 → en。有效 localStorage `refatlas.locale`（只接受精确 en/zh-CN）优先于 bootstrap，再回退 en。

Renderer 在 mount App 之前完成 storage 读取、Paraglide初始化、html lang/dir 与 Svelte store 更新，避免先挂英文再切中文。storage getter/getItem/setItem 异常非 fatal；bootstrap/存储都不使用 URL strategy。

## 6. Runtime Switching

Paraglide strategy `globalVariable → baseLocale`，switch 使用 `setLocale(locale, { reload:false })`。readonly Svelte store 驱动明确的 locale dependency；message/formatter 调用显式传入 locale。同步 html lang=en/zh-CN、dir=ltr；无导航/remount。

隐藏真实 Svelte harness 连续验证 en→zh-CN→en→zh-CN 的可见参数消息、ARIA、title、fallback。组件 DOM identity、counter、opaque token、现有 App interaction state、Data Service generation 均保留。Main 记录 runtime navigation=0；另外三次显式 Renderer reload 专为 persistence fixture，明确区分口径。

## 7. Raw Boundary

不本地化 raw field/string/numeric lexeme/path/Pointer/SourceAddress/revision/machine code。fixture 的 AvatarID、Ice、1.00、ExcelOutput/AvatarConfig.json、/0/AvatarName、opaque revision、SOURCE_CHANGED、孤立 UTF-16 D800 在切换前后序列化与码元一致。

没有 locale 字段进入 RawCommand/RawError；没有 Utility/UI 翻译耦合。raw service/parser 的回归与显式 real-data gate 使用原生产实现。

## 8. Error Presentation Mapping

`formatRawError(error, locale)` 返回新的 title/message，覆盖 WORKSPACE_NOT_OPEN、NOT_FOUND、SOURCE_CHANGED、STALE_CURSOR、INVALID_JSON、RESOURCE_LIMIT、ACCESS_DENIED、CANCELLED、BUSY、TIMEOUT、SERVICE_UNAVAILABLE、SERVICE_EXIT、INTERNAL。

RESOURCE_LIMIT + RESPONSE_BYTES 使用专门文案；内部 detail 保持原样。其他/未知 code（包括 __proto__）安全回退 generic internal。Map 查找避免对象原型键问题；不回显任意 details 或把历史 Foundation message 当翻译真值，输出规模由 catalog 有界。

## 9. Formatters

`formatUiCount` 与 `formatByteSize` 只接受非负安全整数 metadata，拒绝负数、小数、NaN/Infinity、超安全整数。共享 Intl.NumberFormat 按 locale 格式化；bytes 使用十进制 B/kB/MB/GB/TB/PB，最多一位小数，byte 的名称可本地化。

没有泛化 formatNumber/raw number helper，不解析或改写 numeric lexeme。en/zh-CN 的计数 grouping 可能相同，测试不要求人为制造语言差异；byte 单位及应用消息确实随 locale 更新。

## 10. Build / Generate Pipeline

install → 自动 prepare 固定插件 → compile declarations → typecheck/test/dev/build。CLI 与 Renderer Vite plugin 共享 i18n.config.ts；没有 middleware/SSR/URL locale 或 Vite major 升级。dev/typecheck/test/build/dev smoke 自动前置 compile；standalone package/full runner 自动 prepare，fresh checkout 不依赖手工生成。

准备脚本只有缓存缺失才通过 proxyEnvironment + Node --use-env-proxy 下载，25s fetch / 35s child budget，512 KiB 上限、固定 hash、临时文件 rename；缓存损坏 fail closed，不 silently upgrade。不更改 npm/git/system 代理。

SDK URL cache 经固定源码核实为 network-first，因此 settings 引用本地 `.cache/i18n/message-format-4.4.0.js`。`--offline` 替换 fetch 拒绝请求，要求零可解析网络地址；SDK 仍探测一次无法解析成 URL 的相对 module URI，其本地 import 已成功，不产生 HTTP 请求。初始 gate 将该本地探测误计为网络，定位后纠正分类，并未放行任何 fetch。

已删除经绝对路径核实的 ignored generated 目录，再直接运行 typecheck：自动生成恢复、0 errors / 0 warnings。`npm ci --dry-run --ignore-scripts --offline` 通过，核对 lock 安装一致性；这不是全新机器或完整离线 npm ci 的证据。完全离线 fresh machine 仍需先准备依赖、Electron 和固定插件资源。

## 11. Electron / Packaging

dev / built / packaged 均通过。built 与 packaged 使用同一次 production build；ASAR guard 使用 Windows 原生路径后通过。三态通过真实 Main→Preload→Renderer 校验只读 bootstrap、reactive DOM/ARIA/title、state/raw、fallback、persisted en/zh、invalid choice 与 html lang。

正常打包 guard 不暴露 runLocalizationSmoke，保持 sandbox/context isolation/Node API 禁止。最终 Main/Preload（包括 Utility chunk）与 ASAR 的 non-Renderer code 检查 translation/SDK 标记；ASAR 排除 @inlang/@lix-js、catalog source、project/cache，并继续验证 native ASAR unpack 与 SQLite。

## 12. Tests

unit/localization：normalize/guard、偏好优先级、read/write failure、初始化/切换、typed parameter、en fallback、13 code mapper/unknown/response limit、formatter safe metadata、raw lexeme/address/surrogate。

type fixture：合法 generated message、必填参数、缺失参数、未知 ID、invalid locale 由 @ts-expect-error 验证；generated Locale 与 UiLocale 双向兼容。

renderer/Electron：真实 Svelte DOM 而非 mocks；no-remount、existing App state 与 Data Service generation、readonly bridge；三次显式 reload 验证存储恢复。

config/pipeline：Renderer-only plugin、local pinned/hash plugin、strategy/declarations、single production build 与任何 gate 失败停止。普通 full tests 148 passed，1 real-data skipped；51 targeted passed。无覆盖率/测试数量配额。

## 13. Windows Validation

环境 Node 24.21.0 / npm 11.16.0 / Electron 44.5.1，Windows x64。最终使用 `npm run validate:foundation -- --real-data`：offline compile → format check → typecheck → full tests → docs → real-data → dev → 一次 production build → built → builder → packaged。

首轮 full runner 前六步通过，在第七步 npm 子进程启动时返回 3221225477 / 0xC0000005，没有 JS stderr。尚未开始 production build。只读事件/进程检查无对应事件、无残留；同环境最小 npm probe 和直接 dev smoke 成功，不能据此声称根因已确定。

改为完整 runner 直接调用现有 smoke.mjs（准备/compile 已由前置阶段保证），减少 npm wrapper。没有自动 retry、延长 timeout 或降低安全设置；加入编排入口断言后复验。另有一次诊断 probe 因错误地从应用目录 resolve 全局 npm CLI 而 MODULE_NOT_FOUND，纠正为 Node 安装目录后通过，此为调查命令错误，不是产品失败。第二轮 runner 前十阶段通过（production build 恰一次），packaged 应用全部 runtime 验证成功，但新增 ASAR extraction guard 使用归一化 `/` 路径触发 Windows API path.sep 解析错误。读取依赖实现确认后修正为原生 join 路径，属于本轮检查脚本 bug，不是应用/包内容错误。

只改变检查脚本，格式化后通过既有 executeSteps 执行最后 packaged smoke 阶段；前后 ASAR、Main/Utility/Preload/Renderer SHA-256 全部一致。没有追加 skip-build/from-build CLI、重建包、retry loop 或修改运行时代码。最终 11 阶段证据齐备；**不能声称完整命令曾在单次 invocation 全部退出 0**，因为最后 stage 经修正后单独复验。Windows gate validated / awaiting review。


| Mode | measuredAt（UTC） | Runtime navigation | Persistence fixture reload |
| --- | --- | ---: | ---: |
| dev | 2026-10-03T09:28:16.317Z | 0 | 3 |
| built | 2026-10-03T09:28:23.182Z | 0 | 3 |
| packaged | 2026-10-03T09:31:40.794Z | 0 | 3 |

真实数据 gate 2026-10-03T09:28:09.304Z（UTC）：1/12/15 页，6/2,253/2,845 个条目；目录自动 source 注册均为 0。六个样本 hash/size/mtime 前后一致，外部 HEAD/status 同样一致。

## 14. macOS Status

macOS arm64 not yet validated；deferred to cumulative Source Browser macOS gate，未豁免。Slice A 新 directory/lifecycle 与 Slice B localization 均需累计原生验收。用户计划 B/C/D 后在 Apple Silicon pull 同一实现统一执行；不能借用旧 Foundation Mac gate 或 Windows preflight spike。

## 15. Dependency / Bundle Impact

Slice A 当前 production artifact 基线：Renderer JS 114,052 bytes / gzip 26,494 bytes；ASAR 1,063,759 bytes。未清 OS cache，不比较启动/交互 SLA。新增 compiler 的 61 lock entries 为 build/dev 图，不代表最终 package 增量。

最终 Renderer JS 152,262 bytes / gzip 34,107 bytes：相对基线 +38,210 / +7,613 bytes。ASAR 1,104,278 bytes：+40,519 bytes，207 entries。增量包含 localization runtime/messages、错误/formatter、真实 Svelte 诊断 harness，不是单纯第三方 runtime 对比。

ASAR 与本轮 61 个新增 dev lock entries 逐一对照，全部排除；@inlang/@lix-js、catalog source、SDK metadata、插件 cache 均不存在。最终 Main/Preload/Utility chunk 无 generated message/runtime/compiler 标记；Renderer 内确有编译后的消息并通过真实切换。SQLite native unpack、正常打包诊断保护继续通过。没有微优化或启动 SLA 宣称，不采用 preflight 独立 spike 数字替代本应用。

## 16. Known Limitations

仅 en/zh-CN，所有 zh variants 归中文；存储不可用时无法保证跨 reload 保留用户选择。没有正式 selector 或 SourceSession；state continuity 使用 symbolic fixture + 当前 App state。历史 Foundation 诊断仍有中文硬编码，不作为正式 Source Browser UI。

离线生成前必须准备依赖/Electron/固定插件；没有验证全新机器完全离线安装。macOS 新实现未测，仍为累计 gate。目录 stat 等 Slice A 限制保持历史报告，不在本片改动。一次 npm startup 原生异常未能确定根因；直接 smoke 编排后验收通过，不声称已修复 Node/Windows 根因。

## 17. Final Diff

新增 shared presentation contract、Renderer i18n lifecycle/messages/formatter/error 入口、隐藏 Svelte harness/fixture/smoke、catalog/settings、固定 compile config、prepare/compile scripts、localization unit/types。

修改 Main/Preload/bootstrap、Renderer startup/env/guard、Renderer-only Vite plugin、package/lock、generated ignore/formatter scopes、pipeline/bundle/ASAR guards、权威 docs/索引。本片没有修改 raw shared/service/parser 或外部来源。

最终 25 个 tracked 修改 + 17 个新文件，无暂存、commit/branch。

```text
修改：
.gitignore
.prettierignore
README.md
docs/ARCHITECTURE.md
docs/DEVELOPMENT-PROCESS.md
docs/PERFORMANCE.md
docs/README.md
docs/ROADMAP.md
docs/STATUS.md
docs/investigations/README.md
electron.vite.config.ts
package-lock.json
package.json
scripts/package.mjs
scripts/smoke-worker.mjs
scripts/validate.mjs
src/main/index.ts
src/preload/index.ts
src/renderer/index.html
src/renderer/src/env.d.ts
src/renderer/src/main.ts
src/renderer/src/smoke.ts
tests/config.test.ts
tests/pipeline.test.js
tsconfig.json

新增：
docs/investigations/phase-2-source-browser-slice-b-localization-foundation.md
i18n.config.ts
messages/en.json
messages/zh-CN.json
project.inlang/settings.json
scripts/i18n-compile.mjs
scripts/i18n-prepare.mjs
src/renderer/src/LocalizationHarness.svelte
src/renderer/src/i18n/errors.ts
src/renderer/src/i18n/formatters.ts
src/renderer/src/i18n/index.ts
src/renderer/src/i18n/locale.ts
src/renderer/src/localization-fixture.ts
src/renderer/src/localization-smoke.ts
src/shared/presentation.ts
tests/localization.test.ts
tests/localization.types.ts
```

## 18. Cleanup

外部起点与结束 HEAD 均为 `724b139d8c9c32d12552eb95745a4fee72bfe48b`、clean；六个读取样本前后 fingerprint 一致，real-data gate 明确通过。所有变更 fixture 在 runner 自身临时 profile/source 内，用户系统 locale 和真实数据不变。

正式 compile 产物/cache/artifacts 保持 ignored；无独立 temp spike。结束原生进程查询中匹配本项目的 Node/Electron/RefAtlas/esbuild/app-builder 为空，refatlas-* 临时目录为空。production 包与复验前 hash 一致，package/lock 只有上述依赖图变化，既有包无版本升级/移除。

本轮没有 registry/npm/git 永久 proxy 写入，仅命令或当前 shell 环境。结束只读 ProxyEnable=1；此前规划阶段观察值为 0，未由本轮操作更改，也不替用户回滚外部配置变化。Markdown 仅本轮受管修改按 repository LF 保存，不批量重写历史证据。最后 docs/format/diff check 通过，工作树保留，无 commit/branch/push/后续 slice。
