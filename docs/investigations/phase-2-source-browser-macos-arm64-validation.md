# Source Browser A/B/C/D 累积 macOS arm64 原生验收

日期：2026-10-04（UTC+8）。依据用户指定的 cumulative validation prompt；开始应用 HEAD 为 `b8dad104f5c83d43a38fa7940aa4dd2c81713dc1`。本报告不授权 Slice E。

## 1. Executive Summary

**结论：PASS WITH FIXES。** A/B/C/D cumulative macOS arm64 必需 gate 全部通过；正常 packaged app 的真实 picker、native wheel、用户实际触控板与 VoiceOver sanity check 均已完成。

标准 `npm run validate:foundation -- --real-data` 在单次 invocation 完成全部 11 阶段、exit 0，production build 恰一次。202 项普通测试、独立真实数据及 dev/built/packaged 三态均通过。修复 watcher 通知误标 stale；另修正两个跨平台测试 fixture。没有升级依赖、扩大权限或实现新功能。

共享 watcher 修复需要 Windows native 补验，不能用此前 Windows 结果证明本轮 diff 已通过 Windows。Slice E、Copy Pointer、完整 accessibility audit 继续延期。

## 2. Environment

| 项目 | 本轮环境 |
| --- | --- |
| macOS | 27.0.1，build 26A434；Electron os.release 为 27.0.0 |
| 硬件 | Mac14,2 / Apple M2 / 16 GiB |
| native target | uname / shell Node / Electron / packaged app：arm64 |
| Shell | Node 24.19.0 / npm 11.17.0 |
| Electron | 44.5.1；内部 Node 24.21.0 / N-API 10 / ABI 149 |
| SQLite | better-sqlite3 13.0.3 / SQLite 3.53.4 |
| UI | Svelte 5.57.1、Zag 1.44.0、TanStack Svelte Virtual 3.13.39、Paraglide compiler 2.25.4 |

默认 shell Node 26.5.0 不符合项目支持范围，仅对验收命令前置已有 nvm `v24.19.0/bin`；没有改全局默认。`file` 确认 Electron、packaged RefAtlas 和实际 unpack 的 addon 均为 Mach-O arm64，无 Rosetta/x64 产物。

获准只读 `scutil --proxy` 确认 HTTP/HTTPS/SOCKS 均为 127.0.0.1:7890，lsof 确认 listener。受限查询曾返回空设置，未以此联网。所有安装/插件/builder 命令仅使用进程级 HTTP 代理与 localhost bypass，无 direct fallback。

## 3. Initial Repository State

应用 HEAD 与本地 origin/main 均为 `b8dad104f5c83d43a38fa7940aa4dd2c81713dc1`，main 工作树 clean。未 fetch/pull、建分支或修改 Git 状态。

外部 TurnBasedGameData HEAD 为 `724b139d8c9c32d12552eb95745a4fee72bfe48b`，status 空。开始保存六样本 SHA-256/size/mtime，复用既有 streaming fingerprint 流程。

起始 package SHA-256 为 `ddeb1135c2103e1cde62eef3024e3df8031cf1a22902ed7e806a72333d57ca2c`，lockfile 为 `6b66915195ffd1ff012280f0302e2530aa2a0a9005f7e21b9f1e5f5f30daec99`。

当前 node_modules 缺 Paraglide、TanStack 和两个 Zag 直接依赖，插件 cache 为空。按现有流程执行 lockfile npm ci（420 packages）、install:electron、i18n:prepare；未改 package/lock 或依赖版本。npm 的既有 transitive deprecation/allow-scripts 提示未触发依赖升级或配置修改；实际 esbuild/native/三态运行通过。

## 4. Validation Scope

本轮实际累计覆盖 Slice A Directory/Lifecycle、Slice B Localization、Slice C Explorer、Slice D Node Browser/Inspector。历史 Phase 1A / Raw Access Foundation Mac 报告仅作阅读依据，不作为本轮通过证据。

普通测试、production service 实际 fixture、真实 Electron bridge/controller/UI、原生输入、真实 native directory picker、三态截图、打包清单和只读数据指纹分别验证各自边界。人工触控板与 VoiceOver 结果单独记录。

