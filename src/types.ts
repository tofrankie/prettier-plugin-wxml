export interface WxmlMustache {
  start: number
  end: number
  raw: string
  formatted: string | null
}

export interface WxmlRootAst {
  type: 'wxml-root'
  source: string
  mustaches: WxmlMustache[]
}
