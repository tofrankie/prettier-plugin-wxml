import type { Options } from 'prettier'
import type { FormatWxmlOptions } from '../../src/format'
import { formatWxml } from '../../src/format'
import { runCollapseAttrsValue } from '../../src/format/collapse-attrs-value'
import { runMustache } from '../../src/format/mustache'
import { runSelfClose } from '../../src/format/self-close'
import { runVueFormat } from '../../src/format/vue-format'
import { extractInlineWxs, mergeFormattedWxsInlineBlocks } from '../../src/format/wxs-inline'

/**
 * 格式化阶段（顺序固定为 wxs 抽取 → selfClose → vueFormat → mustache → collapseAttrsValue → wxs 合并）。
 * 折叠在 `mustache` 之后执行；**仅当 stages 含 `vueFormat`** 时生效。
 */
export const FORMAT_STAGE_ORDER = ['selfClose', 'vueFormat', 'mustache'] as const
export type FormatStage = (typeof FORMAT_STAGE_ORDER)[number]

export interface RunFormatStagesArgs {
  source: string
  /**
   * 要执行的步骤子集，实际执行顺序恒为 selfClose → vueFormat → mustache。
   * 例：`['mustache']` 仅插值；`['vueFormat','mustache']` 对应「关 selfClose、开 format」的全局配置。
   */
  stages: FormatStage[]
  prettierOptions: Options
  selfCloseExclude?: string[]
  /** 与 `wxmlStrict` 一致：true 时各阶段遇错抛错；false 时容错并可能 `onWarn`。 */
  throwOnError?: boolean
  onWarn?: (msg: string) => void
  /** 与生产流水线中 `wxmlFormat` 一致；默认 true。为 false 时不抽取/合并内联 wxs。 */
  formatWxsEnabled?: boolean
  /** 与 `wxmlCollapseAttrsValue` 一致；默认 true。仅当同时包含 `vueFormat` 与 `mustache` 时在 mustache 之后执行。 */
  collapseAttrsValueEnabled?: boolean
  /** 与 `wxmlOrganizeAttributes` 一致；默认 false。 */
  organizeAttributesEnabled?: boolean
}

function noopWarn() {}

/**
 * 按阶段子集运行格式化流程（与 `formatWxml` 开关语义一致）。
 * @param args
 */
export async function runFormatStages(args: RunFormatStagesArgs): Promise<string> {
  const {
    source,
    stages,
    prettierOptions,
    selfCloseExclude,
    throwOnError = false,
    onWarn = noopWarn,
    formatWxsEnabled = true,
    collapseAttrsValueEnabled = true,
    organizeAttributesEnabled = false,
  } = args

  const want = new Set(stages)
  const { source: afterWxsExtract, blocks: wxsInlineBlocks } = extractInlineWxs(source, {
    throwOnFatalHtmlParse: throwOnError,
  })
  let current = afterWxsExtract

  if (want.has('selfClose')) {
    current = runSelfClose(current, selfCloseExclude, throwOnError, onWarn)
  }
  if (want.has('vueFormat')) {
    current = await runVueFormat({
      source: current,
      prettierOptions,
      organizeAttributesEnabled,
      throwOnError,
      onWarn,
    })
  }
  if (want.has('mustache')) {
    current = await runMustache({
      source: current,
      prettierOptions,
      throwOnError,
      onWarn,
    })
    if (want.has('vueFormat') && collapseAttrsValueEnabled) {
      current = runCollapseAttrsValue(current, throwOnError)
    }
  }

  return mergeFormattedWxsInlineBlocks({
    source: current,
    blocks: wxsInlineBlocks,
    prettierOptions,
    onWarn,
    formatWxsEnabled,
    throwOnError,
  })
}

/**
 * 将 `FormatWxmlOptions` 转为 `runFormatStages` 的 `stages` 与 `formatWxml` 等价。
 * @param options
 * @param options.selfCloseEnabled
 * @param options.formatEnabled
 */
export function formatOptionsToStages(options: {
  selfCloseEnabled: boolean
  formatEnabled: boolean
}): FormatStage[] {
  const stages: FormatStage[] = []
  if (options.selfCloseEnabled) stages.push('selfClose')
  if (options.formatEnabled) stages.push('vueFormat')
  stages.push('mustache')
  return stages
}

export type FullFormatArgs = Omit<FormatWxmlOptions, 'source'> & { source: string }

/**
 * 完整格式化：直接调用生产 `formatWxml`（与 `runFormatStages` 三阶段全开等价）。
 * @param args
 */
export function runFullWxmlFormat(args: FullFormatArgs): Promise<string> {
  return formatWxml(args)
}