## 5. Slice A Results

directory/lifecycle targeted 最终 40 项通过。DirectoryPath、单层 JSON-only listing、snapshot/cursor、取消、workspace reset、TTL/淘汰、完整 64 KiB envelope 和 Unicode 长路径缩页均通过；排序仍为 directories first、组内 case-sensitive UTF-16 比较，无 localeCompare/case fold。

补充原生 temporary fixture 对 workspace 内/外目录 symlink、内/外 file symlink 各一例：listing 过滤四个链接；目录 traversal 和全部 source acquire 均返回 ACCESS_DENIED。没有在真实数据仓库创建链接。Unicode `你好🙂.json` 地址与 lexeme `1.00` 原样往返；canonical root 为 `/private/var/...`。

真实 4,000,003-byte / 2,000,001-item synthetic array scan 尚在运行时，Source B info 和目录查询均已完成；最终完成顺序为 metadata → directory → parser，最终扫描约 2283.55 ms。它验证调度行为，不设毫秒 SLA；原有受控 parser barrier 测试也通过。

acquire/read/release 后旧 read 返回 SOURCE_CHANGED，reacquire 建立新 revision 并可读取。同目录 A/B 共享 watcher，release A 保留 B owner，最终全部 release 后 watcher count=0；same-address retirement barrier、targeted queued/active cancel、registration generation、取消后回滚通过。

native fs.watch 在实际写入 `other.json` 后观察到 rename / other.json，生产 SourceInfo 变 stale。不以事件类别或次数作协议要求，也不把 stat verification 的失效归因全部写成 watcher。第 17 节修复错误的无变化通知处理。

## 6. Slice B Results

独立原生 Electron 探针实测 app.getSystemLocale()=`en-CN`，app.getLocale()=`en-US`；navigator.language=`en-US`，languages 为 `[en-US,en-CN,zh-Hans-CN]`。三态生产 Main→additionalArguments→sandboxed Preload readonly bootstrap 均为 en，与 system mapping 一致。zh variants→zh-CN、其他→en 通过专项纯映射测试；未修改系统语言。

三态 en↔zh-CN reactive messages、参数、ARIA/title、html lang、fallback、存储异常/非法值、有效偏好优先级通过。每态 runtime navigation=0；每态三次显式 reload 仅用于 persisted zh/en/invalid fixtures，与运行时切换分开。

Explorer expansion/selection/focus/scroll/active session，以及 current Node、children page、scalar segment、Inspector open/collapsed 均保留。AvatarID、Ice、1.00、-0、1e+3、relative path、Pointer、revision、SOURCE_CHANGED 不本地化；数字不经 Number/Intl 重建。

built/packaged file:// Renderer 与 ASAR 通过；Paraglide runtime 仅进入 Renderer，compiler/SDK/catalog source/plugin cache 不进入 production package。

## 7. Slice C Results

正式 shell、workspace displayName、selector、Explorer/Inspector 均在三态实际组件中通过。lazy load、collapse during load、late result/finally、retry、refresh、分页、STALE_CURSOR、metadata cache/并发/取消通过。

三态 synthetic 5010 logical rows / 35 mounted，End 后 34 mounted；真实合并树 5258 logical / 34 mounted。mounted 显著小于 logical，没有把 Windows 的精确行数当 Mac contract。

Home/End、上下左右、Space、Enter 采用实际 Electron input events，并等待可观察 focus/selection/navigation。虚拟行焦点保持、折叠父分支、refresh、locale/workspace/source switch 通过；source activation 不抢 Explorer focus。

单击/Space 选择不 acquire，Enter/双击激活；B root 成功后 commit B 再 release A，失败保留 A，快速 A/B/C/D 的 latest-intent 与同地址 cleanup barrier 通过。正常 packaged app 另外实际单击 AvatarConfig 保持中央空状态，Enter 后出现 root/94 rows；Unicode fixture 双击激活也通过。

