import type { Options, Parser, Printer, SupportLanguage } from 'prettier'
import type { WxmlPluginOptions } from './plugin-options'
import type { WxmlRootAst } from './types'
import { options as organizeAttributesOptions } from 'prettier-plugin-organize-attributes'
import { formatWxml } from './format'

const AST_FORMAT = 'wxml-ast'
const LOG_PREFIX = '[@tofrankie/prettier-plugin-wxml]'

const wxmlParser: Parser<WxmlRootAst> = {
  astFormat: AST_FORMAT,
  parse: (text, options) => buildAst(text, options),
  locStart: () => 0,
  locEnd: node => (node as WxmlRootAst).source.length,
}

const wxmlPrinter: Printer<WxmlRootAst> = {
  print(path, _options) {
    const node = path.getValue()
    if (node.type !== 'wxml-root') return ''
    return node.formattedSource
  },
}

export const languages: SupportLanguage[] = [
  {
    name: 'WXML',
    parsers: ['wxml'],
    extensions: ['.wxml'],
    vscodeLanguageIds: ['wxml'],
  },
]

export const options = {
  ...organizeAttributesOptions,
  wxmlOrganizeAttributes: {
    type: 'boolean' as const,
    default: false,
    category: 'WXML',
    description:
      'When true and wxmlFormat is enabled, load prettier-plugin-organize-attributes in the inner Vue template format pass. Uses attributeGroups, attributeSort, attributeIgnoreCase when set.',
  },
  wxmlStrict: {
    type: 'boolean' as const,
    default: true,
    category: 'WXML',
    description:
      'When true (default), throw on HTML parse failure (any pipeline stage using angular-html-parser), Vue format failure, mustache collect/format failure, wxs merge/format failure, or collapse-multiline-attributes parse failure; file content is not partially written by the plugin. Set false for graceful fallback.',
  },
  wxmlFallbackLog: {
    type: 'boolean' as const,
    default: true,
    category: 'WXML',
    description:
      'When wxmlStrict is false: emit console warnings on fallback paths. Set false to silence. Ignored when wxmlStrict is true.',
  },
  wxmlFormat: {
    type: 'boolean' as const,
    default: true,
    category: 'WXML',
    description:
      'When true (default), run Vue template formatting and babel-format inline <wxs> bodies. When false, still extracts wxs to placeholders and merges them back as raw text (no babel); skips Vue pass and related layout.',
  },
  wxmlSelfClose: {
    type: 'boolean' as const,
    default: false,
    category: 'WXML',
    description:
      'When true, self-close eligible empty tags (for example, <view></view> -> <view />). Only applies when wxmlFormat is enabled. Use wxmlSelfCloseExclude to opt out specific tag names.',
  },
  wxmlSelfCloseExclude: {
    type: 'string' as const,
    array: true as const,
    category: 'WXML',
    default: [{ value: [] }],
    description:
      'Tag names that must not be self-closed (empty array = self-close all eligible tags). Only applies when wxmlFormat and wxmlSelfClose are enabled. Config files use string[].',
  },
  wxmlCollapseAttrs: {
    type: 'boolean' as const,
    default: true,
    category: 'WXML',
    description:
      'When true (default) and wxmlFormat is enabled: after formatting {{ }}, collapse multi-line attribute values to a single line (newlines become spaces; trim inside quotes). Ignored when wxmlFormat is false.',
  },
}

export const parsers = { wxml: wxmlParser }

export const printers = { [AST_FORMAT]: wxmlPrinter }

export const defaultExport = {
  name: '@tofrankie/prettier-plugin-wxml',
  languages,
  parsers,
  printers,
  options,
}

export type { WxmlRootAst }

/**
 * 构建插件根 AST：执行完整流水线并把结果保存到 AST，print 阶段仅回传字符串。
 * @param text 完整源文本
 * @param options 当前文件格式化选项
 */
async function buildAst(text: string, options: Options): Promise<WxmlRootAst> {
  const pluginOptions = options as WxmlPluginOptions
  const strict = pluginOptions.wxmlStrict !== false
  const fallbackLog = strict ? false : pluginOptions.wxmlFallbackLog !== false
  const filepath = pluginOptions.filepath

  const formattedSource = await formatWxml({
    source: text,
    prettierOptions: options,
    selfCloseEnabled: pluginOptions.wxmlFormat !== false && pluginOptions.wxmlSelfClose === true,
    selfCloseExclude: pluginOptions.wxmlSelfCloseExclude,
    formatEnabled: pluginOptions.wxmlFormat !== false,
    formatWxsEnabled: pluginOptions.wxmlFormat !== false,
    collapseAttrsEnabled: pluginOptions.wxmlCollapseAttrs !== false,
    organizeAttributesEnabled:
      pluginOptions.wxmlOrganizeAttributes === true && pluginOptions.wxmlFormat !== false,
    throwOnError: strict,
    onWarn(message) {
      if (!fallbackLog) return
      console.warn(`${LOG_PREFIX} ${filepath ?? '<stdin>'}: ${message}`)
    },
  })

  return { type: 'wxml-root', source: text, formattedSource }
}
