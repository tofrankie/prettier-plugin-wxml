import type { Options } from 'prettier'
import type { WxsInlineBlock } from './wxs-inline-extract'
import pLimit from 'p-limit'
import * as prettier from 'prettier'
import { ensureTrailingNewline, normalizeWxsBlocksLayout, preserveEofNewline } from './wxs-inline-normalize'

const WXS_INLINE_FORMAT_CONCURRENCY = 4

/**
 * 将占位符替换为 Prettier babel 格式化后的 wxs 正文；失败时按 `throwOnError` 抛错或保留原文并告警。
 * @param args
 * @param args.source
 * @param args.blocks
 * @param args.prettierOptions
 * @param args.onWarn
 * @param args.formatWxsEnabled
 * @param args.throwOnError
 */
export async function mergeFormattedWxsInlineBlocks(args: {
  source: string
  blocks: WxsInlineBlock[]
  prettierOptions: Options
  onWarn: (message: string) => void
  formatWxsEnabled?: boolean
  throwOnError?: boolean
}): Promise<string> {
  const { source, blocks, prettierOptions, onWarn } = args
  const throwOnErr = args.throwOnError === true
  const formatWxs = args.formatWxsEnabled !== false

  if (blocks.length === 0) {
    const result = formatWxs ? normalizeWxsBlocksLayout(source, prettierOptions, throwOnErr) : source
    return preserveEofNewline(source, result)
  }

  let mergeParts: Array<{ body: string; applyIndent: boolean }>
  if (!formatWxs) {
    mergeParts = blocks.map(b => ({ body: b.rawInner, applyIndent: false }))
  } else {
    const limit = pLimit(WXS_INLINE_FORMAT_CONCURRENCY)
    mergeParts = await Promise.all(
      blocks.map(b =>
        limit(async (): Promise<{ body: string; applyIndent: boolean }> => {
          const formatted = await formatWxsInner(b.rawInner, prettierOptions)
          if (formatted === null) {
            if (throwOnErr) {
              throw new Error(`wxs-inline-format-failed: block ${b.id}`)
            }
            onWarn(`wxs-inline-format-failed: block ${b.id}`)
            return { body: b.rawInner, applyIndent: false }
          }
          return { body: formatted, applyIndent: true }
        })
      )
    )
  }

  let out = source
  let replacedCount = 0
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]
    const part = mergeParts[i] ?? { body: block.rawInner, applyIndent: false }
    const idx = out.indexOf(block.placeholder)
    if (idx < 0) {
      if (throwOnErr) {
        throw new Error(`wxs-inline-placeholder-missing: ${block.placeholder}`)
      }
      onWarn(`wxs-inline-placeholder-missing: ${block.placeholder}`)
      continue
    }
    const replacement = part.applyIndent ? `\n${part.body}\n` : part.body
    out = out.slice(0, idx) + replacement + out.slice(idx + block.placeholder.length)
    replacedCount += 1
  }

  const result = formatWxs ? normalizeWxsBlocksLayout(out, prettierOptions, throwOnErr) : out
  if (formatWxs && replacedCount > 0) return ensureTrailingNewline(result)
  return preserveEofNewline(source, result)
}

async function formatWxsInner(raw: string, options: Options): Promise<string | null> {
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  try {
    const out = await prettier.format(trimmed, {
      ...options,
      parser: 'babel',
      plugins: [],
    })
    return out.trimEnd()
  } catch {
    return null
  }
}
