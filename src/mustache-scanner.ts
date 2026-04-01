export interface MustacheRegion {
  /** mustache 起始下标（含），指向 `{{` 的第一个 `{`。 */
  start: number
  /** mustache 结束下标（不含），指向 `}}` 之后的位置（可直接用于 `slice(start, end)`）。 */
  end: number
  /** 是否来自属性值（`true` 表示来自 `attr="{{ ... }}"`，否则来自文本节点）。 */
  fromAttribute?: boolean
  /** 仅属性值 mustache 会携带：外层属性若用双引号，内层倾向单引号；反之亦然。 */
  preferredInnerSingleQuote?: boolean
}

type ScanState = 'scan' | 'singleQuote' | 'doubleQuote'

/**
 * 在一段节点内容内提取 `{{`...`}}` 区间（相对 content 的偏移）。
 * 使用状态机，避免字符串字面量内的 `}}` 被误当作闭合。
 * @param content 节点文本或属性值文本（局部字符串）
 */
export function extractMustacheRegions(content: string): MustacheRegion[] {
  const regions: MustacheRegion[] = []
  let i = 0
  while (i < content.length - 1) {
    if (content[i] === '{' && content[i + 1] === '{') {
      const end = findMustacheEnd(content, i)
      if (end === null) {
        i += 1
        continue
      }
      regions.push({ start: i, end })
      i = end
    } else {
      i += 1
    }
  }
  return regions
}

/**
 * 从 `openIdx` 处的 `{{` 起，找配对的 `}}` 结束下标（未找到则返回 null）。
 * @param content 节点内整段文本
 * @param openIdx 指向 `{{` 的第一个 `{`
 */
function findMustacheEnd(content: string, openIdx: number): number | null {
  if (content[openIdx] !== '{' || content[openIdx + 1] !== '{') return null

  let pos = openIdx + 2
  let state: ScanState = 'scan'

  while (pos < content.length) {
    const c = content[pos]

    if (state === 'scan') {
      if (c === "'") {
        state = 'singleQuote'
        pos += 1
        continue
      }
      if (c === '"') {
        state = 'doubleQuote'
        pos += 1
        continue
      }
      if (c === '}' && content[pos + 1] === '}') {
        return pos + 2
      }
      pos += 1
      continue
    }

    if (state === 'singleQuote') {
      if (c === '\\') {
        pos += 2
        continue
      }
      if (c === "'") {
        state = 'scan'
        pos += 1
        continue
      }
      pos += 1
      continue
    }

    if (state === 'doubleQuote') {
      if (c === '\\') {
        pos += 2
        continue
      }
      if (c === '"') {
        state = 'scan'
        pos += 1
        continue
      }
      pos += 1
      continue
    }
  }

  return null
}
