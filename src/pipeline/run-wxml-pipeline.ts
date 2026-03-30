import type { Options } from 'prettier'
import { runFormatWxmlPass } from './format-wxml-pass'
import { runMustachePass } from './mustache-pass'
import { runSelfClosePass } from './self-close-pass'
import { extractInlineWxsForPipeline, mergeFormattedWxsInlineBlocks } from './wxs-inline-pass'

/**
 * WXML 格式化流水线（单向、纯字符串）：
 * 0. 内联 wxs 正文抽取为占位符（`formatWxsEnabled` 与插件 `wxmlFormat` 一致）
 * 1. 可选 selfClose
 * 2. 可选 formatWxml（Vue parser）
 * 3. 必选 mustache（插值仅在此时格式化）
 * 4. 将占位符换回 babel 排版后的 wxs 正文，并可选规范化 `<wxs>` 块布局（`wxs-inline-pass.ts`；`formatWxsEnabled === false` 时不 babel、不跑布局）
 *
 * 各阶段禁止复用上游 offset。`throwOnError === false` 时某阶段失败则 `onWarn` 并回退该阶段输入串。
 */

export interface RunWxmlPipelineOptions {
  source: string
  prettierOptions: Options
  selfCloseEnabled: boolean
  selfCloseExclude?: string[]
  formatEnabled: boolean
  formatWxsEnabled: boolean
  throwOnError: boolean
  onWarn: (message: string) => void
}

export async function runWxmlPipeline(options: RunWxmlPipelineOptions): Promise<string> {
  const {
    source,
    selfCloseEnabled,
    selfCloseExclude,
    formatEnabled,
    formatWxsEnabled,
    throwOnError,
    prettierOptions,
    onWarn,
  } = options

  const { source: afterWxsExtract, blocks: wxsInlineBlocks } = extractInlineWxsForPipeline(source, {
    formatWxsEnabled,
  })

  let current = afterWxsExtract

  if (selfCloseEnabled) {
    current = runSelfClosePass(current, selfCloseExclude, throwOnError, onWarn)
  }

  if (formatEnabled) {
    current = await runFormatWxmlPass({
      source: current,
      prettierOptions,
      throwOnError,
      onWarn,
    })
  }

  const out = await runMustachePass({
    source: current,
    prettierOptions,
    throwOnError,
    onWarn,
  })

  return mergeFormattedWxsInlineBlocks({
    source: out,
    blocks: wxsInlineBlocks,
    prettierOptions,
    onWarn,
    formatWxsEnabled,
    throwOnError,
  })
}
