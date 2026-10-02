# Phase 1A：开发规范与工具链清理

日期：2026-10-02（UTC+8）。应用基线 `bd5b7ae Complete Phase 1A: building infrastructure for the APP`，开始时工作树干净；外部数据 HEAD `724b139d8c9c32d12552eb95745a4fee72bfe48b`，开始时工作树干净。本轮是工程卫生任务，不新增产品能力或已接受 ADR，不推进 Phase。

## 1. Prettier 与格式范围

官方 npm registry 的 latest 元数据在安装前通过确认的系统 `http://127.0.0.1:7890` 代理复核：Prettier 3.9.9（Node ≥14），prettier-plugin-svelte 4.1.1（Node ≥20，peer Prettier ^3.0.0、Svelte ^5.0.0）。当前 Node 24.21.0、Svelte 5.57.1 与之兼容，两包精确锁为开发依赖；未更新其他已有依赖，未使用 force/legacy-peer-deps。

安装使用当前命令环境代理、仓库缓存、`--ignore-scripts --no-audit --no-fund`；formatter 不需要安装钩子，未重新运行 Electron/native 安装脚本。lockfile 只新增两包及根级声明，未被 formatter 重排。未永久修改 npm/git/网络配置。沙箱外查询/安装是明确获准的执行，不是代理回退。

仓库配置为 `semi: false`、`singleQuote: true`、`printWidth: 100`，显式加载 Svelte 插件。`format` 与 `format:check` 使用相同显式路径/glob：src 的 TS/JS/Svelte/HTML/CSS、tests 的 TS/JS、scripts 的 MJS，package.json、electron-vite、electron-builder、Vitest、Svelte、两份 tsconfig 与 formatter 配置。

首次执行处理 35 个受管文件，其中 30 个产生格式输出（28 个既有文件、2 个新 scripts/tests 文件），5 个内容不变。既有修改涉及 src 的 13 个文件、tests 的 5 个文件、scripts 的 7 个文件，以及 package.json、electron.vite.config.ts、tsconfig.json。原基础代码大量语句挤在一行，formatter 展开后的源码行数 diff 较大，但范围受限、没有历史文档机械重排。

`.prettierignore` 排除 Markdown、lockfile、docs、tools、node_modules、.git、.cache、out/dist、artifacts/coverage。未执行 `prettier .`，未进入外部数据仓库；历史调查/evidence/调查工具未格式化。格式化不隐式进入 build，不引入 ESLint 或 style policy 重构。

## 2. 原始测试逐项 Review

原始为 5 文件 / 35 项；参数化输入单独计数。保留所有原始有价值行为场景，不以删除或增加数量作为目标。

| 文件／原数量 | 逐项价值与处理 |
| --- | --- |
| protocol / 15 | 上下限；11 个参数化非法输入；空/数组/缺字段/ID 不匹配；结果/错误形状；UTF-8 大小与 BigInt/circular。均保留：协议边界与安全拒绝是高风险行为 |
| request-broker / 10 | 乱序匹配/重复 ID；退出/恢复/旧代次响应；取消/迟到成功；跨窗口取消拒绝；窗口销毁；超时/ID 复用；满负载控制槽；畸形/超限响应；错误结果；发送失败。全部保留；两类非法响应从循环改为 it.each，最终该文件 11 项 |
| utility / 4 | 有限异步工作；批次取消；已取消信号；真实极小临时 SQLite Unicode/整数文本/cleanup。全部保留；数据库检查是本地集成，不冒充 Electron native 验证 |
| scripts / 4 | 缺代理拒绝；错误代理端口拒绝；子进程非零退出；超时。全部保留，超时测试用独立临时 PID 文件证明子进程确实启动且退出后 ESRCH，不仅匹配错误字符串 |
| config / 2 | 第一项改为导入 electron-vite 配置后的 preload/CJS 结构化断言，保留很小的官方 modulePath import guard；第二项保留格式不敏感的 ASAR/native/file allowlist YAML guard。删除源文件一整行安全选项、preload 字符串、目录名未出现和任意 never 字符串断言，分别改用真实安全运行时、实际包内容与实际 CLI 参数 |

