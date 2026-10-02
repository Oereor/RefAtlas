# RefAtlas 开发约束

重大工作前阅读 `docs/README.md`、`docs/PROJECT.md`、`docs/STATUS.md`、`docs/ARCHITECTURE.md` 与相关 `docs/decisions/` ADR、`docs/investigations/` 调查。权威文档在本仓库版本管理；调查证据不是当前架构决定。

影响架构、状态、路线图或性能事实的实现与相应权威文档应在同一审查变更中更新；不影响文档事实的琐碎改动无需强制改文档。性能变化更新 `docs/PERFORMANCE.md`。

## 不可违背的边界

- 一切公网访问必须经系统代理的 7890 端口，包括包下载、版本查询、GitHub/API/HTTP 请求和官方文档抓取。执行前确认当前系统代理的协议与地址；工具不继承代理时，为当前 shell 或单次命令显式配置。代理不可用必须停止，不得静默退回直连，不永久修改用户级 npm/git 或全局网络配置。localhost / 127.0.0.1 开发服务器和本地 IPC 不经过公网代理。
- `../TurnBasedGameData/` 只读。禁止修改、格式化、清理、复制大型数据、建立 submodule 或重命名。
- Core 不以数值相等、字段名、启发式或 AI 推断关系。真实关系来自显式确定性 Dataset Contract 或等价来源。
- 保留原始类型、数值词法、字段、值、源文件与记录地址；数值未经安全性证明不得进入 JS number。物理记录地址不等于契约逻辑身份。
- 渲染进程只收有界结果、单记录或片段，不载入巨大文件到 UI 状态/编辑器。主进程不承担重型数据工作。
- 成熟依赖优先，不自研解析器、虚拟列表、图引擎、编辑器或通用 diff。
- 阶段推进必须来自用户明确授权，并以 `docs/STATUS.md` 为当前阶段真相；调查、清理或收尾本身不自动授权进入下一阶段。本文件不维护临时进度。
- 新文档和人类可读说明采用中文，必要标识符保留原文。

`tools/investigation/` 独立依赖、明确非生产；不得将实验表、采样规则或合成边作为生产真相。禁止提交依赖、数据库、数据副本及大型产物。未经请求不提交、不建分支、不推进实现阶段。

## Formatter Policy

- 生产源码、测试、scripts 和受管配置使用仓库定义的 formatter；不手工维持与其冲突的样式。修改后执行 `format:check`。
- 格式化范围必须限于本仓库受管文件，不触及外部只读数据，不批量重排历史调查、证据、实验工具或 generated artifacts。
- formatter 版本与配置由 repository tooling 管理；具体命令见 README 和 DEVELOPMENT-PROCESS。

## Test Policy

- 测试规模由风险、可观察行为、边界和回归价值决定，不按 LOC、函数数量、test count 或 coverage percentage 分配；不追求数量，不设置指标驱动的 coverage quota。
- 优先验证对外行为、架构边界、数据不变量、安全约束和实际 bug regression；不机械测试 trivial wrapper、getter/setter、第三方能力、私有步骤或调用次数。合理的 bug 修复增加可复现回归，文案/typo 无需机械加测试。
- 同类边界输入优先参数化。普通测试应快速、确定、尽可能离线；unit 验证纯逻辑、validation 和状态机，真实进程、IPC、SQLite/native、构建与打包边界使用 integration/smoke，不以大量 mocks 冒充集成证据。
- 普通行为不使用源码字符串匹配。重要安全、bundler、packaging invariant 无合理行为验证时可保留小范围 guard，但优先结构化配置或 runtime assertion。

## Expensive Command Policy

- 下载、build、package、Electron integration、E2E、smoke 等明显耗时命令，先执行能验证当前假设的最小检查；日常按变更选择验证层级，完整流水线用于需要的验收。
- 同一失败在没有代码、环境、参数或假设变化时不得机械重跑。同类昂贵命令连续失败两次后停止重试、调查根因，只有新证据或实际修改后才重新执行。
- 超时先调查死锁、进程泄漏、网络、权限、native 阻塞和执行路径；仅有合法耗时证据时调整 timeout，不靠持续延长等待掩盖问题。
- scripts 不增加无限或不透明重试；必要 retry 必须次数有限、条件明确、输出序号，且始终遵守代理 fail-closed。详细 cadence 和命令见 DEVELOPMENT-PROCESS。
