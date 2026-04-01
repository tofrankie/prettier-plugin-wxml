export interface WxmlRootAst {
  /** 根节点判别字段，固定为字面量 */
  type: 'wxml-root'
  /** 输入的源内容 */
  source: string
  /** 格式化处理后的内容 */
  formattedSource: string
}
