import type { Options, Parser, Printer, SupportLanguage } from 'prettier'
import type { WxmlPluginOptions } from './plugin-options'
import type { WxmlRootAst } from './types'
import { options as organizeAttributesOptions } from 'prettier-plugin-organize-attributes'
import { runWxmlPipeline } from './pipeline/run-wxml-pipeline'

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
    if (node.type !== 'wxml-root') {
      return ''
    }
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

/** Prettier 可注册的选项（含 `prettier-plugin-organize-attributes` 的 `attributeGroups` / `attributeSort` / `attributeIgnoreCase`）。 */
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
      'When true (default), throw on WXML parse failure or when a mustache cannot be formatted. Set false for graceful fallback.',
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
      'When true (default), run Vue template formatting and format inline <wxs> bodies (babel). When false, skip both.',
  },
  wxmlSelfClose: {
    type: 'boolean' as const,
    default: true,
    category: 'WXML',
    description:
      'Self-close eligible tags (for example, <view></view> -> <view />). Set false to disable. Use wxmlSelfCloseExclude to opt out specific tag names.',
  },
  wxmlSelfCloseExclude: {
    type: 'string' as const,
    array: true as const,
    category: 'WXML',
    default: [{ value: [] }],
    description:
      'Tag names that must not be self-closed (empty array = self-close all eligible tags). Config files use string[].',
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
  const strict = getStrict(pluginOptions)
  const fallbackLog = getEffectiveFallbackLog(pluginOptions)
  const throwOnError = strict
  const filepath = pluginOptions.filepath

  const formattedSource = await runWxmlPipeline({
    source: text,
    prettierOptions: options,
    selfCloseEnabled: pluginOptions.wxmlSelfClose !== false,
    selfCloseExclude: pluginOptions.wxmlSelfCloseExclude,
    formatEnabled: pluginOptions.wxmlFormat !== false,
    formatWxsEnabled: pluginOptions.wxmlFormat !== false,
    organizeAttributesEnabled:
      pluginOptions.wxmlOrganizeAttributes === true && pluginOptions.wxmlFormat !== false,
    throwOnError,
    onWarn(message) {
      if (strict) return
      if (!fallbackLog) return
      warnPipeline(filepath, message)
    },
  })

  return { type: 'wxml-root', source: text, formattedSource }
}

/**
 * 严格模式：遇错即抛（默认 true）。
 * @param options 插件选项（`wxmlStrict !== false` 为严格）
 */
function getStrict(options: WxmlPluginOptions): boolean {
  return options.wxmlStrict !== false
}

/**
 * 是否在容错回退时输出 `console.warn`（仅当非严格时有效；严格模式下恒为不输出）。
 * @param options 插件选项
 */
function getEffectiveFallbackLog(options: WxmlPluginOptions): boolean {
  const strict = getStrict(options)
  if (strict) return false
  return options.wxmlFallbackLog !== false
}

function warnPipeline(filepath: string | undefined, message: string): void {
  const fp = filepath ?? '<stdin>'
  console.warn(`${LOG_PREFIX} ${fp}: ${message}`)
}
