import type { Options, Parser, Printer, SupportLanguage } from 'prettier'
import type { MustacheRegion } from './interpolation'
import type { WxmlInterpolation, WxmlRootAst } from './types'
import { collectMustacheRegions } from './collect-mustache-regions'
import { formatInterpolationInner } from './format-expression'

const AST_FORMAT = 'wxml-ast'

const WXML_REPORT_LEVEL = {
  SILENT: 'silent',
  WARN: 'warn',
} as const

type WxmlReportLevel = (typeof WXML_REPORT_LEVEL)[keyof typeof WXML_REPORT_LEVEL]

interface WxmlPluginOptions extends Options {
  wxmlThrowOnError?: boolean
  wxmlReportLevel?: WxmlReportLevel
}

function getThrowOnError(options: WxmlPluginOptions): boolean {
  return Boolean(options.wxmlThrowOnError)
}

function getReportLevel(options: WxmlPluginOptions): WxmlReportLevel {
  const level = options.wxmlReportLevel
  return level === WXML_REPORT_LEVEL.WARN ? WXML_REPORT_LEVEL.WARN : WXML_REPORT_LEVEL.SILENT
}

function warnPartial(filepath: string | undefined, count: number): void {
  const fp = filepath ?? '<stdin>'
  console.warn(`[prettier-plugin-wxml] partial ${fp}: expression-format-failed x${count}`)
}

function warnSkipped(filepath: string | undefined, reason: string): void {
  const fp = filepath ?? '<stdin>'
  console.warn(`[prettier-plugin-wxml] skipped ${fp}: wxml-parse-failed: ${reason}`)
}

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
    try {
      formatted = await formatInterpolationInner(inner, options, throwOnError, quotePreference)
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
