import type { Options } from 'prettier'
import { runFormatWxmlPass } from './format-wxml-pass'
import { runMustachePass } from './mustache-pass'
import { runSelfClosePass } from './self-close-pass'
import { extractInlineWxsForPipeline, mergeFormattedWxsInlineBlocks } from './wxs-inline-pass'

/**
 * WXML 格式化流水线（单向、纯字符串）：
 * 0. 内联 wxs 正文抽取为占位符 → 1. 可选 selfClose → 2. 可选 formatWxml（基于 vue parser）
 * → 3. 必选 mustache（区间仅在末段收集）→ 4. 内联 wxs babel 格式化并合并
 * → 5.（可选，`formatWxsEnabled`）内联 wxs babel 合并与块布局（起止标签独占一行，类 `<script>`）。
 * 各阶段禁止复用上游 offset；某阶段失败且为 warn 时回退该阶段输入串。
 */

export const WXML_FORMAT_ON_ERROR = {
  WARN: 'warn',
  THROW: 'throw',
} as const

export type WxmlFormatOnError = (typeof WXML_FORMAT_ON_ERROR)[keyof typeof WXML_FORMAT_ON_ERROR]

export interface RunWxmlPipelineOptions {
  source: string
  prettierOptions: Options
  selfCloseEnabled: boolean
  selfCloseExclude?: string[]
  formatEnabled: boolean
  formatWxsEnabled: boolean
  formatOnError: WxmlFormatOnError
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
    formatOnError,
    throwOnError,
    prettierOptions,
    onWarn,
  } = options

  const { source: afterWxsExtract, blocks: wxsInlineBlocks } = extractInlineWxsForPipeline(source, {
    formatWxsEnabled,
  })

  let current = afterWxsExtract

  if (selfCloseEnabled) {
    current = runSelfClosePass(current, selfCloseExclude, onWarn)
  }

  if (formatEnabled) {
    current = await runFormatWxmlPass({
      source: current,
      prettierOptions,
      formatOnError,
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
  })
}
