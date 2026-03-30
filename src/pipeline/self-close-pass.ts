import { resolveSelfCloseExcludeSet, selfCloseTags } from '../self-close-tags'

/**
 * 自闭合阶段：仅做标签结构替换，不做换行/缩进。
 * @param source 当前流水线字符串
 * @param selfCloseExclude 不做自闭合的标签名列表（来自 `wxmlSelfCloseExclude`）
 * @param throwOnError 为 `true` 时解析/替换失败则抛错；为 `false` 时 `onWarn` 并返回原文
 * @param onWarn 非严格路径告警（`self-close-failed: ...`）
 */
export function runSelfClosePass(
  source: string,
  selfCloseExclude: string[] | undefined,
  throwOnError: boolean,
  onWarn: (msg: string) => void
): string {
  try {
    return selfCloseTags(source, resolveSelfCloseExcludeSet(selfCloseExclude))
  } catch (err) {
    if (throwOnError) throw err
    const message = err instanceof Error ? err.message : String(err)
    onWarn(`self-close-failed: ${message}`)
    return source
  }
}
