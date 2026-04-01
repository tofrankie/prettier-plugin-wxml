import type { Options } from 'prettier'
import type { PrettierPluginOrganizeAttributesParserOptions } from 'prettier-plugin-organize-attributes'

export interface WxmlPluginOptions
  extends Options, Partial<PrettierPluginOrganizeAttributesParserOptions> {
  /**
   * 是否严格模式（默认 `true`）。
   * 开启时：解析或格式化失败会抛出错误。关闭时：尽量保留可运行内容并跳过无法处理的部分；是否打印提示见 `wxmlFallbackLog`。
   */
  wxmlStrict?: boolean
  /**
   * 在非严格模式下，是否在容错时向 `console.warn` 输出提示。
   * 默认 `true`；设为 `false` 可静默。**在严格模式下本选项不生效**。
   */
  wxmlFallbackLog?: boolean
  /**
   * 是否对 WXML 做整文件缩进换行排版，并格式化其中的内联 WXS（默认 `true`）。
   * 关闭时跳过上述排版；插值表达式 `{{ }}` 的格式化仍会进行（除非整文件无法解析）。
   */
  wxmlFormat?: boolean
  /**
   * 是否将空内容的成对标签改为自闭合（如 `<view></view>` → `<view />`），默认 `false`。
   * 仅在 `wxmlFormat` 为 `true` 时生效；设为 `true` 时才会执行自闭合阶段。
   */
  wxmlSelfClose?: boolean
  /**
   * 在 `wxmlFormat` 与 `wxmlSelfClose` 均为开启时，指定不做处理的标签名（小写数组）。空数组表示不排除。
   * 仅在 Prettier 配置里写 `string[]`；若要在代码里动态生成列表，请使用 `resolveSelfCloseExcludeSet`。
   */
  wxmlSelfCloseExclude?: string[]
  /**
   * 在 `wxmlFormat` 开启时，使用 `prettier-plugin-organize-attributes` 对属性进行排序。
   * 默认 `false`。与 `attributeGroups`、`attributeSort`、`attributeIgnoreCase` 配合使用，详见 {@link https://github.com/NiklasPor/prettier-plugin-organize-attributes | prettier-plugin-organize-attributes}。
   */
  wxmlOrganizeAttributes?: boolean
}
