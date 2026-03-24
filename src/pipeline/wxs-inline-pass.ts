import type { Ast } from 'angular-html-parser'
import type { Options } from 'prettier'
import { parseHtml, RecursiveVisitor, visitAll } from 'angular-html-parser'
import pLimit from 'p-limit'
import * as prettier from 'prettier'
import { hasFatalHtmlParseErrors } from '../collect-mustache-regions'

const WXS_INLINE_FORMAT_CONCURRENCY = 4

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

/**
 * 将内联 wxs 正文替换为 HTML 注释占位符，供后续 Vue / mustache 阶段处理。
 * 含 `src` 的外链 wxs 或正文仅空白时不抽取。
 * @param source 原始 WXML 全文
 * @param opts
 * @param opts.formatWxsEnabled 为 false 时不抽取，直接返回原文与空 blocks
 */
export function extractInlineWxsForPipeline(
  source: string,
  opts?: { formatWxsEnabled?: boolean }
): {
  source: string
  blocks: WxsInlineBlock[]
} {
  if (opts?.formatWxsEnabled === false) {
    return { source, blocks: [] }
  }
  const result = parseHtml(source, { canSelfClose: true })
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
    out =
      out.slice(0, r.innerStart) +
      buildWxsPlaceholder(r.id, placeholderSalt) +
      out.slice(r.innerEnd)
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

/**
 * 将占位符替换为 Prettier babel 格式化后的 wxs 正文（失败则保留原文并告警）。
 * @param args
 * @param args.source 流水线末段字符串（仍含占位符）
 * @param args.blocks 与 {@link extractInlineWxsForPipeline} 返回的块列表一致
 * @param args.prettierOptions 当前 Prettier 选项
 * @param args.onWarn 告警回调
 * @param args.formatWxsEnabled 为 false 时不合并 babel 结果、不执行 {@link normalizeWxsBlocksLayout}
 */
export async function mergeFormattedWxsInlineBlocks(args: {
  source: string
  blocks: WxsInlineBlock[]
  prettierOptions: Options
  onWarn: (message: string) => void
  formatWxsEnabled?: boolean
}): Promise<string> {
  const { source, blocks, prettierOptions, onWarn } = args
  const formatWxs = args.formatWxsEnabled !== false
  if (blocks.length === 0) {
    const result = formatWxs ? normalizeWxsBlocksLayout(source, prettierOptions) : source
    return preserveEofNewline(source, result)
  }

  const limit = pLimit(WXS_INLINE_FORMAT_CONCURRENCY)
  const mergeParts = await Promise.all(
    blocks.map(b =>
      limit(async (): Promise<{ body: string; applyIndent: boolean }> => {
        const formatted = await tryFormatWxsInner(b.rawInner, prettierOptions)
        if (formatted === null) {
          onWarn(`wxs-inline-format-failed: block ${b.id}`)
          return { body: b.rawInner, applyIndent: false }
        }
        return { body: formatted, applyIndent: true }
      })
    )
  )

  let out = source
  let replacedCount = 0
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]
    const part = mergeParts[i] ?? { body: block.rawInner, applyIndent: false }
    const idx = out.indexOf(block.placeholder)
    if (idx < 0) {
      onWarn(`wxs-inline-placeholder-missing: ${block.placeholder}`)
      continue
    }
    const replacement = part.applyIndent ? `\n${part.body}\n` : part.body
    out = out.slice(0, idx) + replacement + out.slice(idx + block.placeholder.length)
    replacedCount += 1
  }
  const result = formatWxs ? normalizeWxsBlocksLayout(out, prettierOptions) : out
  if (formatWxs && replacedCount > 0) return ensureTrailingNewline(result)
  return preserveEofNewline(source, result)
}

async function tryFormatWxsInner(raw: string, options: Options): Promise<string | null> {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return ''
  }
  try {
    const out = await prettier.format(trimmed, {
      ...options,
      parser: 'babel',
      plugins: [],
      semi: false,
    })
    return out.trimEnd()
  } catch {
    return null
  }
}

function getLineLeadingIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  const line = source.slice(lineStart, offset)
  if (/^\s*>$/.test(line)) {
    const prevLineEnd = Math.max(0, lineStart - 1)
    const prevLineStart = source.lastIndexOf('\n', Math.max(0, prevLineEnd - 1)) + 1
    const prevLine = source.slice(prevLineStart, prevLineEnd)
    const prevMatch = prevLine.match(/^\s*/)
    return prevMatch?.[0] ?? ''
  }
  const m = line.match(/^\s*/)
  return m?.[0] ?? ''
}

/**
 * 将内联 wxs 规范为与 Vue 中 `<script>` 类似：起始标签独占一行、正文一层缩进、结束标签独占一行。
 * WXML 中 wxs 内不会出现子元素，仅按标签间正文处理。
 * @param source 流水线输出全文
 * @param options 当前 Prettier 选项（tabWidth / useTabs）
 * @return 规范化后的 WXML 字符串
 */
export function normalizeWxsBlocksLayout(source: string, options: Options): string {
  const result = parseHtml(source, { canSelfClose: true })
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
        const lineIndent = getLineLeadingIndent(source, openStart)
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

function preserveEofNewline(source: string, result: string): string {
  if (source.endsWith('\n') && !result.endsWith('\n')) {
    return `${result}\n`
  }
  if (!source.endsWith('\n') && result.endsWith('\n')) {
    return result.slice(0, -1)
  }
  return result
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`
}
