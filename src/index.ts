export {
  runWxmlPipeline,
  type RunWxmlPipelineOptions,
  WXML_FORMAT_ON_ERROR,
  type WxmlFormatOnError,
} from './pipeline/run-wxml-pipeline'

export {
  defaultExport as default,
  defaultExport,
  languages,
  options,
  parsers,
  printers,
} from './plugin'

export { WXML_REPORT_LEVEL } from './plugin-options'
export type { WxmlPluginOptions, WxmlReportLevel } from './plugin-options'

export { resolveSelfCloseExcludeSet, selfCloseTags } from './self-close-tags'
export type { WxmlSelfCloseExclude } from './self-close-tags'

export type { WxmlRootAst } from './types'
