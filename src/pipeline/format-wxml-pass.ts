import type { Options } from 'prettier'
import * as prettier from 'prettier'

export function buildWxmlFormatOptions(prettierOptions: Options): Options {
  return {
    ...prettierOptions,
    parser: 'vue',
    plugins: [],
    vueIndentScriptAndStyle: false,
  }
}

/**
 * Vue parser 整文件排版（含 `<template>` 包裹回退路径）。
 * @param args
 * @param args.source 当前流水线字符串（占位符已替换后的 WXML）
 * @param args.prettierOptions 当前 Prettier 选项
 * @param args.throwOnError 为 `true` 时 `prettier.format` 失败则抛错；为 `false` 时 `onWarn`（`wxml-format-failed: ...`）并返回 `source`
 * @param args.onWarn 非严格路径告警回调
 */
export async function runFormatWxmlPass(args: {
  source: string
  prettierOptions: Options
  throwOnError: boolean
  onWarn: (msg: string) => void
}): Promise<string> {
  const { source, prettierOptions, throwOnError, onWarn } = args
  try {
    return await formatByVueParser(source, prettierOptions)
  } catch (err) {
    if (throwOnError) {
      throw err
    }
    const message = err instanceof Error ? err.message : String(err)
    onWarn(`wxml-format-failed: ${message}`)
    return source
  }
}

async function formatByVueParser(source: string, prettierOptions: Options): Promise<string> {
  try {
    return await prettier.format(source, buildWxmlFormatOptions(prettierOptions))
  } catch {
    const wrapped = `<template>\n${source}\n</template>`
    const wrappedFormatted = await prettier.format(wrapped, buildWxmlFormatOptions(prettierOptions))
    return unwrapTemplateContent(wrappedFormatted, prettierOptions)
  }
}

function unwrapTemplateContent(wrappedSource: string, prettierOptions: Options): string {
  const trimmed = wrappedSource.trimEnd()
  const openTagMatch = trimmed.match(/^<template(?:\s[^>]*)?>/)
  const closeTag = '</template>'
  if (!openTagMatch) return wrappedSource
  const openEnd = openTagMatch[0].length
  const closeStart = trimmed.lastIndexOf(closeTag)
  if (closeStart <= openEnd) return wrappedSource

  let inner = trimmed.slice(openEnd, closeStart)
  if (inner.startsWith('\n')) inner = inner.slice(1)
  if (inner.endsWith('\n')) inner = inner.slice(0, -1)
  inner = stripSingleWrapperIndent(inner, prettierOptions)
  return `${inner}\n`
}

function stripSingleWrapperIndent(source: string, prettierOptions: Options): string {
  const unit = prettierOptions.useTabs ? '\t' : ' '.repeat(prettierOptions.tabWidth ?? 2)
  const lines = source.split('\n')
  const firstNonEmpty = lines.find(line => line.trim() !== '')
  if (!firstNonEmpty || !firstNonEmpty.startsWith(unit)) {
    return source
  }
  let inHtmlCommentBlock = false
  return lines
    .map(line => {
      const hasStart = line.includes('<!--')
      const hasEnd = line.includes('-->')
      const shouldSkip = inHtmlCommentBlock

      if (!inHtmlCommentBlock && hasStart && !hasEnd) {
        inHtmlCommentBlock = true
      } else if (inHtmlCommentBlock && hasEnd) {
        inHtmlCommentBlock = false
      }

      if (shouldSkip) return line
      if (line.startsWith(unit)) return line.slice(unit.length)
      return line
    })
    .join('\n')
}
