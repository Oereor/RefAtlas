# ADR-0008：Parser 能力契约与来源字节范围

- 状态：已接受。
- 日期：2026-10-03（UTC+8）。
- 适用阶段：Phase 2 parser adapter 与所有 raw 数据操作；具体库尚未接受。

## 背景

真实样本含超安全整数、decimal、负零与 numeric-looking string。偏移实验还暴露 UTF-8 BOM 基准、跨块 scalar 末尾及巨大 scalar 聚合的问题。成熟库需要适配和验证；接受某个实验库不能替代对所有数据路径的无损与资源证明。

## Parser 能力决定

RefAtlas 在成熟库前建立可替换的 parser abstraction / adapter，至少满足：

1. 保留 JSON 六类原始值：null、boolean、number、string、array、object。
2. number 保留原始 numeric lexeme；numeric-looking string 仍为 string。
3. 不安全 number 不得先经过 JS `number`；解析值只能在安全性已证明时辅助使用，不能覆盖词法真值。
4. 大文件支持 bounded / streaming processing，不将整文件物化作为唯一途径。
5. 巨大 scalar 不得无界聚合；需要有界处理或明确资源失败，不能以截断 preview 替代完整 raw truth。
6. 支持产生或恢复来源 byte range，并验证 UTF-8 字节坐标、转义、空白和分块边界。
7. 支持 cancellation。
8. 支持 resource limits，包括处理和响应成本；streaming 本身不是有界证明。
9. indexing、range-read、search 等所有 parser path 产生一致 raw JSON semantics。

不允许不同路径产生不同类型、numeric lexeme 或解码内容，再将其中一种当成原始真值。安全性与资源策略属于 adapter 的统一约束；具体库隐藏于该边界之后。

`@streamparser/json` 与 `stream-json` 是 production prototype candidates，不是长期库承诺。不得使用会先舍入数值的默认组装路径，实验 `numberAsString` 也不直接成为生产表示。具体适配、库选择和所有边界验证留待实现。

## SourceRange 决定

```typescript
type SourceRange = {
  startByte: number
  endByteExclusive: number
}
```

SourceRange 为原始源文件字节坐标上的半开区间，属于 **nullable、version-bound、rebuildable** 的 cache / acceleration metadata。范围关联明确 source revision；没有 range 时仍能从 Pointer 定位，需要时可扫描恢复。范围回读必须遵守同一 raw semantics，不能依赖库的字符偏移假装 UTF-8 字节偏移。

[NodeAddress](ADR-0007-node-addressing-and-source-lifecycle.md) 是物理定位真值；SourceRange 不进入主地址、不作为 identity、不跨 revision 猜测“同一个 Node”。来源变化使旧 range 失效，可重新扫描建立；检测策略遵循 ADR-0007。

## 后果与推迟事项

索引、按需读与搜索可使用不同执行策略或成熟库，但必须共用能力契约与一致性验收。生产验证需覆盖 numeric lexeme/type、UTF-8/BOM/转义、分块、超长 scalar、深层与宽结构、取消、资源失败和源变化；调查通过不等于这些生产能力已经实现。

不锁定 RawValue union、safeInteger 附件 helper、range end 算法、重复键处理、存储编码、parser 库或协议预算。具体生产语义需在统一 adapter 中明确，不能由各路径独立静默决定。本 ADR 补充 [ADR-0002](ADR-0002-lossless-raw-data-and-bounded-access.md)，不替代其类型与有界原则，不新增自研 JSON tokenizer 路线。

## 依据

- 用户已确认的 parser capability contract 与范围边界，见 [评审收尾](../investigations/phase-2a-review-closeout.md)。
- [Phase 2A 历史调查](../investigations/phase-2a-data-access-architecture.md) 与 [测量](../investigations/evidence/phase-2a-measurements.json)：偏移、词法和资源限制证据，非生产实现。
