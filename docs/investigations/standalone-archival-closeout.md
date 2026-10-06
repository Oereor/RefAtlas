# Standalone RefAtlas — Archival Closeout

日期：**2026-10-06（UTC+8）**。状态：**ARCHIVED / DEVELOPMENT DISCONTINUED**。本记录是 documentation archival closeout，不是新的数据调查或生产验收。当前权威状态见 [STATUS](../STATUS.md)。

## 决定、理由与 successor

Standalone RefAtlas 开发已停止，保留为 historical experiment / research archive。研究建立了 TurnBasedGameData 结构、raw-data fidelity、大整数 ID/hash、搜索取舍与引用语义的重要认识，也留下可工作的基础设施。真实需求随后收窄为阅读 raw JSON 时快速理解 Hash 对应的本地化文本；VS Code 已提供文件浏览、查看/编辑、tabs、history、split editor、search、Go to Definition 与 Peek，薄层 deterministic reference navigation 已足以解决主要痛点，完整 standalone workbench 的基础设施成本不再合理。这是主动的产品方向调整，不是技术、架构或性能失败。

实际使用方向已转向独立、轻量的 [RefAtlas-VSCode](https://github.com/Oereor/RefAtlas-VSCode)。本轮只读核对其当前 README：名称精确为 `Hash` 的 numeric JSON property → `TextMap/TextMapCHS.json`，有目标时提供原生 Hover / Definition / Peek。它是更窄的 product reset，不是 Phase 3 的另一种实现，不继承本仓库 specification、架构或 roadmap；本轮不为其增加 roadmap 或修改文件。

## 保留与取消

生产代码、Phase 0、Phase 1/1A、Phase 2A、Raw Access、Source Browser slices、Search、ADR-0011、Phase 3A taxonomy，以及所有已有 investigation reports、evidence、ADR 和调查工具原样保留。归档不追溯否定 standalone 已接受的架构决定，也不将候选研究升级为 accepted schema。

后续工作为 **CANCELLED / NOT PLANNED**：Dataset Contract schema/API/DSL、Reference Resolver、Inspector reference preview、Incoming References、reference navigation、Local Graph；FEFF production fix、Slice F/G macOS validation；Global Content Search、S1、FTS/trigram、persistent search cache / content cache、dedicated Search Utility；Tabs、History、固定/Compare、Diff；Agent integration、正式 desktop release、release workflow、signing/notarization。完整取消口径见 STATUS。

历史 OPEN / UNKNOWN / AWAITING REVIEW / NOT YET RUN / Search DEFERRED 保留当时事实，不构成 active backlog。FEFF 未修复、Mac F/G 未运行以及既有验收限制没有被宣称解决；归档项目不存在下一阶段。

## 变更文件

- 根入口与 guard：[README](../../README.md)、[AGENTS](../../AGENTS.md)。
- 权威文档与流程：[docs/README](../README.md)、[PROJECT](../PROJECT.md)、[ARCHITECTURE](../ARCHITECTURE.md)、[STATUS](../STATUS.md)、[ROADMAP](../ROADMAP.md)、[DEVELOPMENT-PROCESS](../DEVELOPMENT-PROCESS.md)。
- 历史资料入口：[decisions/README](../decisions/README.md)、[investigations/README](README.md)。
- 新增本记录：`docs/investigations/standalone-archival-closeout.md`。

十份现有文档增加归档语境或调整当前状态、冻结路线图；一份短记录新增。保留历史正文与已引用锚点，不批量格式化或改写历史调查，不修改生产 API、types、IPC、依赖或构建配置。

## 验证与 Git 状态

`npm.cmd run docs:check`：**PASS**，检查 47 份 Markdown 及本地链接/锚点。`git diff --check`：**PASS**。额外只读复核：十一文件变更白名单、UTF-8/LF、无尾随空白/有终止换行、入口顶部 archive notice 均 **PASS**；八份仅插入说明的既有文档正文与 HEAD 原文一致，STATUS 历史快照和 ROADMAP 历史正文仅改历史标题，原事实与被引用锚点保留。首次检查即通过，无非文档调整。

Markdown 不在 formatter 范围；未运行 format:check、production tests、build、package、Electron smoke、validate:foundation、real-data/platform gates 或 Search benchmarks。未读取或扫描真实 dataset 内容。

起始三个工作树均 clean，standalone staging index 为空。收尾复核三个仓库 HEAD/branch 未变；两个 sibling 工作树仍 clean，standalone index 仍为空。RefAtlas 仅有十份既有文档修改及本记录一个 untracked 新文件；生产源码、tests、scripts、package/lockfile、构建配置、既有 ADR/调查/evidence/工具没有变更。

| 仓库 | 起始 HEAD | 分支 |
| --- | --- | --- |
| RefAtlas | `8775c897c33722afc1756f06f48f2bc248c7f249` | `main` |
| RefAtlas-VSCode | `f563a0ea8e9f7b26e17b88f9c83d612d0c8a50c6` | `main` |
| TurnBasedGameData | `724b139d8c9c32d12552eb95745a4fee72bfe48b` | `main` |

`git diff --stat`：10 files changed, 99 insertions(+), 11 deletions(-)；untracked 收尾记录不包含在普通 diff stat 内，必须与十份修改文档一并 review。未对 dataset 文件做内容指纹审计；只读 Git 审计证明起止 HEAD/status 一致，本轮命令未写 sibling，不能冒充新的数据保真或平台验收。

本轮离线完成，未 commit、stage、push、创建分支/PR/issue、操作远程状态或修改 repository settings；Git safe.directory 仅为单次只读命令参数，未写全局配置。Successor 和 dataset 严格只读。

## 停止条件

**STOP / WAIT FOR REVIEW。** 文档收尾完成后停止，不清理代码、修 bug、升级依赖、继续 Phase 3、补做历史验收或修改 RefAtlas-VSCode。正式将 GitHub RefAtlas repository 设置为 Archived 由用户 review 后自行决定或另行明确授权。