真实 macOS picker 独立于 smoke substitution：初始 Cancel 保持空状态；Go to Folder→Open 选择 TurnBasedGameData 成功；已有 AvatarConfig + child selection 时 Cancel 保留 source/revision/Inspector；切换至应用临时 workspace 清空旧 session 并正确显示 Unicode source。一次在 modal 可观察出现前发送 Escape 没有取消，改为等待实际 sheet 并点击 Cancel 后完成验证；不算产品失败。

## 8. Slice D Results

Header filename/path/Current-Stale/size/validated 正确；validated=false 不标 invalid JSON。六种 root、empty container、complete scalar、资源失败保持旧 active source均通过。

Breadcrumb root、空 key、`/`、`~`、Unicode、numeric-looking object key 通过；decoded raw label 与 encoded navigation 分开。表格列为 Key/Index、Type、Value Preview、Children；selected child只更新 Inspector，Enter/双击导航。

1.00、-0、1e+3、16752756560315677817 exact lexeme 均通过；正常 packaged Unicode fixture 的 AX 文本另确认四个原始值。

205 children 的 Next/Previous、null cursor Restart、STALE_CURSOR 保留原页、128 metadata 窗口/单页 payload；long Unicode string 与受预算支持的 long number 的 4096 code-point segment/替换分页通过。没有提高任何预算。

Inspector selected child ?? current、Key/Index/Pointer/Children/File/Relative Path/Revision/Status/Size、Open Node及折叠状态通过。

readNode/children/segment SOURCE_CHANGED 的 controller/service 回归全部通过；三态实际 fixture mutation 验证唯一 session stale、保留旧内容、禁用 Breadcrumb/Next/Open Node/新读取。没有实现 Reload 或跨 revision 恢复。

## 9. Real-data Results

| directory | entries / sources | pages | max envelope bytes | complete listing ms |
| --- | ---: | ---: | ---: | ---: |
| root | 6 / 0 | 1 | 532 | 1.91 |
| ExcelOutput | 2253 / 2253 | 12 | 35496 | 137.04 |
| Config/Level/Mission | 2845 / 0 | 15 | 15477 | 98.29 |

逐页排序、无 duplicate/missing、response bound、取消、零自动注册通过。数量为本机本轮观察，非永久 contract。

| source | 三态实际操作 |
| --- | --- |
| ExcelOutput/AvatarConfig.json | root 94、首页、child Inspector、/0→/0/AvatarID、Breadcrumb root |
| ExcelOutput/EquipmentConfig.json | root 170、Next/Previous、/0/EquipmentID |
| ExcelOutput/AvatarSkillConfig.json | root 7040、Next/Previous、/0/SkillID |
| TextMap/TextMapCHS.json | root children 首页 100 |
| Config/LevelOutput_Baked/Floor/P10401_F10401001_Baked.json | /DimensionList，18 rows |
| Config/SoundBankLookUp.json | /Events，首页 100 |

六路径全部存在，无替代样本。仅作 generic JSON 证据，不加入字段实体解释。独立 real-data 和三态 smoke 前后 external HEAD/status/SHA-256/size/mtime 全部一致。

## 10. Accessibility / Input

Automated：真实 Electron keyboard/focus、tree/treeitem、aria-level/expanded/selected/current/busy、semantic table headers、Breadcrumb buttons、Inspector toggle、pagination buttons。Alt+Left 在三态 macOS 实际事件下返回父 Node 并恢复 table focus，无快捷键改动。

Native UI automation：正常 packaged AX 可到达 Explorer folder/source 行，table 四列暴露为 column header，Inspector toggle/child buttons 可操作。Cua 原生 scroll 将可见行从 Achievement 区间移动到 Avatar 区间，与直接赋值 scrollTop 的 smoke 区分；随后点击行仍能 Enter 激活。

Manual（用户亲自操作）：5000-file Explorer 触控板上下滚动、205-child 表格局部滚动、Inspector 折叠/展开、English↔简体中文保留 Node/page，用户回复“触控板通过。”。VoiceOver 的 Explorer 可达性/文件夹与来源区分、表格列标题、Inspector toggle 简短检查，用户回复“检查通过。”。证据保存为 ignored manual.json，按用户报告记录；没有扩写为完整 accessibility audit 或认证。人工结束后观察 selector 为 English；未由 agent 修改系统辅助功能设置。

