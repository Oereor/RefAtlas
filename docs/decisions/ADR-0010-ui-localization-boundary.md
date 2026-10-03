# ADR-0010：UI 本地化与原始数据边界

- 状态：已接受。
- 日期：2026-10-03（UTC+8）。
- 适用阶段：从第一批 Phase 2 production UI 开始；本轮不实现 i18n runtime。

## 背景

RefAtlas 使用 Svelte 5、TypeScript 与 electron-vite。正式 UI 开始时应集中管理用户可见消息，避免业务、协议与原始数据被 APP locale 污染。用户明确接受统一且类型化的 localization layer，而非永久绑定具体库。

## 决定

i18n/l10n 只属于 UI / presentation 层。按钮、菜单、标题、section heading、对话框、tooltip、empty/loading/searching state、用户错误、accessibility label 及其他用户可见 message，经过统一、类型化的 localization message layer。

从首批 Phase 2 production UI 起，不新增散落在 Svelte component、TypeScript business logic、Data Service、IPC、parser 或 SQLite 中的 locale-specific user-facing text。组件通过 message layer 展示，Data Service 和业务协议不承担翻译。

| 内容 | 处理原则 |
| --- | --- |
| APP 自有 message | 集中 message sources，通过类型化 presentation 层生成 |
| 内部 identifier / code | locale-independent；presentation 映射到用户语言消息 |
| APP 自有 date/time/count/byte size/普通 UI number | 共享 formatting layer，使用 `Intl.*` |
| raw field/string/numeric lexeme/path/JSON Pointer/NodeAddress | 保持原始事实，不随 APP locale 翻译或格式改写 |

例如 raw `AvatarID`、`DamageType`、`Ice` 不替换成 UI 翻译；number lexeme `1.00`、`-0`、`1e3` 不经过 locale number formatter。数据集自带的多语言源内容仍按原始值处理，不由此产生 APP 翻译或跨语言映射。

内部使用稳定 code，例如 `SOURCE_CHANGED`、`STALE_CURSOR`、`RESOURCE_LIMIT`、`INVALID_JSON`。Data Service / Query API 不以“源文件发生变化”等翻译消息作为协议真值；Renderer / presentation 按 code 和参数生成消息，locale 无需一路传入 Data Service。这些 code 是说明边界的示例，不是本轮确定完整协议枚举。

## 实现候选与来源

Paraglide JS 可作为类型化 message functions 的实现候选，不是已接受库。message source 集中管理并为权威来源；generated artifact 不手工维护为 source of truth。初始 locale 集合保持最小合理范围，`zh-CN` / `en` 只是示例，不在本次锁定。

本轮不增加 localization dependency、runtime、message catalog、formatter 实现或 language selector，也不要求改写现有 Phase 1A 诊断 UI。后续生产 UI 实现需从开始遵守本边界。

## 测试后果

除非目标是 localization，不以具体翻译文案作为功能行为的核心 assertion。优先 semantic state、machine-readable code、role、stable DOM/data identifier、可观察行为、控件可用性和 request/result state。文案变化不应让大量无关功能测试失败。

专门 localization tests 可验证 message 存在、参数生成、locale switch、fallback 和 formatter behavior；同时验证原始数据未被本地化。继续按风险、行为、边界和回归价值选择测试，不新增 test-count / coverage quota。长期执行政策见 [AGENTS](../../AGENTS.md) 与 [开发流程](../DEVELOPMENT-PROCESS.md)。

## 依据

- 用户确认的 UI-only localization 及 Test Policy，归档于 [评审收尾](../investigations/phase-2a-review-closeout.md)。
- 已接受的 [进程边界](ADR-0001-desktop-stack-and-process-model.md) 和 [原始数据约束](ADR-0002-lossless-raw-data-and-bounded-access.md)。Phase 2A 历史调查没有提供 localization 库或 runtime 验证，本 ADR 不声称已有此类实测。
