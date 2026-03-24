import { resolveSelfCloseExcludeSet, selfCloseTags } from '../self-close-tags'

/**
 * 自闭合阶段：仅做标签结构替换，不做换行/缩进。
 * @param source
 * @param selfCloseExclude
 * @param onWarn
 */
export function runSelfClosePass(
  source: string,
  selfCloseExclude: string[] | undefined,
  onWarn: (msg: string) => void
): string {
  try {
    return selfCloseTags(source, resolveSelfCloseExcludeSet(selfCloseExclude))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    onWarn(`self-close-failed: ${message}`)
    return source
  }
}