## 11. Visual / Window Validation

逐张检查本轮 dev/built/packaged 的完整与 narrow capturePage，共六张。三栏、focus outline、数值 raw monospace、CJK/emoji、长名称省略、24px tree row、table line height 可读稳定；窄窗中央表格本地横滚/纵滚、Inspector 折叠、Breadcrumb 可操作，无全窗口失控溢出。

窗口设定为 1280×800、900×600 logical；本机窗口管理会约束默认宽度，capturePage 的实际内容截图分别为 2498×1536、1800×1136 physical pixels，不能按截图尺寸倒称窗口设定失败。截图不含原生标题栏，Retina physical/content/logical 口径分开记录。没有要求像素级等同 Windows。

截图为 ignored `artifacts/node-browser-{dev,built,packaged}{,-narrow}.png`。agent-browser CLI 不存在，未另装；采用已有真实 Electron capturePage + console/UI gate。正常 app 的 Cua capture 曾取得缩小的系统过渡图，不用该图判定布局；三态原生 Renderer screenshots 是视觉依据。

## 12. Dev / Built / Packaged

| mode | 本轮报告时间（UTC+8） | result |
| --- | --- | --- |
| dev | 2026-10-04 08:34:51.996 | PASS / darwin arm64 |
| built | 2026-10-04 08:35:12.764 | PASS / darwin arm64 |
| packaged | 2026-10-04 08:35:36.056 | PASS / darwin arm64 |

三态 BrowserWindow sandbox=true、contextIsolation=true、nodeIntegration=false，consoleErrors=[]。保留基础 bridge/SQLite/取消/崩溃/显式重启/响应性、raw/i18n/Explorer/NodeBrowser gates。普通 packaged diagnostics=false，smoke harness 未暴露。

## 13. Native / ASAR

packaged 三次 SQLite smoke 均 nativeUnpacked=true / cleaned=true，真实 addon在 app.asar.unpacked 加载并往返原始 Unicode/大整数文本。实际 unpack `.node` 是 darwin-arm64，不复用 Windows artifact。

ASAR 清单 runtimeOnly、externalDataExcluded、nativeUnpacked、compilerExcluded、pluginCacheExcluded、catalogsRendererOnly、explorerRendererOnly 全 true。Main/Preload/Utility bundle 无 Zag/TanStack/Paraglide UI runtime；包中排除 unbundled UI libraries、Svelte compiler 闭包、SDK、catalog sources、project/cache。

builder --dir --mac --arm64 --publish never，沿用 npmRebuild=false 与 identity=null，日志明确 skipped signing。未制作安装器/DMG、签名、公证、发布或改 Keychain。

## 14. Validation Runner

**完整 runner invocation：1；exit code：0；production build count：1。** 顺序为 offline i18n → format → typecheck → ordinary tests → docs → real-data → dev → production build → built → builder → packaged。没有拼接最后阶段、skip 或重试来声称单次成功。

ordinary tests：14 files passed / 1 opt-in file skipped，202 passed / 1 skipped；随后 opt-in real-data 1 passed。typecheck 0 errors / 0 warnings。独立 directory/lifecycle targeted 为 40 passed。修复都在完整 runner 开始前完成；结束后仅文档与 ignored evidence变更，不重复昂贵完整链路。

日志 `artifacts/macos-cumulative/runner-1.log`；汇总 `summary.json`；三态 `artifacts/foundation-{mode}-darwin-arm64.json`。保留现有 work/IPC/runner deadlines、安全参数及 fail-closed 代理。

## 15. Performance Observations

单次工程观察（ms），没有清 OS cache、无 SLA，不能与 Windows 跨机器/OS/cache 数字推导优劣。

| mode | 5010-row first/append | logical/mounted | Excel first/append | Avatar activation |
| --- | ---: | ---: | ---: | ---: |
| dev | 151.2 / 315.8 | 5010 / 35 | 59.0 / 105.3 | 30.4 |
| built | 145.1 / 296.1 | 5010 / 35 | 60.9 / 101.0 | 27.1 |
| packaged | 140.7 / 302.9 | 5010 / 35 | 59.7 / 104.5 | 28.7 |

