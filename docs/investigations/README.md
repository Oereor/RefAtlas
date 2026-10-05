# 调查与证据

- [Phase 2 Search 搜索范围架构收尾](phase-2-search-scope-architecture-closeout.md)：2026-10-05 产品决定进入 ADR-0011；Search investigation line completed / closed，证据保留；workspace content search / S1 / content cache / FTS-trigram / dedicated Search Utility 为 DEFER，compact hash 退出当前 V1 candidate set。Source Locator / active-source Find 尚未实现，下一架构焦点为另行授权的 Phase 3A Dataset Contract；FEFF 仍是 OPEN Raw Access correctness defect。

下列 Search 报告正文保持调查时点，不以其旧 OPEN / UNKNOWN / AWAITING REVIEW 启动后续工作。新的当前方向以 [ADR-0011](../decisions/ADR-0011-search-scope-and-reference-first-direction.md) 和 [STATUS](../STATUS.md) 为准；技术未知项未被宣称解决。

- [Search Round 2 Closeout：Electron ACL 与 execution lane](phase-2-search-execution-lane-validation.md)：Windows sandboxed built smoke、三通道探针、Worker/独立 Utility 竞争、取消和故障恢复已验收；保留当时独立 Search Utility recommendation，当前生产 utility 已 defer；未来重启重型 Search 可复用。受限执行身份、历史 native 根因和平台局限保留，FEFF 归类为独立 Raw Access correctness work。
- [Execution lane 紧凑证据](evidence/phase-2-search-execution-lane-measurements.json)：ACL 差异、执行身份、安全断言、192 独立 Browser RPC、终态与清理；非 accepted architecture。
- [Phase 2 Search Round 2 Candidate-Source 调查](phase-2-search-candidate-source-index-investigation.md)：保留 Controlled Retry #2 PASS 及当时的 ACL native stop 历史；完整 S1、独立 membership proof、Exact/Contains、空间、生命周期/spool 证据复用，后续 lane closeout 见上述新报告。
- [Round 2 首次失败证据](evidence/phase-2-search-candidate-source-measurements.json)：原字节保留 Attempt #1。
- [Round 2 Controlled Retry 证据](evidence/phase-2-search-candidate-source-controlled-retry.json)：完整重试验收、冻结查询 identity/timing、空间/生命周期、后续 native stop、来源与清理审计；不是 accepted architecture。

- [Phase 2 Search 全库调查](phase-2-search-architecture-full-dataset-investigation.md)：INVESTIGATION COMPLETED / RETAINED AS HISTORICAL EVIDENCE；137,916 来源全量 occurrence census、三种完整 schema、独立 truth、literal/FTS/fallback、生命周期与 Node/Utility 浏览竞争；15个重复键来源使 workspace coverage partial，生产 FEFF 缺陷需后续修复。候选不作为 accepted architecture。
- [Phase 2 Search 紧凑证据](evidence/phase-2-search-measurements.json)：全量测量与集合差分、来源指纹、失败及未测边界；Windows数字不是macOS SLA。

- [Source Browser Slice E macOS arm64 定向验收](phase-2-source-browser-slice-e-macos-arm64-validation.md)：PASS WITH FIXES（仅 harness）；三态 polling、原生窗口、stale/reload/位置恢复与最终 11 阶段 runner；台前调度关闭为 minimize 通过范围，开启组合保留限制，无本轮 Windows 补验要求。

- [Source Browser Slice E](phase-2-source-browser-slice-e-change-reload-integration.md)：Windows preflight closure、active-source polling/stale/reload、同 Pointer recovery、LOCATION_MISSING/Root、竞态/locale/native visibility；历史实现报告保持原样，当前 Mac gate 见上项。

- [Source Browser A/B/C/D macOS arm64 累计验收](phase-2-source-browser-macos-arm64-validation.md)：PASS WITH FIXES；11 阶段单次 runner、三态、原生 picker、用户触控板/VoiceOver sanity check；当时 shared watcher Windows 补验要求已由 Slice E preflight 关闭，Slice E 新 diff Mac gate 已由独立定向报告完成。

