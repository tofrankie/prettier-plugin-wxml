import type { Options, Parser, Printer, SupportLanguage } from 'prettier'
import type { WxmlFormatOnError } from './pipeline/run-wxml-pipeline'
import type { WxmlPluginOptions, WxmlReportLevel } from './plugin-options'
import type { WxmlRootAst } from './types'
import { runWxmlPipeline, WXML_FORMAT_ON_ERROR } from './pipeline/run-wxml-pipeline'
import { WXML_REPORT_LEVEL } from './plugin-options'

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

/** Prettier 可注册的选项。 */
export const options = {
  wxmlThrowOnError: {
    type: 'boolean' as const,
    default: false,
    category: 'WXML',
    description:
      'When true, throw on WXML parse failure or when a mustache cannot be formatted. Default: false (graceful fallback).',
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
  wxmlFormat: {
    type: 'boolean' as const,
    category: 'WXML',
    default: true,
    description:
      "Run a full-file Vue formatting pass (`parser: 'vue'`) before mustache formatting.",
  },
  wxmlFormatOnError: {
    type: 'choice' as const,
    category: 'WXML',
    default: WXML_FORMAT_ON_ERROR.WARN,
    description:
      'Behavior when full-file format pass fails: warn and fallback to pre-format text, or throw.',
    choices: [
      { value: WXML_FORMAT_ON_ERROR.WARN, description: 'Warn and continue with fallback text.' },
      { value: WXML_FORMAT_ON_ERROR.THROW, description: 'Throw immediately.' },
    ],
  },
  wxmlSelfClose: {
    type: 'boolean' as const,
    category: 'WXML',
    default: true,
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
  const throwOnError = getThrowOnError(pluginOptions)
  const reportLevel = getReportLevel(pluginOptions)
  const formatOnError = getFormatOnError(pluginOptions)
  const filepath = pluginOptions.filepath

  const formattedSource = await runWxmlPipeline({
    source: text,
    prettierOptions: options,
    selfCloseEnabled: pluginOptions.wxmlSelfClose !== false,
    selfCloseExclude: pluginOptions.wxmlSelfCloseExclude,
    formatEnabled: pluginOptions.wxmlFormat !== false,
    formatOnError,
    throwOnError,
    onWarn(message) {
      if (reportLevel !== WXML_REPORT_LEVEL.WARN) return
      warnPipeline(filepath, message)
    },
  })

  return { type: 'wxml-root', source: text, formattedSource }
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
 * formatWxml pass 的异常处理策略，默认 warn（不中断）。
 * @param options 当前文件格式化选项
 */
function getFormatOnError(options: WxmlPluginOptions): WxmlFormatOnError {
  return options.wxmlFormatOnError === WXML_FORMAT_ON_ERROR.THROW
    ? WXML_FORMAT_ON_ERROR.THROW
    : WXML_FORMAT_ON_ERROR.WARN
}

/**
 * 输出流水线 warning。
 * @param filepath 当前文件路径
 * @param message warning 内容
 */
function warnPipeline(filepath: string | undefined, message: string): void {
  const fp = filepath ?? '<stdin>'
  console.warn(`${LOG_PREFIX} ${fp}: ${message}`)
}
