import type { Ast, ParseSourceSpan } from 'angular-html-parser'
import type { MustacheRegion } from './interpolation'
import { parseHtml, RecursiveVisitor, visitAll } from 'angular-html-parser'
import { extractMustacheRegions } from './interpolation'

// angular-html-parser 使用 level=1 表示 fatal error。
const HTML_FATAL_ERROR_LEVEL = 1

export function hasFatalHtmlParseErrors(result: ReturnType<typeof parseHtml>): boolean {
  return result.errors.some(e => e.level === HTML_FATAL_ERROR_LEVEL)
}

export function collectMustacheRegions(source: string): MustacheRegion[] {
  const result = parseHtml(source)
  if (hasFatalHtmlParseErrors(result)) {
    throw new Error(result.errors.map(e => e.msg).join('; '))
  }
  const mustacheRegions: MustacheRegion[] = []
  const collector = new MustacheRegionCollector(source, mustacheRegions)
  visitAll(collector, result.rootNodes)
  return mustacheRegions
}

class MustacheRegionCollector extends RecursiveVisitor {
  constructor(
    private readonly source: string,
    private readonly mustacheRegions: MustacheRegion[]
  ) {
    super()
  }

  override visitText(ast: Extract<Ast.Node, { kind: 'text' }>, context: unknown): void {
    this.pushSpan(ast.sourceSpan)
    super.visitText(ast, context)
  }

  override visitCdata(ast: Extract<Ast.Node, { kind: 'cdata' }>, context: unknown): void {
    this.pushSpan(ast.sourceSpan)
    super.visitCdata(ast, context)
  }

  override visitAttribute(ast: Extract<Ast.Node, { kind: 'attribute' }>, context: unknown): void {
    if (ast.valueSpan && ast.value.includes('{{')) {
      const quote = this.detectAttributeQuote(ast.valueSpan)
      // 外层 " -> 内层倾向单引号；外层 ' -> 内层倾向双引号。
      const preferredInnerSingleQuote = quote === '"' ? true : quote === "'" ? false : undefined
      this.pushSpan(ast.valueSpan, preferredInnerSingleQuote, true)
    }
    super.visitAttribute(ast, context)
  }

  private pushSpan(
    span: ParseSourceSpan,
    preferredInnerSingleQuote?: boolean,
    fromAttribute = false
  ): void {
    const start = span.start.offset
    const end = span.end.offset
    const slice = this.source.slice(start, end)
    if (!slice.includes('{{')) return
    for (const r of extractMustacheRegions(slice)) {
      this.mustacheRegions.push({
        start: start + r.start,
        end: start + r.end,
        fromAttribute,
        preferredInnerSingleQuote,
      })
    }
  }

  private detectAttributeQuote(span: ParseSourceSpan): '"' | "'" | null {
    const start = span.start.offset
    const end = span.end.offset
    const first = this.source[start]
    const last = this.source[end - 1]
    if ((first === '"' || first === "'") && first === last) {
      return first
    }
    return null
  }
}
