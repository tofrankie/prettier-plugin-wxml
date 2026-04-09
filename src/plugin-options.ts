import type { Options } from 'prettier'
import type { PrettierPluginOrganizeAttributesParserOptions } from 'prettier-plugin-organize-attributes'

export interface WxmlPluginOptions
  extends Options, Partial<PrettierPluginOrganizeAttributesParserOptions> {
  /**
   * 是否严格模式（默认 `true`）。
   * 开启时：任一流水线阶段 HTML 解析失败（`wxml-html-parse-failed:`）、Vue 排版失败、插值收集/格式化失败、内联 wxs 合并/格式化失败、跨行属性折叠阶段解析失败均会抛错，且不会输出半格式化结果。关闭时：尽量保留可运行内容并跳过无法处理的部分；是否打印提示见 `wxmlFallbackLog`。
   */
  wxmlStrict?: boolean
  /**
   * 在非严格模式下，是否在容错时向 `console.warn` 输出提示。
   * 默认 `true`；设为 `false` 可静默。**在严格模式下本选项不生效**。
   */
  wxmlFallbackLog?: boolean
  /**
   * 是否对 WXML 做整文件 Vue 排版，并对内联 `<wxs>` 正文执行 Babel 格式化及布局规范化（默认 `true`）。
   *
   * 流水线**始终**先将符合条件的内联 `<wxs>` 正文换成占位符、**最后**再写回（不因本项为 `false` 而跳过）：本项为 `true` 时写回 Babel 格式化后的 JS 并可做 `<wxs>` 布局规范化；为 `false` 时写回抽取时缓存的**原文**（不跑 Babel / `normalizeWxsBlocksLayout`）。能否成功抽取仍取决于全文是否能被 HTML 解析器解析。
   *
   * 为 `false` 时还会跳过：Vue 整段排版、跨行属性折叠（见 `wxmlCollapseAttrsValue`）、依赖 `wxmlFormat` 的自闭合与属性排序等。`{{ }}` 插值仍会尝试格式化（依赖 HTML 解析；解析失败时严格模式抛错，非严格模式告警并跳过插值处理）。
   */
  wxmlFormat?: boolean
  /**
   * 是否将无任何子节点的成对标签改为自闭合（如 `<view></view>` → `<view />`），默认 `false`。
   * 仅在 `wxmlFormat` 为 `true` 时生效；设为 `true` 时才会执行自闭合阶段。
   */
  wxmlSelfClose?: boolean
  /**
   * 在 `wxmlFormat` 与 `wxmlSelfClose` 均为开启时，指定不做处理的标签名（小写数组）。空数组表示不排除。
   * 仅在 Prettier 配置里写 `string[]`；若要在代码里动态生成列表，请使用 `resolveSelfCloseExcludeSet`。
   */
  wxmlSelfCloseExclude?: string[]
  /**
   * 是否将跨行属性值折叠为单行（默认 `true`）。
   * 通常 WXML 里元素属性值不应包含换行，否则可能会导致编译失败。
   * 仅在 `wxmlFormat` 为 `true` 时生效。
   */
  wxmlCollapseAttrsValue?: boolean
  /**
   * 在 `wxmlFormat` 开启时，使用 `prettier-plugin-organize-attributes` 对属性进行排序。
   * 默认 `false`。与 `attributeGroups`、`attributeSort`、`attributeIgnoreCase` 配合使用，详见 {@link https://github.com/NiklasPor/prettier-plugin-organize-attributes | prettier-plugin-organize-attributes}。
   */
  wxmlOrganizeAttributes?: boolean
}
