# 调查与证据

本目录为历史证据，非规范架构。接受结论进入 [ARCHITECTURE](../ARCHITECTURE.md) 和 [ADR](../decisions/README.md)，不改写旧报告伪造当时结论。

- [Phase 0 可行性](phase-0-feasibility.md)：当时的规模、结构、性能、工具链、发布、风险与候选；收尾后的接受决定见 [ADR](../decisions/README.md)，不覆盖历史结论。
- [测量摘要](evidence/phase-0-measurements.json)、[全部三次结果](evidence/phase-0-benchmarks.json)、[来源版本证据](evidence/phase-0-sources.json)：Phase 0 小型历史快照，非生产类型或接口。

注明日期、提交、命令、版本、重复次数、口径和局限。大型数据库/日志不放这里，只保留紧凑汇总；事实、观察、假设、未测分开。

- [Phase 1A 桌面基础交付](phase-1a-foundation.md)：Windows x64 真实开发／构建／ASAR 打包验证、兼容组合和交付时门槛；历史待评审事项的接受见 ADR-0006。
- [Phase 1A 测量](evidence/phase-1a-measurements.json)、[Phase 1A 官方来源与版本](evidence/phase-1a-sources.json)：紧凑证据快照，不是永久接口或预算。
- [Phase 1A 工程规范与工具链清理](phase-1a-development-policy-cleanup.md)：formatter 范围、35 项原始测试审阅、昂贵命令政策及去重验证编排；不改变架构或平台 gate。
- [Phase 1A macOS arm64 验证](phase-1a-macos-arm64-validation.md)：正式平台范围收敛、Apple Silicon 原生 gate、打包运行时证据与当时的工具链评审边界。
- [Phase 1A 正式收尾](phase-1a-closeout.md)：两个正式平台 gate 已通过、ADR-0006 工具链路线已接受、Phase 1A 已关闭；后续阶段未启动。
