import type { Options } from 'prettier'
import type { RunWxmlPipelineOptions } from '../../src/pipeline/run-wxml-pipeline'
import { runFormatWxmlPass } from '../../src/pipeline/format-wxml-pass'
import { runMustachePass } from '../../src/pipeline/mustache-pass'
import { runWxmlPipeline } from '../../src/pipeline/run-wxml-pipeline'
import { runSelfClosePass } from '../../src/pipeline/self-close-pass'
import {
  extractInlineWxsForPipeline,
  mergeFormattedWxsInlineBlocks,
} from '../../src/pipeline/wxs-inline-pass'

/** 流水线阶段（顺序固定为 wxs 抽取 → selfClose → formatWxml → mustache → wxs 合并）。 */
export const PIPELINE_STAGE_ORDER = ['selfClose', 'formatWxml', 'mustache'] as const
export type PipelineStage = (typeof PIPELINE_STAGE_ORDER)[number]

export interface RunPipelineStagesArgs {
  source: string
  /**
   * 要执行的步骤子集，实际执行顺序恒为 selfClose → formatWxml → mustache。
   * 例：`['mustache']` 仅插值；`['formatWxml','mustache']` 对应「关 selfClose、开 format」的全局配置。
   */
  stages: PipelineStage[]
  prettierOptions: Options
  selfCloseExclude?: string[]
  /** 与 `wxmlStrict` 一致：true 时各阶段遇错抛错；false 时容错并可能 `onWarn`。 */
  throwOnError?: boolean
  onWarn?: (msg: string) => void
  /** 与生产流水线中 `wxmlFormat` 一致；默认 true。为 false 时不抽取/合并内联 wxs。 */
  formatWxsEnabled?: boolean
  /** 与 `wxmlOrganizeAttributes` 一致；默认 false。 */
  organizeAttributesEnabled?: boolean
}

function noopWarn() {}

/**
 * 按阶段子集运行流水线（与 `runWxmlPipeline` 开关语义一致）。
 * @param args
 */
export async function runPipelineStages(args: RunPipelineStagesArgs): Promise<string> {
  const {
    source,
    stages,
    prettierOptions,
    selfCloseExclude,
    throwOnError = false,
    onWarn = noopWarn,
    formatWxsEnabled = true,
    organizeAttributesEnabled = false,
  } = args

  const want = new Set(stages)
  const { source: afterWxsExtract, blocks: wxsInlineBlocks } = extractInlineWxsForPipeline(source, {
    formatWxsEnabled,
  })
  let current = afterWxsExtract

  if (want.has('selfClose')) {
    current = runSelfClosePass(current, selfCloseExclude, throwOnError, onWarn)
  }
  if (want.has('formatWxml')) {
    current = await runFormatWxmlPass({
      source: current,
      prettierOptions,
      organizeAttributesEnabled,
      throwOnError,
      onWarn,
    })
  }
  if (want.has('mustache')) {
    current = await runMustachePass({
      source: current,
      prettierOptions,
      throwOnError,
      onWarn,
    })
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
 * 将 `RunWxmlPipelineOptions` 转为 `runPipelineStages` 的 `stages` 与 `runWxmlPipeline` 等价。
 * @param options
 * @param options.selfCloseEnabled
 * @param options.formatEnabled
 */
export function pipelineOptionsToStages(options: {
  selfCloseEnabled: boolean
  formatEnabled: boolean
}): PipelineStage[] {
  const stages: PipelineStage[] = []
  if (options.selfCloseEnabled) stages.push('selfClose')
  if (options.formatEnabled) stages.push('formatWxml')
  stages.push('mustache')
  return stages
}

export type FullPipelineArgs = Omit<RunWxmlPipelineOptions, 'source'> & { source: string }

/**
 * 完整流水线：直接调用生产 `runWxmlPipeline`（与 `runPipelineStages` 三阶段全开等价）。
 * @param args
 */
export function runFullWxmlPipeline(args: FullPipelineArgs): Promise<string> {
  return runWxmlPipeline(args)
}
