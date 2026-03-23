import type { Options, Parser, Printer, SupportLanguage } from 'prettier'
import type { MustacheRegion } from './interpolation'
import type { WxmlInterpolation, WxmlRootAst } from './types'
import { collectMustacheRegions } from './collect-mustache-regions'
import { formatInterpolationInner } from './format-expression'

const AST_FORMAT = 'wxml-ast'
// 属性插值 printWidth（足够大），用于避免类似三元运算因行宽原因导致换行，进而使得小程序无法正常解析 WXML
const ATTRIBUTE_INTERPOLATION_PRINT_WIDTH = 10000
const LOG_PREFIX = '[@tofrankie/prettier-plugin-wxml]'

const WXML_REPORT_LEVEL = {
  SILENT: 'silent',
  WARN: 'warn',
} as const

type WxmlReportLevel = (typeof WXML_REPORT_LEVEL)[keyof typeof WXML_REPORT_LEVEL]

interface WxmlPluginOptions extends Options {
  wxmlThrowOnError?: boolean
  wxmlReportLevel?: WxmlReportLevel
}

const wxmlParser: Parser<WxmlRootAst> = {
  astFormat: AST_FORMAT,
  parse: (text, options) => buildAst(text, options),
  locStart: () => 0,
  locEnd: node => (node as WxmlRootAst).source.length,
}

const wxmlPrinter: Printer<WxmlRootAst> = {
  print(path) {
    const node = path.getValue()
    if (node.type !== 'wxml-root') {
      return ''
    }
    const { source, interpolations } = node
    const sorted = [...interpolations].sort((a, b) => b.start - a.start)
    let out = source
    for (const item of sorted) {
      if (item.formatted === null) continue
      const replacement = `{{ ${item.formatted} }}`
      out = out.slice(0, item.start) + replacement + out.slice(item.end)
    }
    return out
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
  wxmlThrowOnError: {
    type: 'boolean' as const,
    default: false,
    category: 'WXML',
    description:
      'When true, throw on WXML parse failure or when an interpolation cannot be formatted. Default: false (graceful fallback).',
  },
  wxmlReportLevel: {
    type: 'choice' as const,
    category: 'WXML',
    default: WXML_REPORT_LEVEL.SILENT,
    description:
      'When not silent, emit console warnings when the file is skipped or partially formatted.',
    choices: [
      { value: WXML_REPORT_LEVEL.SILENT, description: 'No extra logging.' },
      {
        value: WXML_REPORT_LEVEL.WARN,
        description: 'Log warnings when falling back to raw source.',
      },
    ],
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
 * 构建插件根 AST：提取插值区间、格式化内层表达式，并记录回填所需信息。
 * @param text 完整源文本
 * @param options 当前文件格式化选项
 */
async function buildAst(text: string, options: Options): Promise<WxmlRootAst> {
  const pluginOptions = options as WxmlPluginOptions
  const throwOnError = getThrowOnError(pluginOptions)
  const reportLevel = getReportLevel(pluginOptions)
  const filepath = pluginOptions.filepath

  let mustacheRegions: MustacheRegion[]
  try {
    mustacheRegions = collectMustacheRegions(text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (throwOnError) throw err
    if (reportLevel === WXML_REPORT_LEVEL.WARN) warnSkipped(filepath, msg)
    return { type: 'wxml-root', source: text, interpolations: [] }
  }

  mustacheRegions.sort((a, b) => a.start - b.start)

  const interpolations: WxmlInterpolation[] = []
  let formatFailCount = 0

  for (const { start, end, preferredInnerSingleQuote, fromAttribute } of mustacheRegions) {
    const raw = text.slice(start, end)
    const inner = text.slice(start + 2, end - 2)
    let formatted: string | null

    const quotePreference = fromAttribute
      ? (preferredInnerSingleQuote ?? inferInnerSingleQuoteByNeighbors(text, start, end))
      : undefined

    const formatOverrideOptions: Partial<Options> = {
      // 为避免格式化后，属性插值内外层引号不一致，导致小程序无法正常解析 WXML，内部会优先根据外层属性引号来决定内层字符串的引号。
      ...(quotePreference !== undefined && { singleQuote: quotePreference }),
      // 属性插值 printWidth（足够大），用于避免类似三元运算因行宽原因导致换行，进而使得小程序无法正常解析 WXML
      ...(fromAttribute && { printWidth: ATTRIBUTE_INTERPOLATION_PRINT_WIDTH }),
    }

    try {
      formatted = await formatInterpolationInner(
        inner,
        options,
        throwOnError,
        formatOverrideOptions
      )
    } catch (err) {
      if (throwOnError) throw err
      formatted = null
    }
    if (formatted === null && inner.trim() !== '') {
      formatFailCount += 1
    }
    interpolations.push({ start, end, raw, formatted })
  }

  if (formatFailCount > 0 && reportLevel === WXML_REPORT_LEVEL.WARN && !throwOnError) {
    warnPartial(filepath, formatFailCount)
  }

  return { type: 'wxml-root', source: text, interpolations }
}

/**
 * 读取插件抛错开关。
 * @param options 当前文件格式化选项
 */
function getThrowOnError(options: WxmlPluginOptions): boolean {
  return Boolean(options.wxmlThrowOnError)
}

/**
 * 读取插件告警级别，兜底为 silent。
 * @param options 当前文件格式化选项
 */
function getReportLevel(options: WxmlPluginOptions): WxmlReportLevel {
  const level = options.wxmlReportLevel
  return level === WXML_REPORT_LEVEL.WARN ? WXML_REPORT_LEVEL.WARN : WXML_REPORT_LEVEL.SILENT
}

/**
 * 输出“部分插值失败”的文件级 warning。
 * @param filepath 当前文件路径
 * @param count 未能格式化的插值数量
 */
function warnPartial(filepath: string | undefined, count: number): void {
  const fp = filepath ?? '<stdin>'
  console.warn(`${LOG_PREFIX} partial ${fp}: expression-format-failed x${count}`)
}

/**
 * 输出“整文件跳过”的文件级 warning。
 * @param filepath 当前文件路径
 * @param reason 跳过原因
 */
function warnSkipped(filepath: string | undefined, reason: string): void {
  const fp = filepath ?? '<stdin>'
  console.warn(`${LOG_PREFIX} skipped ${fp}: wxml-parse-failed: ${reason}`)
}

/**
 * 仅在属性插值场景下，通过 mustache 左右邻接字符推断内层字符串单双引号偏好。
 * @param source 完整源文本
 * @param start mustache 起始偏移（指向 `{{`）
 * @param end mustache 结束偏移（指向 `}}` 之后）
 */
function inferInnerSingleQuoteByNeighbors(
  source: string,
  start: number,
  end: number
): boolean | undefined {
  const left = source[start - 1]
  let i = end
  while (i < source.length && /\s/.test(source[i])) i += 1
  const right = source[i]
  if (left === '"' && right === '"') return true
  if (left === "'" && right === "'") return false
  return undefined
}
