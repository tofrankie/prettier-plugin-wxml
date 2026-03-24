import type { Options } from 'prettier'
import { parseExpression } from '@babel/parser'
import * as prettier from 'prettier'

const RE_SEMICOLON_END = /;\s*$/

const EXPORT_DEFAULT_PREFIX = 'export default '

/**
 * 将 mustache 内层按 JS 表达式校验并交给 Prettier babel 格式化。
 * 非表达式（语句）或语法错误时返回 null（除非 throwOnError）。
 * @param inner mustache 内层原始字符串（不含 `{{` 与 `}}`）
 * @param options 外层 Prettier 传入的当前文件格式化选项
 * @param throwOnError 是否在失败时抛错（true）或容错返回 null（false）
 * @param overrideOptions 内层表达式格式化覆盖项（在外层 options 基础上覆盖）
 */
export async function formatMustacheInner(
  inner: string,
  options: Options,
  throwOnError: boolean,
  overrideOptions: Partial<Options> = {}
): Promise<string | null> {
  const trimmed = inner.trim()
  if (!trimmed) {
    if (throwOnError) {
      throw new Error('Empty WXML mustache expression')
    }
    return null
  }
  try {
    parseExpression(trimmed, { sourceType: 'module' })
  } catch (err) {
    const fromObj = await tryFormatWrappedObjectLiteral(
      trimmed,
      options,
      throwOnError,
      overrideOptions
    )
    if (fromObj !== null) {
      return fromObj
    }
    if (throwOnError) throw err
    return null
  }
  try {
    // 使用 `export default <expr>;` 再格式化，避免裸表达式被当作「程序」而产生前导分号等问题。
    const wrapped = `${EXPORT_DEFAULT_PREFIX}${trimmed};`
    const out = await prettier.format(wrapped, buildInnerFormatOptions(options, overrideOptions))
    return stripFormattedExportDefaultLine(out)
  } catch (err) {
    // 某些在 Babel AST 层可解析的表达式（如 `foo, bar`）在 `export default <expr>` 包装下并不合法，
    // 此时回退尝试 `{...}` 对象字面量路径，兼容 WXML data 对象简写。
    const fromObj = await tryFormatWrappedObjectLiteral(
      trimmed,
      options,
      throwOnError,
      overrideOptions
    )
    if (fromObj !== null) {
      return fromObj
    }
    if (throwOnError) throw err
    return null
  }
}

/**
 * 鉴于 WXML 对对象的支持情况，https://developers.weixin.qq.com/miniprogram/dev/reference/wxml/data.html#对象
 * 若裸字符串不是合法表达式，则用 `{}` 包一层再试：可解析为对象字面量时，
 * 按对象走 Prettier，再把外层 `{}` 剥掉写回 mustache（WXML 常见 `a:1,b:2` 即如此）。
 * @param trimmed 已去除首尾空白的 mustache 内层表达式
 * @param options 外层 Prettier 传入的当前文件格式化选项
 * @param throwOnError 是否在失败时抛错（true）或容错返回 null（false）
 * @param overrideOptions 内层表达式格式化覆盖项（在外层 options 基础上覆盖）
 */
async function tryFormatWrappedObjectLiteral(
  trimmed: string,
  options: Options,
  throwOnError: boolean,
  overrideOptions: Partial<Options> = {}
): Promise<string | null> {
  const wrapped = `{${trimmed}}`
  try {
    parseExpression(wrapped, { sourceType: 'module' })
  } catch {
    return null
  }
  try {
    const src = `${EXPORT_DEFAULT_PREFIX}${wrapped};`
    const out = await prettier.format(src, buildInnerFormatOptions(options, overrideOptions))
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
 * 构建内层表达式格式化参数：在外层 options 基础上覆盖，并固定 parser / semi / plugins。
 * @param options 外层 Prettier 传入的当前文件格式化选项
 * @param overrideOptions 内层表达式格式化覆盖项
 */
function buildInnerFormatOptions(
  options: Options,
  overrideOptions: Partial<Options> = {}
): Options {
  return {
    ...options,
    ...overrideOptions,
    parser: 'babel',
    semi: false,
    plugins: [],
  }
}

/**
 * 与 {@link tryFormatWrappedObjectLiteral} 中剥除 `export default` 与尾部分号的方式一致。
 * @param output prettier.format 返回的完整字符串结果（含 `export default` 前缀）
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
