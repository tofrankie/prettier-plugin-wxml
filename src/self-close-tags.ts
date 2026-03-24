import type { Ast } from 'angular-html-parser'
import { parseHtml, RecursiveVisitor, visitAll } from 'angular-html-parser'

/** 不参与 selfClose 的标签名列表，或返回该列表的函数（用于程序化 API）。 */
export type WxmlSelfCloseExclude = string[] | (() => string[])

interface ReplacePatch {
  start: number
  end: number
  text: string
}

/**
 * 将排除配置解析为标签名集合（小写，便于与解析器标签名比较）。
 * @param exclude
 */
export function resolveSelfCloseExcludeSet(exclude: WxmlSelfCloseExclude | undefined): Set<string> {
  if (exclude === undefined) return new Set()
  const list = typeof exclude === 'function' ? exclude() : exclude
  return new Set(list.map(name => name.toLowerCase()))
}

/**
 * 将无子内容的成对标签改为自闭合（selfClose），如 `<view></view>` -> `<view />`。
 * 默认对符合条件的标签执行 selfClose；`excludeTags` 中的标签名不处理。
 * @param source
 * @param excludeTags
 */
export function selfCloseTags(source: string, excludeTags: Set<string>): string {
  const result = parseHtml(source, { canSelfClose: true })
  if (result.errors.some(e => e.level === 1)) return source

  const patches: ReplacePatch[] = []
  const collector = new SelfCloseTagPatchCollector(patches, excludeTags)
  visitAll(collector, result.rootNodes)
  if (patches.length === 0) return source

  let out = source
  for (const patch of patches.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, patch.start) + patch.text + out.slice(patch.end)
  }
  return out
}

class SelfCloseTagPatchCollector extends RecursiveVisitor {
  constructor(
    private readonly patches: ReplacePatch[],
    private readonly excludeTags: Set<string>
  ) {
    super()
  }

  override visitElement(ast: Extract<Ast.Node, { kind: 'element' }>, context: unknown): void {
    if (shouldSelfCloseElement(ast, this.excludeTags)) {
      const opening = ast.startSourceSpan.toString()
      const selfClosed = formatOpeningTagAsSelfClose(opening)
      if (selfClosed) {
        this.patches.push({
          start: ast.startSourceSpan.start.offset,
          end: ast.endSourceSpan!.end.offset,
          text: selfClosed,
        })
      }
    }
    super.visitElement(ast, context)
  }
}

function shouldSelfCloseElement(
  ast: Extract<Ast.Node, { kind: 'element' }>,
  excludeTags: Set<string>
): boolean {
  if (ast.isSelfClosing || ast.endSourceSpan === null || ast.isVoid) return false
  if (excludeTags.has(ast.name.toLowerCase())) return false

  for (const child of ast.children) {
    if (child.kind === 'text' || child.kind === 'cdata') {
      // 仅允许“纯空字符串”子节点；任意空白字符都视为有内容，不参与 selfClose。
      if (child.value !== '') return false
      continue
    }
    return false
  }
  return true
}

/**
 * 将起始标签改为自闭合：去掉 `>` 前尾随空白，再追加 ` />`。
 * 不负责换行或缩进排版；多行起始标签时 `/>` 紧跟在最后一个属性之后。
 * @param openingTag
 */
function formatOpeningTagAsSelfClose(openingTag: string): string | null {
  if (openingTag.endsWith('/>')) return null
  const idx = openingTag.lastIndexOf('>')
  if (idx < 0) return null
  const head = openingTag.slice(0, idx).replace(/\s+$/, '')
  return `${head} />`
}
