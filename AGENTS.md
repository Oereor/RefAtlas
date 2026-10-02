# RefAtlas 开发约束

重大工作前阅读 `docs/README.md`、`docs/PROJECT.md`、`docs/STATUS.md`、`docs/ARCHITECTURE.md` 与相关 `docs/decisions/` ADR、`docs/investigations/` 调查。权威文档在本仓库版本管理；调查证据不是当前架构决定。

影响架构、状态、路线图或性能事实的实现与相应权威文档应在同一审查变更中更新；不影响文档事实的琐碎改动无需强制改文档。性能变化更新 `docs/PERFORMANCE.md`。

## 不可违背的边界

- `../TurnBasedGameData/` 只读。禁止修改、格式化、清理、复制大型数据、建立 submodule 或重命名。
- Core 不以数值相等、字段名、启发式或 AI 推断关系。真实关系来自显式确定性 Dataset Contract 或等价来源。
- 保留原始类型、数值词法、字段、值、源文件与记录地址；数值未经安全性证明不得进入 JS number。物理记录地址不等于契约逻辑身份。
- 渲染进程只收有界结果、单记录或片段，不载入巨大文件到 UI 状态/编辑器。主进程不承担重型数据工作。
- 成熟依赖优先，不自研解析器、虚拟列表、图引擎、编辑器或通用 diff。
- 调查或收尾不等于生产实现授权。Phase 0 已关闭，本次收尾不创建应用、正式 schema、Dataset Contract、AI/MCP 或发布流水线；不得自动开始 Phase 1A。
- 新文档和人类可读说明采用中文，必要标识符保留原文。

`tools/investigation/` 独立依赖、明确非生产；不得将实验表、采样规则或合成边作为生产真相。禁止提交依赖、数据库、数据副本及大型产物。未经请求不提交、不建分支、不推进实现阶段。
