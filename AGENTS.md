# RefAtlas 开发约束

重大工作前阅读 `../docs/README.md`、`PROJECT.md`、`STATUS.md`、`ARCHITECTURE.md` 与相关 ADR/调查，文档权威模型以 README 为准。工作后更新状态及受影响文档，性能变化更新 PERFORMANCE；调查证据不是已接受决定。

## 不可违背的边界

- `../TurnBasedGameData/` 只读。禁止修改、格式化、清理、复制大型数据、建立 submodule 或重命名。
- Core 不以数值相等、字段名、启发式或 AI 推断关系。真实关系来自显式确定性 Dataset Contract 或等价来源。
- 保留原始字段、值、源文件与记录地址；大整数/哈希不得静默舍入。
- 渲染进程只收有界结果、单记录或片段，不载入巨大文件到 UI 状态/编辑器。主进程不承担重型数据工作。
- 成熟依赖优先，不自研解析器、虚拟列表、图引擎、编辑器或通用 diff。
- 调查不等于生产授权。Phase 0 不创建生产应用、正式 schema、Dataset Contract、AI/MCP 或发布流水线。
- 新文档和人类可读说明采用中文，必要标识符保留原文。

`tools/investigation/` 独立依赖、明确非生产；不得将实验表、采样规则或合成边作为生产真相。禁止提交依赖、数据库、数据副本及大型产物。未经请求不提交、不建分支、不进入 Phase 1。