End 后各态 mounted=34，scrollTop=119552；真实树 logical/mounted=5258/34。

| mode | synthetic root+children | next page | segment | Inspector update |
| --- | ---: | ---: | ---: | ---: |
| dev | 10.7 | 8.2 | 4.1 | 0.2 |
| built | 10.3 | 7.7 | 3.9 | 0.2 |
| packaged | 10.5 | 7.8 | 4.1 | 0.3 |

| mode / source | root commit | first view after root | scalar navigation |
| --- | ---: | ---: | ---: |
| dev / Avatar | 16.5 | 17.9 | 2.6 |
| built / Avatar | 17.1 | 17.0 | 1.4 |
| packaged / Avatar | 20.8 | 18.5 | 1.3 |
| dev / Equipment | 11.6 | 13.9 | 1.5 |
| built / Equipment | 13.3 | 13.6 | 1.5 |
| packaged / Equipment | 10.3 | 12.5 | 1.7 |
| dev / AvatarSkill | 655.2 | 643.1 | 1.4 |
| built / AvatarSkill | 645.2 | 639.9 | 1.1 |
| packaged / AvatarSkill | 638.0 | 636.7 | 1.4 |

root commit 是 activate→active store；first view 包括 IPC/parse/DOM，不是单独 query latency。real-data runner maxRSS=241712 KiB，包括 Vitest/hash/parser，不能作为 Utility或 UI 的独立内存上限。没有 FPS/CPU SLA 或新性能优化结论。

## 16. Platform Differences

只记录实际观察：macOS `/var` alias canonicalize 为 `/private/var`；原 Windows fixture 的 Unicode filename和长绝对路径超过本机 filesystem 限制；无文件 stat 变化的 watcher 通知会使旧实现错误 stale；本机系统 locale/navigator language不同；Retina screenshot/content/window 尺寸有区别，字体与 native select呈现不同。

Alt+Left、精确数值、locale no-reload 和支持平台原生打包没有观察到需平台专用行为的差异。未新增 process.platform production 分支。

## 17. Fixes Made

| 观察/失败 | 分类 | 处理与验证 |
| --- | --- | --- |
| 缺失依赖、默认 Node 26 | 环境 | 按既有 lockfile 补齐；命令级 Node 24，版本不变 |
| ENAMETOOLONG / 非 canonical root | test harness / 平台限制 | 调整合法 fixture，仍验证原预算 |
| 无 stat 变化仍 SOURCE_CHANGED | 产品 / 共享生命周期 | watcher hint 复核修复，确定性回归和完整 runner |
| 一次性探针 rejection / 等待不存在字段 | ignored harness | 改变 fixture 顺序/观测假设后复验；停止所属卡住进程 |
| modal 未出现时 Escape 未取消 | 原生 UI 自动化时序 | 等待可观察 sheet 后按 Cancel |
| agent-browser CLI 不可用 / Cua 过渡截图 | 外部工具 | 已有 Electron screenshots、console 与实际 native UI 证据；未安装替代依赖 |
| locale profile 留存 | ignored probe 清理 | 最终复核识别并删除，二次清理 exit 0 |

### Watcher hint 误标 stale（production）

原 lifecycle test 在并行场景 fresh read 返回 SOURCE_CHANGED，隔离场景通过。测试内诊断记录 dev/ino/size/mtimeNs/ctimeNs 与 registration stamp 完全一致；同名通知本身不能证明当前文件变化。新增确定性回归：发出未修改文件的 rename hint，旧实现即使原内容完全不变仍返回 SOURCE_CHANGED（修复前 exit 1）。

修复 `src/utility/raw-service.ts`：watcher 回调对 current owner 复用路径/stat verify；同一 source 至多一个 pending verification，重复通知合并；实际变化、删除、替换、链接仍失效。异步完成继续以 registration identity 防止影响新会话。保留 parser/cache/协议/预算，不新增 diagnostics API 或 darwin 分支。

回归同时验证 unchanged hint 后能读、SourceInfo current/validated；实际写入后 watcher verification使旧读取 SOURCE_CHANGED。原 same-address barrier、全部普通/真实/三态/原生探针通过。

