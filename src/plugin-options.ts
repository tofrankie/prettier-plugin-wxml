import type { Options } from 'prettier'
import type { WxmlFormatOnError } from './pipeline/run-wxml-pipeline'

export const WXML_REPORT_LEVEL = {
  SILENT: 'silent',
  WARN: 'warn',
} as const

export type WxmlReportLevel = (typeof WXML_REPORT_LEVEL)[keyof typeof WXML_REPORT_LEVEL]

export interface WxmlPluginOptions extends Options {
  /** 为 true 时：WXML 解析失败或某段 `{{ }}` 无法格式化则抛错；默认 false 则尽量保留原文。 */
  wxmlThrowOnError?: boolean
  /** `warn` 时在回退/跳过时 `console.warn`；`silent` 不额外打日志。 */
  wxmlReportLevel?: WxmlReportLevel
  /** 为 true（默认）时在 mustache 之前对整文件跑一次 `parser: 'vue'` 排版；false 则跳过该阶段。 */
  wxmlFormat?: boolean
  /** 为 true（默认）时抽取内联 `wxs` 正文、纯 WXML 阶段后再用 `babel` 合并并整理块布局；false 则完全不处理内联 wxs 正文（仍参与 selfClose / Vue / mustache）。 */
  wxmlFormatWxs?: boolean
  /** 整文件 format pass 抛错时：`warn` 告警并回退到该阶段输入串；`throw` 直接终止。 */
  wxmlFormatOnError?: WxmlFormatOnError
  /** 为 false 时跳过自闭合阶段；默认 true（与 `wxmlFormat` 一致，关时需显式传 `wxmlSelfClose: false`）。 */
  wxmlSelfClose?: boolean
  /** 不参与 selfClose 的标签名。Prettier 配置仅支持 string[]；动态列表见 `resolveSelfCloseExcludeSet`。 */
  wxmlSelfCloseExclude?: string[]
}
