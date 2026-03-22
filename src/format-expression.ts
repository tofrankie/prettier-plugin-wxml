import type { Options } from 'prettier'
import { parseExpression } from '@babel/parser'
import * as prettier from 'prettier'

const RE_SEMICOLON_END = /;\s*$/

const EXPORT_DEFAULT_PREFIX = 'export default '

/**
 * 与 {@link tryFormatWrappedObjectLiteral} 中剥除 `export default` 与尾部分号的方式一致。
 * @param output
 */
function stripFormattedExportDefaultLine(output: string): string {
  const trimmedOut = output.trimEnd()
  if (!trimmedOut.startsWith(EXPORT_DEFAULT_PREFIX)) {
    throw new Error('Unexpected Prettier output for expression')
  }
  let body = trimmedOut.slice(EXPORT_DEFAULT_PREFIX.length).trimEnd()
  body = body.replace(RE_SEMICOLON_END, '').trimEnd()
  return body
}

function buildInnerFormatOptions(options: Options): Options {
  return {
    parser: 'babel',
    semi: false,
    singleQuote: options.singleQuote,
    printWidth: options.printWidth,
    tabWidth: options.tabWidth,
    useTabs: options.useTabs,
    bracketSpacing: options.bracketSpacing,
    arrowParens: options.arrowParens,
    endOfLine: options.endOfLine,
    plugins: [],
  }
}

/**
 * 鉴于 WXML 对对象的支持情况，https://developers.weixin.qq.com/miniprogram/dev/reference/wxml/data.html#对象
 * 若裸字符串不是合法表达式，则用 `{}` 包一层再试：可解析为对象字面量时，
 * 按对象走 Prettier，再把外层 `{}` 剥掉写回插值（WXML 常见 `a:1,b:2` 即如此）。
 * @param trimmed
 * @param options
 * @param throwOnError
 */
async function tryFormatWrappedObjectLiteral(
  trimmed: string,
  options: Options,
  throwOnError: boolean
): Promise<string | null> {
  const wrapped = `{${trimmed}}`
  try {
    parseExpression(wrapped, { sourceType: 'module' })
  } catch {
    return null
  }
  try {
    const src = `export default ${wrapped};`
    const out = await prettier.format(src, buildInnerFormatOptions(options))
    const body = stripFormattedExportDefaultLine(out)
    if (!body.startsWith('{') || !body.endsWith('}')) {
      throw new Error('Unexpected Prettier output for object literal')
    }
    return body.slice(1, -1).trim()
  } catch (err) {
    if (throwOnError) throw err
    return null
  }
}

/**
 * 将插值内层按 JS 表达式校验并交给 Prettier babel 格式化。
 * 非表达式（语句）或语法错误时返回 null（除非 throwOnError）。
 * @param inner
 * @param options
 * @param throwOnError
 */
export async function formatInterpolationInner(
  inner: string,
  options: Options,
  throwOnError: boolean
): Promise<string | null> {
  const trimmed = inner.trim()
  if (!trimmed) {
    if (throwOnError) {
      throw new Error('Empty WXML interpolation expression')
    }
    return null
  }
  try {
    parseExpression(trimmed, { sourceType: 'module' })
  } catch (err) {
    const fromObj = await tryFormatWrappedObjectLiteral(trimmed, options, throwOnError)
    if (fromObj !== null) {
      return fromObj
    }
    if (throwOnError) throw err
    return null
  }
  try {
    // 使用 `export default <expr>;` 再格式化，避免裸表达式被当作「程序」而产生前导分号等问题。
    const wrapped = `export default ${trimmed};`
    const out = await prettier.format(wrapped, buildInnerFormatOptions(options))
    return stripFormattedExportDefaultLine(out)
  } catch (err) {
    if (throwOnError) throw err
    return null
  }
}