- [Source Browser Slice C](phase-2-source-browser-slice-c-source-explorer.md)：正式 shell、Workspace flow、Zag managed tree、TanStack virtualization、source activation、Windows UI/真实数据/打包验收；历史 Mac deferred 状态由本轮累计报告更新。

- [Source Browser Slice B](phase-2-source-browser-slice-b-localization-foundation.md)：Renderer-only localization、窄 bootstrap、持久化/no-reload、生成/离线与 Windows 三态验收；历史 Mac deferred 状态由本轮累计报告更新。

- [Source Browser Slice A](phase-2-source-browser-slice-a-directory-lifecycle.md)：DirectoryPath、snapshot/分页、metadata 调度、显式 acquire/release、race regression 与 Windows 验收；Mac 新实现 gate 已由本轮累计报告验证。
- [Source Browser preflight](phase-2-source-browser-preflight.md)：已评审的接入调查与 Slice A–E 建议，保持历史证据。

- [Raw Access Foundation macOS arm64 验证](phase-2-raw-access-macos-arm64-validation.md)：Apple M2 原生 filesystem/symlink、watcher/stat 回退、真实数据及 dev/built/ASAR packaged raw 链路验收；两个正式平台已验证，等待评审。
- [Phase 2 Raw Access Foundation](phase-2-raw-access-foundation.md)：生产类型、parser、只读来源、revision、有界 query、真实数据与 Windows 进程/ASAR 验收；首片完成，等待评审。
- [Phase 2A 评审收尾](phase-2a-review-closeout.md)：已确认原则、ADR-0007–0010、接受与候选边界、文档验证；Phase 2A CLOSED / REVIEWED，产品实现 NOT STARTED。
- [Phase 2A 原始数据访问与记录模型](phase-2a-data-access-architecture.md)：21 个真实样本、类型／地址／记录边界、Query API、SQLite、搜索与有界访问历史候选；正文保留调查时点，顶部补记链接评审结果，不是规范架构。
- [Phase 2A 紧凑测量](evidence/phase-2a-measurements.json)：样本指纹、词法／结构分布、搜索完整性、范围与 IPC 实验，非产品 SLA。

本目录为历史证据，非规范架构。接受结论进入 [ARCHITECTURE](../ARCHITECTURE.md) 和 [ADR](../decisions/README.md)，不改写旧报告伪造当时结论。

- [Phase 0 可行性](phase-0-feasibility.md)：当时的规模、结构、性能、工具链、发布、风险与候选；收尾后的接受决定见 [ADR](../decisions/README.md)，不覆盖历史结论。
- [测量摘要](evidence/phase-0-measurements.json)、[全部三次结果](evidence/phase-0-benchmarks.json)、[来源版本证据](evidence/phase-0-sources.json)：Phase 0 小型历史快照，非生产类型或接口。

注明日期、提交、命令、版本、重复次数、口径和局限。大型数据库/日志不放这里，只保留紧凑汇总；事实、观察、假设、未测分开。

- [Phase 1A 桌面基础交付](phase-1a-foundation.md)：Windows x64 真实开发／构建／ASAR 打包验证、兼容组合和交付时门槛；历史待评审事项的接受见 ADR-0006。
- [Phase 1A 测量](evidence/phase-1a-measurements.json)、[Phase 1A 官方来源与版本](evidence/phase-1a-sources.json)：紧凑证据快照，不是永久接口或预算。
- [Phase 1A 工程规范与工具链清理](phase-1a-development-policy-cleanup.md)：formatter 范围、35 项原始测试审阅、昂贵命令政策及去重验证编排；不改变架构或平台 gate。
- [Phase 1A macOS arm64 验证](phase-1a-macos-arm64-validation.md)：正式平台范围收敛、Apple Silicon 原生 gate、打包运行时证据与当时的工具链评审边界。
- [Phase 1A 正式收尾](phase-1a-closeout.md)：两个正式平台 gate 已通过、ADR-0006 工具链路线已接受、Phase 1A 已关闭；后续阶段未启动。