新增 pipeline 文件 7 项：三个原生目标的独立构建/打包参数；完整流水线的可观察命令顺序；build、built smoke、builder 三种失败的 fail-fast 参数化场景。没有 mock Electron 内部，也没有把脚本编排测试当作真实构建证明。最终 6 文件 / 43 项：增加来自参数化计数和实际新增的编排风险，不是 coverage/test-count 目标。无低价值原始行为测试删除，删除的是脆弱或不足以支持结论的断言。

真实 smoke 也发现并调整一处 brittle timing assertion：MessagePort close 可以先使 pending 返回 SERVICE_EXIT，Utility exit 事件随后才把 Main 状态置为 stopped。原测试立即要求 stopped，偶发失败。现改为最多 3 秒、间隔 10 ms 的有界状态观察（与既有 stop 上限一致），仍必须验证 stopped、退出期间请求拒绝与显式恢复；不是重跑失败操作，不加长 120 秒 runner 总预算，不修改服务生命周期。

长期 Test Policy：风险、行为、边界、回归价值决定规模；不按 LOC/函数数/数量/coverage quota 分配；优先 observable behavior/不变量/安全/bug regression，同类输入参数化，普通测试快、确定、离线；真实 Electron/IPC/native/package 必须有集成证据，不用 mocks 代替。

## 3. 昂贵命令与 Cadence

AGENTS 只保存长期 Formatter、Test、Expensive Command 原则；具体命令、四层 cadence 和重试流程在 [DEVELOPMENT-PROCESS](../DEVELOPMENT-PROCESS.md)，入口在 [应用 README](../../README.md)。

cheap → build → integration → packaging，按变更风险选最小有效集合。修改 RequestBroker 先 targeted test；打包/native/ASAR/platform 边界变化与阶段验收才运行更高层。没有新信息不重跑失败；同类昂贵命令连续失败两次停止重试、调查根因、提出新假设；timeout 先调查，不循环加长等待。scripts 无重试循环，保留有限超时、失败码和自身进程/临时目录清理，代理始终 fail-closed。

## 4. 重复构建结论与实现

确认旧流程 `build → smoke:built → package:*` 的 package 再次调用 electron-vite build，重复生产构建。新增 `validate:foundation` 是简单顺序 runner：format:check → typecheck → test → docs:check → smoke:dev → production build → smoke:built → builder → smoke:packaged。共用已有 runProcess 与正式打包参数，不增加第三方 task runner、缓存或 fingerprint/mtime 状态。

开发态 build 与生产 build 的配置不同，前者保留且先运行。完整 runner 生产构建只执行一次，built smoke 与 builder 消费同一轮成功输出；任何前置失败阻断后续步骤。独立三目标 package 命令继续无条件先 build，不因 out 已存在而跳过，不提供独立 skip-build/from-build 入口。运行期间禁止并行修改输入或覆盖 out/dist；单独 smoke 命令仍要求调用者先准备最新对应产物。

实际安全报告来自 Preload 的 process.contextIsolated/process.sandboxed 与 Renderer 无 Node API 的运行时断言，而非回报声明常量。一个固定内部 attestation channel 仅供 Main 的 smoke 收集，校验窗口、主 frame、URL、大小与精确字段；公开桥仍是原六个方法，不暴露任意 IPC。runner 检查实际证明的隔离/Node/sandbox。打包 smoke 使用 electron-builder 已有依赖中的 ASAR 工具读取实际包目录，确认只有 out、package.json 和运行时 node_modules、生产入口存在、无外部数据目录，并验证目标 native 的 unpack header/物理文件；不新增解析依赖或复制 native 文件。普通打包诊断拒绝、SQLite/取消/崩溃恢复仍使用真实隐藏窗口窄桥。

## 5. 实际验证

