export interface MustacheRegion {
  start: number
  end: number
}

const MUSTACHE_SCAN_STATE = {
  SCAN: 'scan',
  SINGLE_QUOTE: 'singleQuote',
  DOUBLE_QUOTE: 'doubleQuote',
} as const

/**
 * 在一段节点内容内提取 `{{`…`}}` 区间（相对 content 的偏移）。
 * 使用状态机，避免字符串字面量内的 `}}` 被误当作闭合。
 * @param content
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
 * 从 `openIdx` 处的 `{{` 起，找配对的 `}}` 结束下标（不含则返回 null）。
 * @param content 节点内整段文本
 * @param openIdx 指向 `{{` 的第一个 `{`
 */
function findMustacheEnd(content: string, openIdx: number): number | null {
  if (content[openIdx] !== '{' || content[openIdx + 1] !== '{') return null

  // 跳过 `{{`，从表达式正文开始扫
  let pos = openIdx + 2
  type ScanState = (typeof MUSTACHE_SCAN_STATE)[keyof typeof MUSTACHE_SCAN_STATE]
  let state: ScanState = MUSTACHE_SCAN_STATE.SCAN
  while (pos < content.length) {
    const c = content[pos]
    // SCAN：在「表达式层」找闭合 `}}`；遇引号则进入字符串，避免串内 `}}` 误匹配
    if (state === MUSTACHE_SCAN_STATE.SCAN) {
      if (c === "'") {
        state = MUSTACHE_SCAN_STATE.SINGLE_QUOTE
        pos += 1
        continue
      }
      if (c === '"') {
        state = MUSTACHE_SCAN_STATE.DOUBLE_QUOTE
        pos += 1
        continue
      }
      // 唯一合法的闭合：连续的 `}}`（返回 end 为 `}}` 之后下标）
      if (c === '}' && content[pos + 1] === '}') {
        return pos + 2
      }
      pos += 1
      continue
    }
    // 单引号串内：`\'` 跳过两字符；`'` 结束字符串
    if (state === MUSTACHE_SCAN_STATE.SINGLE_QUOTE) {
      if (c === '\\') {
        pos += 2
        continue
      }
      if (c === "'") {
        state = MUSTACHE_SCAN_STATE.SCAN
        pos += 1
        continue
      }
      pos += 1
      continue
    }
    // 双引号串内：同上
    if (state === MUSTACHE_SCAN_STATE.DOUBLE_QUOTE) {
      if (c === '\\') {
        pos += 2
        continue
      }
      if (c === '"') {
        state = MUSTACHE_SCAN_STATE.SCAN
        pos += 1
        continue
      }
      pos += 1
      continue
    }
  }
  // 串结束仍未遇到闭合 `}}`（如 `{{ a`）
  return null
}
