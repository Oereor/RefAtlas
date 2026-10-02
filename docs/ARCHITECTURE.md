# 已接受架构与约束

2026-10-02 Phase 0 收尾后，下述方向已接受；Phase 1A 已实现并验证 Windows x64 的最小桌面链路。产品原则见 [PROJECT](PROJECT.md)，决定历史见 [ADR](decisions/README.md)，调查是历史证据而非当前架构规范。

## 1. 桌面栈与进程所有权

采用 Electron、Svelte 5、TypeScript，面向 Windows/macOS，通过 GitHub Releases 分发，无网页部署。具体构建/打包工具及版本未接受。[ADR-0001](decisions/ADR-0001-desktop-stack-and-process-model.md)

初始拓扑：Renderer → Preload 类型化窄桥 → Main → Utility Process → Data Service。

| 边界 | 职责 | 禁止承担 |
| --- | --- | --- |
| Renderer | Svelte 展示、树/表格/标签、有界视图、未来局部图、交互 | 任意工作区文件读取、SQLite、巨大 JSON 解析与整文件状态 |
| Preload | 最小类型化桥 | unrestricted IPC、ipcRenderer 或 Node API 暴露 |
| Main | 生命周期、窗口、对话框、工作区编排、数据进程生命周期 | 重型数据处理引擎 |
| Utility Process / Data Service | 扫描、解析/流式、索引、SQLite、搜索、记录/引用查询 | 启发式或 AI 关系真相 |

初始不引入 Worker Threads；只有测量证明具体需要时再接受。Phase 1A 的该进程链路、最小请求生命周期与显式恢复已在 Windows 验证；不代表表中未来数据功能已实现。

### 已验证的基础链路

- BrowserWindow 启用 context isolation/sandbox，禁用 Node integration；Preload 自包含 CJS 构建并检查运行时隔离状态。桥只提供状态、有限 Probe、取消、SQLite smoke 与受保护的诊断方法。
- Main 校验发送窗口、主 frame、文档 URL、参数数量和输入类型；消息通过 MessagePort 进入 Utility。启动握手、请求/响应校验、超时、窗口销毁和服务退出都会明确结束相关请求。
- 每次发往 Utility 的 wire ID 独立生成；调用方 ID 可用于取消，但迟到响应不能匹配复用 ID 的新请求。新服务使用新 broker/代次，无自动重放或复杂 supervisor。
- 当前基础设施限制：16 KiB 消息、32 个未完成请求（普通任务最多 31，保留取消控制槽）、最多 1,000 步/计划时长 10 秒、启动 10 秒/请求 20 秒超时。这不是未来数据模型或产品性能预算。
- SQLite 只在 Utility 的独立 smoke 模块内操作临时数据库，主进程与 renderer 不拥有数据库。普通打包启动拒绝 crash/restart；开发态或显式诊断/smoke 模式才允许。

## 2. 数据事实、类型与身份

概念层次：UI/客户端 → Query API → 显式 Dataset Contract → 通用数据/索引 → 原始文件。这是职责边界，不是已实现接口或最终进程拓扑。

Core 不推断引用、不硬编码玩家实体。相等数值、相似字段、启发式或 AI 不能生成真实边；引用来自显式确定性 Dataset Contract 或等价来源。

原始 JSON 类型、无损数值词法与出处必须保留，123 与 "123" 可区分。数值未经安全性证明不得经过 JavaScript number；signed INTEGER 不保证承载全部 ID/哈希。

物理地址（文件 + JSON Pointer/等价位置）不同于契约逻辑身份（单字段、复合字段、对象键或显式选择器），不假设一个 ID 等于一条记录。[ADR-0002](decisions/ADR-0002-lossless-raw-data-and-bounded-access.md)

## 3. 有界与混合访问

- 外部数据只读，不修改、不复制到应用仓库。
- 渲染进程只收有界查询、记录或片段，不保存整份巨大 JSON。
- 主进程负责生命周期/编排，不承担重型数据处理。
- 巨大文件是数据源，通过搜索、记录浏览、外部打开使用，不整体加载编辑器。
- 大列表使用成熟虚拟化，不堆海量 DOM；解析、数据库、编辑器、图等优先成熟库。

小且安全文件可有界完整解析；大或精度敏感文件采用流式和/或索引访问。无固定大小阈值，不声称流式普遍更快，巨大嵌套记录仍需细化边界。实验 numberAsString 不构成生产类型。[ADR-0002](decisions/ADR-0002-lossless-raw-data-and-bounded-access.md)

## 4. Phase 1 存储与搜索方向

Phase 1 首选 better-sqlite3，SQLite 属于 Data Service，经窄内部存储边界隔离，不引入 ORM。Windows x64、macOS x64、macOS arm64 打包后的原生加载与数据库访问是必过门槛；存在实质问题可复审驱动而不改高层 Query API 语义。本次不设计存储 API。[ADR-0003](decisions/ADR-0003-phase-1-sqlite-driver.md)

搜索先定义确定性行为：Exact 精确标量/显式 ID，Contains 字面 Unicode 子串，Field 字段名，File 文件/路径，Text 字面本地化文本。名称不固定 UI/API；FTS/tokenizer 只作加速，不能改变语义。最终 FTS、短词与回退策略未定，不引入分词语义、embeddings 或 AI 搜索。[ADR-0004](decisions/ADR-0004-deterministic-search-semantics.md)

## 5. 尚未设计或验证

- 工具链长期 ADR 接受、macOS 两架构运行时与正式发布配置。electron-vite/electron-builder 当前仅作为已验证实现候选，具体版本不是永久架构要求。
- 正式 Query API 与产品级协议／存储接口；已有 foundation IPC 只验证基础设施，不预先定义记录、契约或索引模型。
- 原始记录模型、Dataset Contract schema、索引 schema、源偏移与具体大小阈值。
- 最终 FTS/trigram/确定性回退、1–2 字符查询与索引体积。
- UI 库最终选择、真实数据端到端性能、macOS 两架构打包运行时和签名/公证验证。

实验表、合成边、采样与保护阈值不是生产架构。Phase 0 的具体版本矩阵没有被接受；真实测量见 [PERFORMANCE](PERFORMANCE.md)，阶段范围见 [Phase 1A](ROADMAP.md#下一步phase-1a--桌面基础与架构验证)，当前 gate 以 STATUS 为准。