检测边界明确：通知作为 hint，变化依已有路径/stat signature；恶意保留所有 stat 的修改不在严格 snapshot 保证内。没有把任何一个 watcher event当跨 revision 的真值。**Windows native revalidation required：Yes**，共享生命周期行为改变，Mac 的通用测试不能替代 Windows native gate。

### 跨平台 fixture（test/harness）

`tests/raw-directory.test.ts` 的 190-CJK filename与深路径在 Mac ENAMETOOLONG；首次只缩 filename仍超绝对路径限制。最终使用四段目录/70 CJK 字符合法文件名/100 entries，仍确实触发完整 response 缩页并验证无缺失，未放宽生产 bound。内部 RawDirectory budget test用 realpath(root)，符合生产 canonical workspace 不变量，解决 /var alias ACCESS_DENIED。

改动限定在该测试文件，既有 skip/预算不变，最终 40 targeted、202 ordinary 和 runner 通过。

### 一次性探针（ignored harness）

初版在 acquire 后创建同目录文件并发生未处理的 scan rejection；修正为先准备全部 fixture、立即捕获 rejection。下一版错误等待不存在的 read-task budget 字段而卡住；已精确停止所属 PID并清理其专用 fixture，改为观察实际 source-bound read task。两次失败均不计通过，不增加 timeout。最终修复前/后原生探针均 exit 0；最终结果见第 5 节。

## 18. Remaining Limitations

Slice E Reload/location-missing/Return Root pending；Copy Pointer deferred，未 probe/放宽 clipboard permission；full accessibility audit 未做。实际触控板与 VoiceOver sanity check 已通过，范围见第 10 节。

仅本机 APFS/代表样本；无网络盘/其他 filesystem/恶意同-stat严格隔离承诺。分页/巨大 scalar/resource budgets 和单 parser queue限制不变。没有搜索、SQLite search index、Dataset Contract、references/graph/tabs/history/compare/diff/theme或发布工作。

## 19. Final Platform Status

| platform | A/B/C/D status |
| --- | --- |
| Windows x64 | 历史实现 native gate已通过；本轮 shared watcher diff 尚未 native 补验 |
| macOS arm64 | A/B/C/D 累计 PASS WITH FIXES；自动/三态/真实数据/原生 picker/wheel/人工触控板/VoiceOver sanity check 均通过 |

不宣称当前 diff 的 normal browsing path已同时通过两个平台，更不宣称 Source Browser complete。

## 20. Recommended Next Step

评审本报告与最小 diff→回 Windows 原生 x64 执行 directory/lifecycle targeted，再执行 `npm run validate:foundation -- --real-data`（保持所有 gate、单次 production build）→再决定是否授权 Slice E。本轮不自动推进。

## 21. Final Diff

生产：`src/utility/raw-service.ts`。测试：`tests/raw-directory.test.ts`、`tests/raw-lifecycle.test.ts`。新增本报告；同步 README、docs/README、docs/investigations/README、STATUS、ARCHITECTURE、PROJECT、ROADMAP 与 PERFORMANCE。package/lock、public API/IPC/types、资源预算、安全配置、ADR、外部数据未改。

## 22. Cleanup

标准 runner各阶段自动清理自身进程组、fixture/profile；原生 path fixture 已清理。人工检查完成后精确停止本轮正常 packaged app（PID 92319）及其子进程，删除 `refatlas-cumulative-ui-ZgF53z`。最终检查发现独立 locale 探针退出后留下临时 profile `refatlas-cumulative-locale-PGuhx4`，另行清除；临时 probe 脚本已删除，日志/JSON/截图保留。

最终外部六样本 SHA-256/size/mtime、HEAD/status 与 baseline 完全一致；应用 HEAD、package/lock 哈希、系统代理也未变。最终 owned processes 与本轮临时 fixture 均为零，记录见 ignored cleanup.json。无 remote write、commit/push/branch、签名或Keychain修改；大型截图/JSON/日志/build产物保持 ignored。最终 `docs:check` 检查 36 个 Markdown/anchors，`format:check` 与 `git diff --check` 均通过；没有生产输入在最终 runner 后变化。
