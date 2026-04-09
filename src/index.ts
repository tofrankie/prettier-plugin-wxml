export { formatWxml, type FormatWxmlOptions } from './format'

export {
  defaultExport as default,
  defaultExport,
  languages,
  options,
  parsers,
  printers,
} from './plugin'

export type { WxmlPluginOptions } from './plugin-options'

export { resolveSelfCloseExcludeSet, selfCloseTags } from './self-close-tags'
export type { WxmlSelfCloseExclude } from './self-close-tags'

export type { WxmlRootAst } from './types'
