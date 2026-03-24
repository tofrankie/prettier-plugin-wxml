/** 单个 `{{ ... }}` 插值在源码中的区间与内容（若曾用于 AST 元数据）。 */
export interface WxmlMustache {
  /** `{{` 的起始下标（含）。 */
  start: number
  /** `}}` 的结束下标（不含，与 `String#slice` 一致）。 */
  end: number
  /** 区间内的原始文本（通常含 `{{`、`}}` 或仅内部片段，视调用方约定）。 */
  raw: string
  /** 格式化后的内层表达式；无法格式化时为 `null`。 */
  formatted: string | null
}

/** Prettier `parser: 'wxml'` 返回的根节点：保存原串与流水线输出，printer 只回写 `formattedSource`。 */
export interface WxmlRootAst {
  /** 与 `astFormat: 'wxml-ast'` 对应的根节点判别字段，固定为字面量。 */
  type: 'wxml-root'
  /** 本次格式化的输入全文（未改）。 */
  source: string
  /** `runWxmlPipeline` 得到的最终字符串（含 selfClose / formatWxml / mustache）。 */
  formattedSource: string
}
