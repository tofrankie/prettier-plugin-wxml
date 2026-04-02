import type { Ast, ParseSourceSpan } from 'angular-html-parser'
import type { MustacheRegion } from '../mustache-scanner'
import { parseHtml, RecursiveVisitor, visitAll } from 'angular-html-parser'
import { extractMustacheRegions } from '../mustache-scanner'
import { throwIfFatalHtmlParse } from '../utils/html-parse-fatal'

/**
 * 基于 angular-html-parser 提取整份 `source` 中所有 `{{ }}` 区间（全文绝对下标）。
 * 单次 `parseHtml` 同时收集标准 `prettier-ignore` 注释覆盖区间与 mustache 区间。
 * @param source 完整 WXML 源码
 */
export function collectMustacheRegions(source: string): MustacheRegion[] {
  const result = parseHtml(source, { canSelfClose: true })
  throwIfFatalHtmlParse(result, true)
  const ignoreRanges: Array<{ start: number; end: number }> = []
  collectIgnoreRangesInSiblings(result.rootNodes, ignoreRanges)
  const mustacheRegions: MustacheRegion[] = []
  const collector = new MustacheRegionCollector(source, mustacheRegions, ignoreRanges)
  visitAll(collector, result.rootNodes)
  return mustacheRegions
}

class MustacheRegionCollector extends RecursiveVisitor {
  constructor(
    private readonly source: string,
    private readonly mustacheRegions: MustacheRegion[],
    private readonly ignoreRanges: Array<{ start: number; end: number }>
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

  override visitElement(ast: Extract<Ast.Node, { kind: 'element' }>, context: unknown): void {
    if (ast.name.toLowerCase() === 'wxs') {
      visitAll(this, ast.attrs, context)
      visitAll(this, ast.directives, context)
      return
    }
    super.visitElement(ast, context)
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

  private pushSpan(span: ParseSourceSpan, preferredInnerSingleQuote?: boolean, fromAttribute = false): void {
    const start = span.start.offset
    const end = span.end.offset
    const slice = this.source.slice(start, end)
    if (!slice.includes('{{')) return
    for (const r of extractMustacheRegions(slice)) {
      const absStart = start + r.start
      const absEnd = start + r.end
      if (isInIgnoredRange(absStart, absEnd, this.ignoreRanges)) continue
      this.mustacheRegions.push({
        start: absStart,
        end: absEnd,
        fromAttribute,
        preferredInnerSingleQuote,
      })
    }
  }

  /**
   * 通过属性值源码片段首尾字符判断属性外层引号类型。
   * @param span 属性值在源文本中的区间（通常含引号）
   */
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

function collectIgnoreRangesInSiblings(nodes: Ast.Node[], ranges: Array<{ start: number; end: number }>): void {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    if (isPrettierIgnoreComment(node)) {
      const next = findNextMeaningfulNode(nodes, i + 1)
      if (next) {
        ranges.push({
          start: next.sourceSpan.start.offset,
          end: next.sourceSpan.end.offset,
        })
      }
    }
    if (hasChildren(node)) {
      collectIgnoreRangesInSiblings(node.children, ranges)
    }
  }
}

function isPrettierIgnoreComment(node: Ast.Node): boolean {
  // 仅识别标准 `prettier-ignore` 注释
  // `prettier-ignore-start` / attribute 级忽略等未实现 https://prettier.io/docs/ignore#html
  return node.kind === 'comment' && (node.value ?? '').trim().toLowerCase() === 'prettier-ignore'
}

function findNextMeaningfulNode(nodes: Ast.Node[], startIdx: number): Ast.Node | null {
  for (let i = startIdx; i < nodes.length; i += 1) {
    const n = nodes[i]
    if (n.kind === 'text' || n.kind === 'cdata') {
      if (n.value.trim() === '') continue
      return n
    }
    if (n.kind === 'comment' || n.kind === 'docType') continue
    return n
  }
  return null
}

function hasChildren(node: Ast.Node): node is Ast.Node & { children: Ast.Node[] } {
  return 'children' in node && Array.isArray((node as { children?: unknown }).children)
}

function isInIgnoredRange(start: number, end: number, ignoreRanges: Array<{ start: number; end: number }>): boolean {
  return ignoreRanges.some(r => start >= r.start && end <= r.end)
}
