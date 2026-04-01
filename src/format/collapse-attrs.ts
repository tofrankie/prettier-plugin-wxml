import type { Ast, ParseSourceSpan } from 'angular-html-parser'
import { parseHtml, RecursiveVisitor, visitAll } from 'angular-html-parser'
import { hasFatalHtmlParseErrors, throwIfFatalHtmlParse } from '../utils/html-parse-fatal'

/** 换行及其两侧空白压成单个空格。 */
const NEWLINE_SURROUNDING_WS = /\s*(?:\r\n|\r|\n)\s*/g

/**
 * mustache 完成之后：将跨行属性值折叠为单行（换行及相邻空白 → 单空格，引号内 trim）。
 * 遍历所有带 `valueSpan` 的属性，用起止行号（及兜底换行符）判定跨行。
 * @param source 当前流水线字符串
 * @param throwOnFatalHtmlParse 为 true 时 HTML fatal 解析错误抛出 `wxml-html-parse-failed:`
 */
export function runCollapseAttrs(source: string, throwOnFatalHtmlParse = false): string {
  const result = parseHtml(source, { canSelfClose: true })
  throwIfFatalHtmlParse(result, throwOnFatalHtmlParse)
  if (hasFatalHtmlParseErrors(result)) {
    return source
  }
  const collector = new MultilineAttrSpanCollector(source)
  visitAll(collector, result.rootNodes)
  if (collector.spans.length === 0) {
    return source
  }
  const sorted = [...collector.spans].sort((a, b) => b.start.offset - a.start.offset)
  let out = source
  for (const span of sorted) {
    const s = span.start.offset
    const e = span.end.offset
    const raw = source.slice(s, e)
    const replacement = collapseAttrValue(raw)
    if (replacement === raw) continue
    out = `${out.slice(0, s)}${replacement}${out.slice(e)}`
  }
  return out
}

class MultilineAttrSpanCollector extends RecursiveVisitor {
  spans: ParseSourceSpan[] = []

  constructor(private readonly source: string) {
    super()
  }

  override visitAttribute(ast: Extract<Ast.Node, { kind: 'attribute' }>, context: unknown): void {
    if (ast.valueSpan && isMultilineSpan(this.source, ast.valueSpan)) {
      this.spans.push(ast.valueSpan)
    }
    super.visitAttribute(ast, context)
  }
}

function collapseAttrValue(raw: string): string {
  const first = raw[0]
  const last = raw.at(-1)
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    const inner = raw.slice(1, -1)
    const next = inner.replace(NEWLINE_SURROUNDING_WS, ' ').trim()
    return `${first}${next}${last}`
  }
  return raw.replace(NEWLINE_SURROUNDING_WS, ' ').trim()
}

function isMultilineSpan(source: string, span: ParseSourceSpan): boolean {
  if (span.start.line !== span.end.line) return true
  const s = span.start.offset
  const e = span.end.offset
  return /\r|\n/.test(source.slice(s, e))
}
