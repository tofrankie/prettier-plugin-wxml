/** 单个 `{{ ... }}` 插值在源码中的区间与内容 */
export interface WxmlMustache {
  /** `{{` 的起始下标 */
  start: number
  /** `}}` 的结束下标（不含，与 `String#slice` 一致） */
  end: number
  /** 该插值在源码中的完整片段（含 `{{` 与 `}}`） */
  raw: string
  /** 格式化后的内层表达式；无法格式化时为 `null` */
  formatted: string | null
}

/** Prettier `parser: 'wxml'` 返回的根节点类型 */
export interface WxmlRootAst {
  /** 根节点判别字段，固定为字面量 */
  type: 'wxml-root'
  /** 输入的源内容 */
  source: string
  /** 格式化处理后的内容 */
  formattedSource: string
}
