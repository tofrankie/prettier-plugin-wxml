import type { Options } from 'prettier'
import { runFormatWxmlPass } from './format-wxml-pass'
import { runMustachePass } from './mustache-pass'
import { runSelfClosePass } from './self-close-pass'

/**
 * WXML 格式化流水线（单向、纯字符串）：
 * 1. 可选 selfClose → 2. 可选 formatWxml（基于 vue parser）→ 3. 必选 mustache（区间仅在末段收集）。
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
    formatOnError,
    throwOnError,
    prettierOptions,
    onWarn,
  } = options

  let current = source
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
  return out
}
