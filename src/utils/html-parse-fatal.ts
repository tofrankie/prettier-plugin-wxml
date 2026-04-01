import type { parseHtml } from 'angular-html-parser'

// angular-html-parser 使用 level=1 表示 fatal error。
const HTML_FATAL_ERROR_LEVEL = 1

export type ParseHtmlResult = ReturnType<typeof parseHtml>

export function hasFatalHtmlParseErrors(result: ParseHtmlResult): boolean {
  return result.errors.some(e => e.level === HTML_FATAL_ERROR_LEVEL)
}

/**
 * 严格模式下 HTML 解析存在 fatal 错误时抛出，错误前缀 `wxml-html-parse-failed:`。
 * @param result
 * @param enabled
 */
export function throwIfFatalHtmlParse(result: ParseHtmlResult, enabled: boolean): void {
  if (!enabled || !hasFatalHtmlParseErrors(result)) return
  const msgs = result.errors.filter(e => e.level === 1).map(e => e.msg)
  throw new Error(`wxml-html-parse-failed: ${msgs.join('; ')}`)
}
