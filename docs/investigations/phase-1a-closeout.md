# Phase 1A：正式收尾

日期：2026-10-02（UTC+8）。本轮应用基线为 main `573b28d Pass macOS gate of Phase 1A`，开始时工作树干净。用户明确接受 electron-vite + electron-builder 长期路线并授权本次文档/ADR 收尾；不授权后续产品实现。

## 1. 收尾结论

**Phase 1A：已完成并关闭（CLOSED）。Phase 2／后续阶段：未启动（NOT STARTED）。**

| 目标／决定 | 当前状态与证据 |
| --- | --- |
| Windows x64 | 正式支持，native/package gate 已通过；[基础交付](phase-1a-foundation.md)、[工程清理与完整验收](phase-1a-development-policy-cleanup.md) |
| macOS arm64 | 正式支持，原生 Apple Silicon、非 Rosetta 的 native/package gate 已通过；[原生报告](phase-1a-macos-arm64-validation.md) |
| macOS x64 | 不支持，依据 [ADR-0005](../decisions/ADR-0005-macos-platform-scope.md)，不构成未完成 gate |
| electron-vite + electron-builder | 当前长期构建与打包路线已接受，依据 [ADR-0006](../decisions/ADR-0006-electron-build-and-packaging-toolchain.md)；不永久冻结版本 |

两个正式平台的 dev/build/package、Utility/MessagePort、sandbox Preload、better-sqlite3 原生加载与真实 SQLite 往返/清理、取消/崩溃/恢复和普通打包诊断保护均有既有证据。平台范围、工具链路线及工程规范齐备，足以关闭本基础阶段；本轮不重复运行平台 gate，不把既有验证冒充本次新测量。

## 2. 正式留下的基础

- Electron、Svelte 5、TypeScript；Renderer → Preload 类型化窄桥 → Main → Utility Process → Data Service。
- 有界 typed IPC、ready handshake、请求匹配、取消、超时、退出与显式重启；SQLite 由 Utility 内 Data Service 拥有，首选 better-sqlite3。
- electron-vite 构建/dev 路线与 electron-builder 打包/ASAR/native unpack 路线；正式目标为 Windows x64、macOS arm64。
- 独立 production package/lockfile、可重复 foundation validation、测试、formatter、风险分层验证与昂贵命令政策。

版本组合继续由 package/lockfile 管理，升级按 ADR-0006 和既有 Validation Cadence 核对兼容性与受影响 gate。签名、公证及正式发布配置不随工具链接受自动决定。

## 3. 明确未完成

Query API、RawRecord/原始记录模型、logical identity schema、Dataset Contract、production index、full-text strategy、source byte ranges、real data workload 和 product UI 尚未实现或验收；现有 SQLite 表与 Probe 只是基础验证，不成为生产 schema 或产品预算。

Windows code signing、macOS Developer ID/notarization、CI/release workflow、安装器/DMG 最终形式、auto-update 和 release cadence 仍属于未来发布工作，不在本次决定或实施范围内。

## 4. 本次实施与验证

本轮经已确认的 `http://127.0.0.1:7890` 代理执行 `git fetch origin`，main 与 origin/main 的差异为 `0/0`，无需 pull。没有 merge/rebase、commit、push、新分支、PR/issue 或 workflow 操作，不永久修改代理/npm/git 配置。

新增 ADR-0006 与本记录；同步 STATUS、ARCHITECTURE、ROADMAP、PROJECT、应用/文档入口、DEVELOPMENT-PROCESS、决策和调查索引。ADR-0001 仅追加带日期的后续链接，三份 Phase 1A 报告仅追加收尾补记；macOS 报告额外把个人产物绝对路径改成仓库相对路径。其他历史过程、ADR-0005 的平台职责和性能数字保持不变。

本轮仅文档变更，按现有 cadence 完成以下检查：

| 命令／检查 | 结果 |
| --- | --- |
| `git fetch origin`（显式 7890 proxy） | 成功，main 与 origin/main 差异 0/0，无需 fast-forward |
| `npm run format:check` | 最终通过；首次 CRLF 行尾问题的来源与处理见下文 |
| `npm run docs:check` | 22 份 Markdown 的本地链接/锚点通过 |
| `git diff --check` | 通过 |
| 当前/历史状态全文搜索、ADR 编号与证据检查 | 当前权威文档一致；历史待评审/未验证正文保留，顶部补记说明其时点 |
| macOS 个人绝对路径检查 | 已移除，使用 `dist/mac-arm64/RefAtlas.app`，环境验证信息不改写 |
| Git 变更范围与只读数据核对 | 仅 README 与 docs 变更；源码、测试、scripts、package/lockfile、配置、ADR-0005、PERFORMANCE 与 evidence 无版本管理 diff；外部 HEAD/干净工作树不变 |

首次 format:check 提示 tests/pipeline.test.js、scripts/package.mjs、scripts/smoke-worker.mjs、package.json 四个文件不符样式。最小只读调查确认：这四个 HEAD 文件均通过 Prettier 检查，索引为 LF、工作副本为 CRLF，当前 Git core.autocrlf=true；不是代码样式或 macOS 实现错误。仅对四个工作副本执行已有 Prettier 恢复 LF，Git 确认源码/配置无 diff，随后 format:check 通过。当前环境的 git status 仍把这四个工作副本列为 M，但 git diff/name-only/quiet 确认无内容变更，未暂存；不把它们误报为实现修改。未改动 formatter/Git 全局配置、未引入行尾策略重构；未来 checkout 仍可能受本机 autocrlf 影响，不属于运行时或阶段 gate 阻碍。

不新增测试，不执行 typecheck/test/build/package/smoke，不重新设计正式发布配置。已有双平台验收报告作为收尾证据，不替换成未经执行的本轮结果。

外部 TurnBasedGameData 起止 HEAD 均为 `724b139d8c9c32d12552eb95745a4fee72bfe48b`，工作树均干净；仅读取 Git 状态，不扫描、格式化、复制或写入数据。应用 HEAD 仍为 `573b28d`，收尾文档保持未提交；未产生源码、依赖或构建产物变更。

## 5. 下一阶段边界

Closeout 不自动授权下一阶段，也不自行重定义 roadmap 或关闭整个 Phase 1。后续数据模型、产品功能和发布领域需用户另行授权；本次完成文档收尾后停止。当前权威状态见 [STATUS](../STATUS.md)，已接受约束见 [ARCHITECTURE](../ARCHITECTURE.md)。
