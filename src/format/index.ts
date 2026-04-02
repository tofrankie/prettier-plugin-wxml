import type { Options } from 'prettier'
import { runCollapseAttrsValue } from './collapse-attrs-value'
import { runMustache } from './mustache'
import { runSelfClose } from './self-close'
import { runVueFormat } from './vue-format'
import { extractInlineWxs, mergeFormattedWxsInlineBlocks } from './wxs-inline'

/**
 * WXML 格式化流程（与 Prettier 插件 `parse` 内逻辑一致）：
 *
 * 0. 将内联 `<wxs>` 正文（若有）替换为占位符，便于后续 Vue / HTML 解析；与 `formatWxsEnabled` 无关。
 * 1. 可选：自闭合空标签（`selfCloseEnabled`）
 * 2. 可选：Vue 模板排版（`formatEnabled`）
 * 3. 必选：`{{ }}` 插值格式化
 * 4. 可选：将跨行属性值折叠为单行（`formatEnabled` 与 `collapseAttrsValueEnabled` 均为真时）
 * 5. 将占位符还原为 wxs 正文；`formatWxsEnabled` 为真时用 Babel 格式化内联 JS
 *
 * 各阶段基于当前字符串重新计算偏移，禁止复用上游下标。
 * `throwOnError === false` 时：某步失败会调用 `onWarn` 并尽量保留该步输入字符串。
 */

/** {@link formatWxml} 的入参；字段组合需自洽，若要与 `.prettierrc` 行为一致，请对照插件内 `buildAst` 的传参。 */
export interface FormatWxmlOptions {
  /** 待处理的 WXML 全文 */
  source: string
  /** 当前 Prettier 选项；会传入内层 `prettier.format` 与插值表达式格式化 */
  prettierOptions: Options
  /**
   * 是否执行自闭合阶段。
   * Prettier 插件中为 `wxmlFormat !== false && wxmlSelfClose === true`。
   */
  selfCloseEnabled: boolean
  /** 不做自闭合的标签名（小写）；含义同 `wxmlSelfCloseExclude` */
  selfCloseExclude?: string[]
  /**
   * 是否执行 Vue 模板排版及 organize-attributes（若开启）。
   * 为 `false` 时还会跳过步骤 4；**步骤 0（wxs 占位）与步骤 5（还原）仍会执行**。
   * Prettier 插件里本项与 `formatWxsEnabled` 通常均随 `wxmlFormat`；程序化调用时二者可独立设置。
   */
  formatEnabled: boolean
  /**
   * 是否在末步对占位符还原的内联 wxs 正文执行 Babel 格式化及布局规范化。
   * 抽取占位符在步骤 0 **始终**进行（与该项无关）。
   */
  formatWxsEnabled: boolean
  /** 是否在步骤 2 中加载 `prettier-plugin-organize-attributes`；插件中为 `wxmlOrganizeAttributes && wxmlFormat` */
  organizeAttributesEnabled?: boolean
  /** 是否在步骤 4 折叠跨行属性值；插件默认 `true`，且仅在 `formatEnabled` 时生效 */
  collapseAttrsValueEnabled?: boolean
  /** 为 `true` 时遇错抛出；为 `false` 时走 `onWarn` 并回退，对应 `wxmlStrict !== false` 的反面 */
  throwOnError: boolean
  /** `throwOnError === false` 时的告警回调（如 `expression-format-failed:`、`wxs-inline-format-failed` 等前缀） */
  onWarn: (message: string) => void
}

/**
 * 执行 WXML 格式化流程，返回结果字符串。
 *
 * 适用场景：在构建脚本、CI 或自定义工具中复用与插件相同的处理顺序，而不经过 `prettier.format` 的完整调用链。
 * @param options 见 {@link FormatWxmlOptions}
 * @return 格式化后的全文
 */
export async function formatWxml(options: FormatWxmlOptions): Promise<string> {
  const {
    source,
    selfCloseEnabled,
    selfCloseExclude,
    formatEnabled,
    formatWxsEnabled,
    organizeAttributesEnabled = false,
    collapseAttrsValueEnabled = true,
    throwOnError,
    prettierOptions,
    onWarn,
  } = options

  const { source: afterWxsExtract, blocks: wxsInlineBlocks } = extractInlineWxs(source, {
    throwOnFatalHtmlParse: throwOnError,
  })

  let current = afterWxsExtract

  if (selfCloseEnabled) {
    current = runSelfClose(current, selfCloseExclude, throwOnError, onWarn)
  }

  if (formatEnabled) {
    current = await runVueFormat({
      source: current,
      prettierOptions,
      organizeAttributesEnabled,
      throwOnError,
      onWarn,
    })
  }

  let out = await runMustache({
    source: current,
    prettierOptions,
    throwOnError,
    onWarn,
  })

  if (formatEnabled && collapseAttrsValueEnabled) {
    out = runCollapseAttrsValue(out, throwOnError)
  }

  return mergeFormattedWxsInlineBlocks({
    source: out,
    blocks: wxsInlineBlocks,
    prettierOptions,
    onWarn,
    formatWxsEnabled,
    throwOnError,
  })
}