| 实际命令／检查 | 结果 |
| --- | --- |
| 官方 npm latest 元数据查询（curl 显式 7890 proxy）与 npm install | 两个精确 formatter 开发依赖安装成功；没有其他依赖升级 |
| `npm run format`、`npm run format:check` | 首次受限范围格式化完成，最终格式检查通过 |
| `node --check`（package/validate/smoke-worker） | scripts 语法通过 |
| `npm ls --depth=0 --offline` | 精确依赖树有效，无 peer/engine 错误 |
| `npm test -- tests/config.test.ts tests/scripts.test.js tests/pipeline.test.js tests/request-broker.test.ts` | 4 文件 / 24 项通过 |
| `npm run typecheck` | TypeScript / Svelte 0 errors、0 warnings |
| `npm test` | 6 文件 / 43 项通过 |
| `npm run build`、`npm run smoke:built`（竞态修正后的最小验证） | 生产构建与真实 built smoke 通过 |
| `npm run package:win:x64`、`npm run smoke:packaged` | 独立命令先 build 后 builder；ASAR/native/SQLite/诊断保护通过 |
| `npm run validate:foundation`（最终） | 九阶段全部通过；dev/built/packaged 真实链路通过，production build 只执行一次 |
| `npm run docs:check` | 18 份 Markdown 的本地链接/锚点通过 |
| `git diff --check`、忽略规则、Git 状态与只读数据起止核对 | whitespace 通过；产物/依赖/cache 被忽略；外部 HEAD 与干净工作树不变 |

两条打包路径都从已有 out/dist 开始，并在旧 out/main 中加入本轮临时 stale 标记：独立 package 与完整 runner 各自成功清除标记。阶段日志明确表明生产 build 在 builder 前执行；完整 runner 中开发构建先于生产构建，built smoke 后直接 builder，没有再次生产构建。ASAR 实际只有 out、package.json、运行时 node_modules；不含旧标记、调查工具、外部数据或 formatter 开发依赖。所有 synthetic SQLite 结果 cleaned=true、nativeUnpacked=true，普通打包模式诊断拒绝通过。

最终成功 smoke 结构化报告保留在被忽略的 artifacts/foundation-{dev,built,packaged}-win32-x64.json；只根据当次成功退出与新报告认定结果，不提交这些产物、不把本轮自动采集的时序当成新性能基线。

### 失败、调查与修正

1. 首次完整命令在 typecheck 阶段发现 getLastWebPreferences 不属于当前 Electron 44.5.1 的受支持类型 API，未进入 build/package。未用类型 cast 绕过，而改为支持的 Preload 运行时安全证明与 Renderer 断言；最小 typecheck/format/docs 检查通过后继续。
2. 第二次在 packaged smoke 的 ASAR header 检查失败：目标 native 文件存在且真实 SQLite 已通过，但 Windows 的 @electron/asar 使用平台路径分隔符，传入 POSIX 路径不能查询 header。只读检查目录与工具实现确认根因后，使用 node:path.join 修正；最小 header 检查通过，再验证独立 package/smoke。
3. 随后的完整命令在 built smoke 揭示上述 close/exit 事件顺序假设，未进入 builder。确认现有生命周期事件顺序后只修正 smoke 的有界状态观察，先运行 typecheck/build/built smoke，再完成最终九阶段验收。

失败均保留非零退出、后续阶段未执行；没有在无新信息时机械重跑、无限 retry、代理回退或持续增加 timeout。本轮已有流程与配置不足均已修正，没有遗留 Windows 验收阻碍。

## 6. 文档与边界

实际同步 AGENTS、应用 README、DEVELOPMENT-PROCESS、STATUS、调查入口及本报告。ARCHITECTURE、ROADMAP、PROJECT、ADR、PERFORMANCE 和历史调查/evidence 不改写；没有新的真实性能结论，不改变原性能数字。

macOS x64 Phase 1A gate：**未验证**。macOS arm64 Phase 1A gate：**未验证**。保留对应原生机器本地验证命令，不新增 workflow、不声称脚本已提供等于平台已验证。未 commit/push/建分支/创建 PR 或 issue，未操作远程 GitHub 状态，外部数据保持只读。

外部数据起止 HEAD 均为 `724b139d8c9c32d12552eb95745a4fee72bfe48b`，工作树均干净；未扫描、写入、格式化或复制数据。应用 HEAD 仍是 `bd5b7ae`，本轮修改保持未提交。剩余决策仍是既有工具链长期接受与 macOS 原生 gate，formatter/test policy 不新增 ADR。
