import type { Options } from 'prettier'
import type { MustacheRegion } from '../mustache'
import pLimit from 'p-limit'
import { collectMustacheRegions } from '../collect-mustache-regions'
import { formatMustacheInner } from '../format-expression'

const ATTRIBUTE_MUSTACHE_PRINT_WIDTH = 10000
const MUSTACHE_FORMAT_CONCURRENCY = 4

export async function runMustachePass(args: {
  source: string
  prettierOptions: Options
  throwOnError: boolean
  onWarn: (msg: string) => void
}): Promise<string> {
  const { source, prettierOptions, throwOnError, onWarn } = args
  let regions: MustacheRegion[]

  try {
    regions = collectMustacheRegions(source)
  } catch (err) {
    if (throwOnError) throw err
    const message = err instanceof Error ? err.message : String(err)
    onWarn(`mustache-collect-failed: ${message}`)
    return source
  }

  regions = regions.sort((a, b) => b.start - a.start)

  const limit = pLimit(MUSTACHE_FORMAT_CONCURRENCY)
  let out = source
  let failCount = 0
  const failDetails: string[] = []

  const tasks = regions.map(region =>
    limit(async () => {
      const inner = source.slice(region.start + 2, region.end - 2)
      const quotePreference = region.fromAttribute
        ? (region.preferredInnerSingleQuote ??
          inferInnerSingleQuoteByNeighbors(source, region.start, region.end))
        : undefined

      const overrideOptions: Partial<Options> = {
        // 根据包裹插值的引号类型，决定内层表达式的引号类型，以避免引号嵌套不一致导致小程序解析 WXML 失败。
        ...(quotePreference !== undefined && { singleQuote: quotePreference }),
        // 含插值的长属性值，超过 printWidth 会换行，这样会导致小程序解析 WXML 失败，因此设置一个足够大的 printWidth 防止属性换行。
        ...(region.fromAttribute && { printWidth: ATTRIBUTE_MUSTACHE_PRINT_WIDTH }),
      }

      try {
        const formatted = await formatMustacheInner(
          inner,
          prettierOptions,
          throwOnError,
          overrideOptions
        )
        return { region, inner, formatted, errorDetail: null as string | null }
      } catch (err) {
        const errorDetail = buildMustacheErrorDetail(source, region, inner, err)
        if (throwOnError) {
          throw new Error(errorDetail)
        }
        return { region, inner, formatted: null, errorDetail }
      }
    })
  )

  const results = await Promise.all(tasks)
  for (const { region, inner, formatted, errorDetail } of results) {
    if (formatted === null) {
      if (inner.trim() !== '') {
        failCount += 1
        if (errorDetail) failDetails.push(errorDetail)
      }
      continue
    }
    const replacement = buildMustacheReplacement(source, region, formatted, prettierOptions)
    out = out.slice(0, region.start) + replacement + out.slice(region.end)
  }

  if (failCount > 0) {
    const detail = failDetails.length > 0 ? `; first=${failDetails.slice(0, 2).join(' | ')}` : ''
    onWarn(`expression-format-failed x${failCount}${detail}`)
  }

  return out
}

function buildMustacheReplacement(
  source: string,
  region: MustacheRegion,
  formatted: string,
  options: Options
): string {
  if (!formatted.includes('\n')) {
    return `{{ ${formatted} }}`
  }

  const lineIndent = getLineLeadingIndent(source, region.start)
  const unit = options.useTabs ? '\t' : ' '.repeat(options.tabWidth ?? 2)
  const body = formatted
    .split('\n')
    .map(line => `${lineIndent}${unit}${line}`)
    .join('\n')
  return `{{\n${body}\n${lineIndent}}}`
}

function getLineLeadingIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  const line = source.slice(lineStart, offset)
  // formatWxml pass 可能把 `>` 单独换到上一行属性后的下一行（形如 `\n  >{{`）。
  // 这种场景如果直接取当前行缩进会多一级，导致下一轮格式化继续漂移。
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

function buildMustacheErrorDetail(
  source: string,
  region: MustacheRegion,
  inner: string,
  err: unknown
): string {
  const abs = region.start + 2
  const loc = toLineCol(source, abs)
  const message = err instanceof Error ? err.message : String(err)
  const preview = inner.replace(/\s+/g, ' ').slice(0, 80)
  return `mustache at ${loc.line}:${loc.col} (offset ${abs}) "${preview}": ${message}`
}

function toLineCol(source: string, offset: number): { line: number; col: number } {
  let line = 1
  let col = 1
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === '\n') {
      line += 1
      col = 1
    } else {
      col += 1
    }
  }
  return { line, col }
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
