# ADR-0005：macOS 平台支持范围

- 状态：已接受。
- 日期：2026-10-02（UTC+8）。
- 适用阶段：当前 Phase 1A 及后续桌面发布目标。

## 背景

RefAtlas 是处于早期阶段的开发者桌面工具，当前正式开发与验证目标集中在现代 Windows x64 与 Apple Silicon macOS。维护额外的 Intel macOS 目标会增加 native module、打包、CI、发布、故障排查和验收成本；当前项目也没有既有 macOS x64 用户兼容承诺。

## 决定

正式支持的桌面目标为：

- Windows x64
- macOS arm64

macOS x64 不是正式支持目标。因此：

- 不建立 macOS x64 Phase 1A gate；
- 不要求 macOS x64 package smoke；
- 不要求 Intel macOS native CI runner；
- 不要求为 Intel macOS 维护 native module 验证；
- 不将 Rosetta 兼容性作为产品承诺。

如果未来出现明确需求，可通过新的 ADR 重新评审 macOS x64 支持。

## 后果

当前 package、smoke 和 foundation validation 入口只暴露 Windows x64 与 macOS arm64。发布、native module、ASAR 和 SQLite 验收成本集中在两个正式目标；历史 macOS x64 证据继续保留为历史记录，不作为当前支持承诺。

本 ADR 不接受 electron-vite 或 electron-builder 为长期工具链，也不改变签名、公证和发布策略。

## 与 ADR-0003 的关系

ADR-0003 关于 Phase 1 首选 better-sqlite3、Data Service 隔离和实际打包数据库访问的决定仍然有效。其中 Windows x64、macOS x64、macOS arm64 三目标 gate 的范围由本 ADR 部分替代为 Windows x64 与 macOS arm64；ADR-0003 原文保留以记录当时的历史决定。

## 证据

- [Phase 1A macOS arm64 验证报告](../investigations/phase-1a-macos-arm64-validation.md)。
- [Phase 1A 桌面基础交付与验证报告](../investigations/phase-1a-foundation.md)。
