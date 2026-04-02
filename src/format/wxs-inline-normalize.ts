import type { Ast } from 'angular-html-parser'
import type { Options } from 'prettier'
import { parseHtml } from 'angular-html-parser'
import { hasFatalHtmlParseErrors, throwIfFatalHtmlParse } from '../utils/html-parse-fatal'
import { getLineLeadingIndentAtOffset } from '../utils/line-indent'

/**
 * 将内联 wxs 规范为与 Vue 中 `<script>` 类似：起始标签独占一行、正文一层缩进、结束标签独占一行。
 * @param source
 * @param options
 * @param throwOnFatalHtmlParse
 */
export function normalizeWxsBlocksLayout(source: string, options: Options, throwOnFatalHtmlParse = false): string {
  const result = parseHtml(source, { canSelfClose: true })
  throwIfFatalHtmlParse(result, throwOnFatalHtmlParse)
  if (hasFatalHtmlParseErrors(result)) {
    return source
  }

  const patches: Array<{ start: number; end: number; text: string }> = []

  const visit = (nodes: Ast.Node[]) => {
    for (const node of nodes) {
      if (node.kind === 'element' && node.name.toLowerCase() === 'wxs') {
        const el = node as Extract<Ast.Node, { kind: 'element' }>
        if (!el.endSourceSpan || el.isSelfClosing) {
          continue
        }

        const innerStart = el.startSourceSpan.end.offset
        const innerEnd = el.endSourceSpan.start.offset
        const innerRaw = source.slice(innerStart, innerEnd)
        if (innerRaw.trim() === '') {
          continue
        }

        const openStart = el.startSourceSpan.start.offset
        const openEnd = el.startSourceSpan.end.offset
        const closeStart = el.endSourceSpan.start.offset
        const closeEnd = el.endSourceSpan.end.offset

        const opening = source.slice(openStart, openEnd)
        const closing = source.slice(closeStart, closeEnd)
        const lineIndent = getLineLeadingIndentAtOffset(source, openStart)
        const unit = options.useTabs ? '\t' : ' '.repeat(options.tabWidth ?? 2)

        const dedented = dedentBlock(innerRaw)
        const body = dedented
          .split('\n')
          .map(line => `${lineIndent}${unit}${line}`)
          .join('\n')
        const text = `${opening}\n${body}\n${lineIndent}${closing}`

        patches.push({ start: openStart, end: closeEnd, text })
      } else if ('children' in node && node.children) {
        visit(node.children)
      }
    }
  }
  visit(result.rootNodes)

  patches.sort((a, b) => b.start - a.start)
  let out = source
  for (const p of patches) {
    out = out.slice(0, p.start) + p.text + out.slice(p.end)
  }
  return out
}

function dedentBlock(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (normalized === '') {
    return ''
  }
  const lines = normalized.split('\n')
  const nonEmpty = lines.filter(l => l.trim() !== '')
  if (nonEmpty.length === 0) {
    return normalized
  }
  let min = Infinity
  for (const line of nonEmpty) {
    const m = /^(\s*)/.exec(line)
    const n = m ? m[1].length : 0
    min = Math.min(min, n)
  }
  if (!Number.isFinite(min) || min === Infinity) {
    min = 0
  }
  return lines.map(line => (line.trim() === '' ? line : line.slice(min))).join('\n')
}

export function preserveEofNewline(source: string, result: string): string {
  if (source.endsWith('\n') && !result.endsWith('\n')) {
    return `${result}\n`
  }
  if (!source.endsWith('\n') && result.endsWith('\n')) {
    return result.slice(0, -1)
  }
  return result
}

export function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`
}
