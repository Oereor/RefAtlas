# ADR-0007：Node 地址、结构浏览与来源生命周期

- 状态：已接受。
- 日期：2026-10-03（UTC+8）。
- 适用阶段：Phase 2 原始访问基础及后续客户端；不表示生产实现已启动。

## 背景

Phase 2A 调查以 RecordAddress 表达文件和 JSON Pointer，并观察了数组、scalar dictionary、wrapper 和大型嵌套集合。用户评审明确：底层事实应是原始 JSON Node，Structural Record 只是显式容器中的浏览角色，不能因此获得实体语义或完整物化保证。本 ADR 细化 ADR-0002 的物理地址条款，保留其无损与有界原则。

## 决定

采用以下概念地址；它们是架构语义，不是本轮新增的生产 TypeScript 或最终 IPC schema：

```typescript
type SourceAddress = {
  workspaceId: string
  relativePath: string
}

type NodeAddress = {
  source: SourceAddress
  pointer: string
}
```

SourceAddress + JSON Pointer 是原始 JSON Node 的物理定位真值。根 Pointer 为 `""`；成员名中的 `~` 和 `/` 分别使用 `~0` 和 `~1` 转义。对象键是原始键，不隐式转为数字。workspaceId 是受控来源标识，不将任意绝对路径读取权交给 Renderer。具体路径序列化与权限校验实现留待生产设计。

| 概念 | 含义与边界 |
| --- | --- |
| JSON Node | 原始 JSON 中客观存在的 value；根、`/0`、`/0/AvatarID`、`/0/AvatarName/Hash` 都可定位，没有 HSR 语义 |
| Structural Record | 在显式选中的 collection/container 中，可将其直接 child 列出并浏览；只是该 Node 的浏览角色 |
| Logical Entity | 未来 Phase 3 显式 Dataset Contract / dataset adapter 定义的数据集实体与逻辑身份 |

三者不等同。根和任意选定 Node 可被定位；容器直接 child 的角色覆盖 array、keyed object、scalar dictionary、嵌套和混合结构。Core 不根据 ID 字段、值、metadata、wrapper 或名称猜实体、自动 flatten 或确定逻辑身份。Structural Record designation 不保证 Node 能整体 materialize，也不保证能一次通过 IPC 返回；所有访问继续受资源和响应边界约束。

SourceRange 不属于 NodeAddress，不是 identity；其版本绑定及恢复能力见 [ADR-0008](ADR-0008-parser-capability-contract-and-source-ranges.md)。ordinal、数组位置和对象键用于当前结构定位，不提供跨 revision 的实体恢复。

## 只读来源与 revision

当前产品是 raw source 的只读 viewer / investigation tool。source workspace 保持只读；SQLite、缓存和临时文件可写入 RefAtlas 自己的应用缓存目录。本阶段不提供 raw editing、save、merge、conflict resolution、undo/redo、transactional source writes 或 source-format rewrite。

外部更新采用 `old revision → stale → invalidate → reload/reindex → new revision`：旧 range 与相关文件索引失效，打开视图表达 stale，重新加载或索引后可尝试打开新 revision 中相同 Pointer。相同 Pointer 仍存在不代表同一 logical entity；不存在时表达 location no longer exists。不依据 ID、值或 heuristic 自动迁移位置，不恢复 array reorder 后“原来的记录”。

目标是可靠检测并响应外部 source change，不承诺每次 Node read 的数据库级 strict snapshot isolation，不要求每读一次就 hash 整文件。revision 表示、检测组合及 race 处理留给生产实现验证；不得把已知 stale 元数据继续当作当前真值。未来 tabs/history 保存的是物理定位及相关 revision 上下文，不保存裸 range 作为永久身份。

## 后果、补充与推迟

浏览角色与事实地址分离，Core 可处理异构 JSON，同时避免提前设计实体。客户端必须容许位置失效，不能宣称跨更新维持逻辑身份。RawValue 的具体接口、完整返回预算、Query API、默认 collection、scalar 根列表策略和分页参数未在本 ADR 锁定。

本 ADR 细化 [ADR-0002](ADR-0002-lossless-raw-data-and-bounded-access.md)；其无损类型、数值与有界访问决定继续有效。Phase 3 契约及关系仍未实施；本决定不授权 Phase 2 产品实现。

## 依据

- 用户 Phase 2A Review Closeout 中明确接受的 Node/Structural Record/Logical Entity、只读及 revision 决定，归档于 [评审收尾](../investigations/phase-2a-review-closeout.md)。
- [Phase 2A 历史调查](../investigations/phase-2a-data-access-architecture.md)：真实结构、巨 Node 与来源变化证据，具体 recommendation 不因链接自动接受。
