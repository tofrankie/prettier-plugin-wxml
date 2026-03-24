import type { Options } from 'prettier'
import type {
  RunWxmlPipelineOptions,
  WxmlFormatOnError,
} from '../../src/pipeline/run-wxml-pipeline'
import { runFormatWxmlPass } from '../../src/pipeline/format-wxml-pass'
import { runMustachePass } from '../../src/pipeline/mustache-pass'
import { runWxmlPipeline } from '../../src/pipeline/run-wxml-pipeline'
import { runSelfClosePass } from '../../src/pipeline/self-close-pass'

/** 流水线阶段（顺序固定为 selfClose → formatWxml → mustache）。 */
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
  formatOnError?: WxmlFormatOnError
  throwOnError?: boolean
  onWarn?: (msg: string) => void
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
    formatOnError = 'warn',
    throwOnError = false,
    onWarn = noopWarn,
  } = args

  const want = new Set(stages)
  let current = source

  if (want.has('selfClose')) {
    current = runSelfClosePass(current, selfCloseExclude, onWarn)
  }
  if (want.has('formatWxml')) {
    current = await runFormatWxmlPass({
      source: current,
      prettierOptions,
      formatOnError,
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
    return current
  }

  return current
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
