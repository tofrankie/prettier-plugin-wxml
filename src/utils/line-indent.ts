/**
 * 取 `offset` 所在行、从行首到 `offset` 之前的空白缩进（不含 `offset` 处字符）。
 *
 * 处理 Vue/HTML 排版把 `>` 单独换到下一行且下一行以 `{{` 开头的情形：此时改用上一行的缩进，
 * 避免 mustache / wxs 布局多缩进一级。
 * @param source
 * @param offset
 */
export function getLineLeadingIndentAtOffset(source: string, offset: number): string {
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
