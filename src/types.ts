export interface WxmlInterpolation {
  start: number
  end: number
  raw: string
  formatted: string | null
}

export interface WxmlRootAst {
  type: 'wxml-root'
  source: string
  interpolations: WxmlInterpolation[]
}
