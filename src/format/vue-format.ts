import type { Options } from 'prettier'
import * as prettier from 'prettier'
import * as prettierPluginOrganizeAttributes from 'prettier-plugin-organize-attributes'

export function buildVueFormatOptions(prettierOptions: Options, organizeEnabled = false): Options {
  return {
    ...prettierOptions,
    parser: 'vue',
    plugins: organizeEnabled ? [prettierPluginOrganizeAttributes] : [],
    vueIndentScriptAndStyle: false,
  }
}

/**
 * Vue parser 整文件排版
 * 始终用 `<template>` 包裹再 `prettier.format`
 * 裸 WXML 片段若直接 `parser: 'vue'` 会误报嵌套闭合标签，包一层后与真实 `.vue` 模板一致。
 * @param args
 * @param args.source 当前流水线字符串（占位符已替换后的 WXML）
 * @param args.prettierOptions 当前 Prettier 选项
 * @param args.organizeAttributesEnabled
 * @param args.throwOnError 为 `true` 时 `prettier.format` 失败则抛错；为 `false` 时 `onWarn` 并返回 `source`
 * @param args.onWarn 非严格路径告警回调
 */
export async function runVueFormat(args: {
  source: string
  prettierOptions: Options
  organizeAttributesEnabled?: boolean
  throwOnError: boolean
  onWarn: (msg: string) => void
}): Promise<string> {
  const { source, prettierOptions, organizeAttributesEnabled = false, throwOnError, onWarn } = args
  try {
    return await formatWithVueParser(source, prettierOptions, organizeAttributesEnabled)
  } catch (err) {
    if (throwOnError) {
      throw err
    }
    const message = err instanceof Error ? err.message : String(err)
    onWarn(`wxml-format-failed: ${message}`)
    return source
  }
}

async function formatWithVueParser(
  source: string,
  prettierOptions: Options,
  organizeEnabled: boolean
): Promise<string> {
  const formatOpts = buildVueFormatOptions(prettierOptions, organizeEnabled)
  const wrapped = `<template>\n${source}\n</template>`
  const formatted = await prettier.format(wrapped, formatOpts)
  return unwrapTemplateContent(formatted, prettierOptions)
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
