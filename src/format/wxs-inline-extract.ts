import type { Ast } from 'angular-html-parser'
import { parseHtml, RecursiveVisitor, visitAll } from 'angular-html-parser'
import { hasFatalHtmlParseErrors, throwIfFatalHtmlParse } from '../utils/html-parse-fatal'

export interface WxsInlineBlock {
  id: number
  placeholder: string
  rawInner: string
}

interface WxsInnerRange {
  id: number
  innerStart: number
  innerEnd: number
}

export interface ExtractInlineWxsOptions {
  /** 为 true 时 HTML fatal 解析错误抛出 `wxml-html-parse-failed:`，不抽取。 */
  throwOnFatalHtmlParse?: boolean
}

/**
 * 将内联 `<wxs>` 正文替换为 HTML 注释占位符，供后续 Vue / mustache 等阶段解析模板（避免 wxs 内 JS 干扰 HTML/Vue 解析）。
 * 含 `src` 的外链 wxs 或正文仅空白时不抽取。
 * @param source
 * @param options
 */
export function extractInlineWxs(
  source: string,
  options?: ExtractInlineWxsOptions
): {
  source: string
  blocks: WxsInlineBlock[]
} {
  const throwOnFatal = options?.throwOnFatalHtmlParse === true
  const result = parseHtml(source, { canSelfClose: true })
  throwIfFatalHtmlParse(result, throwOnFatal)
  if (hasFatalHtmlParseErrors(result)) {
    return { source, blocks: [] }
  }

  const collector = new WxsInlineRangeCollector(source)
  visitAll(collector, result.rootNodes)
  const ranges = collector.ranges
  if (ranges.length === 0) {
    return { source, blocks: [] }
  }

  const placeholderSalt = resolvePlaceholderSalt(source, ranges.length)

  const blocks: WxsInlineBlock[] = ranges.map(r => ({
    id: r.id,
    placeholder: buildWxsPlaceholder(r.id, placeholderSalt),
    rawInner: source.slice(r.innerStart, r.innerEnd),
  }))

  let out = source
  const sorted = [...ranges].sort((a, b) => b.innerStart - a.innerStart)
  for (const r of sorted) {
    out = out.slice(0, r.innerStart) + buildWxsPlaceholder(r.id, placeholderSalt) + out.slice(r.innerEnd)
  }
  return { source: out, blocks }
}

function buildWxsPlaceholder(id: number, salt: number): string {
  return `<!--__WXML_WXS_INLINE_${salt}_${id}__-->`
}

function resolvePlaceholderSalt(source: string, count: number): number {
  let salt = 0
  while (hasPlaceholderCollision(source, salt, count)) {
    salt += 1
  }
  return salt
}

function hasPlaceholderCollision(source: string, salt: number, count: number): boolean {
  for (let id = 0; id < count; id += 1) {
    if (source.includes(buildWxsPlaceholder(id, salt))) {
      return true
    }
  }
  return false
}

class WxsInlineRangeCollector extends RecursiveVisitor {
  ranges: WxsInnerRange[] = []
  private nextId = 0

  constructor(private readonly source: string) {
    super()
  }

  override visitElement(ast: Extract<Ast.Node, { kind: 'element' }>, context: unknown): void {
    if (ast.name.toLowerCase() === 'wxs') {
      if (!this.hasSrcAttribute(ast) && ast.endSourceSpan && !ast.isSelfClosing && !ast.isVoid) {
        const innerStart = ast.startSourceSpan.end.offset
        const innerEnd = ast.endSourceSpan.start.offset
        const raw = this.source.slice(innerStart, innerEnd)
        if (raw.trim() !== '') {
          const id = this.nextId++
          this.ranges.push({ id, innerStart, innerEnd })
        }
      }
    }
    super.visitElement(ast, context)
  }

  private hasSrcAttribute(ast: Extract<Ast.Node, { kind: 'element' }>): boolean {
    return ast.attrs.some(a => a.kind === 'attribute' && a.name.toLowerCase() === 'src')
  }
}
