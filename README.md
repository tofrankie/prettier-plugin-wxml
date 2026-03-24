# @tofrankie/prettier-plugin-wxml

[![npm version](https://img.shields.io/npm/v/@tofrankie/prettier-plugin-wxml)](https://www.npmjs.com/package/@tofrankie/prettier-plugin-wxml) [![node version](https://img.shields.io/node/v/@tofrankie/prettier-plugin-wxml)](https://nodejs.org) [![npm package license](https://img.shields.io/npm/l/@tofrankie/prettier-plugin-wxml)](https://github.com/tofrankie/prettier-plugin-wxml/blob/main/LICENSE) [![npm last update](https://img.shields.io/npm/last-update/@tofrankie/prettier-plugin-wxml)](https://www.npmjs.com/package/@tofrankie/prettier-plugin-wxml)

> [!WARNING]
> **尚未稳定**，在 1.0.0 之前仍可能发布不兼容的破坏性变更，升级前请查看 [CHANGELOG](CHANGELOG.md)。

面向微信小程序 [WXML](https://developers.weixin.qq.com/miniprogram/dev/reference/wxml/) 的 Prettier 插件。

## ✨ 功能特性

- 对 WXML 插值表达式两侧追加空格 `{{username}}` → `{{ username }}`
- 对 WXML 插值表达式进行格式化 `{{count+1}}` → `{{ count + 1 }}`
- 对 WXML 空内容元素自闭合（self-close） `<view></view>` → `<view />`
- 对 WXML 文件进行统一的格式化（缩进换行）
- 对 WXML 文件中的 WXS 格式化
- 针对 WXML 特有规则进行处理，以尽可能地适配所有 WXML 规则，避免小程序解析 WXML 失败

> 假设解析 WXML 过程遇到解析异常，则会尽可能地保持原样。如 `{{ }}` 被编辑器自动保存不合理地折行、插值使用不合法的表达式（如 `{{foo+}}`）等。

<!-- prettier-ignore-start -->
```html
<!-- input -->
<view>{{username}}</view>
<view>{{count+1}}</view>
<view wx:if="{{flag}}" data-score="{{count*2+1}}"></view>

<view></view>

<image class="icon" src="{{flag?'https://placehold.co/600x400/000000/FFFFFF?text=Hello+World':'https://placehold.co/600x400/000000/FFFFFF?text=Hello+World'}}" mode="aspectFill"></image>

<!-- prettier-ignore -->
<view>{{c+d}}</view>
<view>{{e+f}}</view>


<!-- invalid: {{'invalid expression cases'}} -->
<view>{{foo+}}</view>
```

```html
<!-- output -->
<view>{{ username }}</view>
<view>{{ count + 1 }}</view>
<view wx:if="{{ flag }}" data-score="{{ count * 2 + 1 }}" />

<view />

<image
  class="icon"
  src="{{ flag ? 'https://placehold.co/600x400/000000/FFFFFF?text=Hello+World' : 'https://placehold.co/600x400/000000/FFFFFF?text=Hello+World' }}"
  mode="aspectFill"
/>

<!-- prettier-ignore -->
<view>{{c+d}}</view>
<view>{{ e + f }}</view>

<!-- invalid: {{'invalid expression cases'}} -->
<view>{{foo+}}</view>
```
<!-- prettier-ignore-end -->

## 📦 安装

```bash
pnpm add -D prettier @tofrankie/prettier-plugin-wxml
```

## ⚙️ 配置

若是项目使用，可以在配置文件（如 `prettier.config.js`）中注册插件，并指定 `parser` 为 `wxml`：

```js
export default {
  plugins: ['@tofrankie/prettier-plugin-wxml'],
  overrides: [
    {
      files: '*.wxml',
      options: {
        parser: 'wxml',
      },
    },
  ],
}
```

若编写 Prettier 共享配置（shareable configuration）并对外发布 npm 包时，推荐以下写法，避免使用方因模块解析路径差异导致插件加载失败。

```js
import wxmlPlugin from '@tofrankie/prettier-plugin-wxml'

export default {
  plugins: [wxmlPlugin],
  parser: 'wxml',
}
```

也支持通过 `require.resolve` 传入插件路径：

```js
module.exports = {
  plugins: [require.resolve('@tofrankie/prettier-plugin-wxml')],
  parser: 'wxml',
}
```

## 🎛️ 插件选项

插件支持插值格式化（默认开启且不可关闭），还提供了整体的代码格式化（默认开启，可选开/关），包括代码缩进和自闭合处理。

> 默认情况下，内部流程先抽取内联 `wxs` 正文（占位）→ selfClose → Vue 整文件排版 → 插值 → 合并 `wxs` 正文（`babel`）并整理 `wxs` 块布局（起止标签各占一行，类似 `<script>`）。

| 选项                   | 类型                           | 默认       | 说明                                                                                                        |
| ---------------------- | ------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `wxmlThrowOnError`     | `boolean`                      | `false`    | 为 `true` 时，WXML 解析失败或某一插值无法安全格式化时抛出原始错误，便于排查。                               |
| `wxmlReportLevel`      | `'silent'` \| `'warn'`         | `'silent'` | 为 `warn` 时，在容错回退（整文件跳过或部分插值未改）时向 `console.warn` 输出提示（含 `filepath`）。         |
| `wxmlFormat`           | `boolean`                      | `true`     | 为 `false` 时跳过整文件排版。                                                                               |
| `wxmlFormatWxs`        | `boolean`                      | `true`     | 为 `false` 时不抽取内联 `<wxs>` 正文、不 babel 合并、不整理 wxs 块布局；仍参与 selfClose / Vue / mustache。 |
| `wxmlFormatOnError`    | `'warn'` \| `'throw'`          | `'warn'`   | Vue 排版阶段失败时告警并回退该阶段输入，或直接抛错。                                                        |
| `wxmlSelfClose`        | `boolean`                      | `true`     | 为 `false` 时跳过自闭合；默认对**无子内容**的成对标签做 **selfClose**（如 `<view></view>` → `<view />`）。  |
| `wxmlSelfCloseExclude` | `string[]` \| `() => string[]` | `[]`       | 指定不做 selfClose 的标签名数组（小写匹配）。空数组表示不排除任何标签。                                     |

> 若开启 `wxmlThrowOnError` 等用于排查失败，记得 Prettier CLI 检查是否使用了 `--log-level silent`，它会屏蔽输出。

## 📋 行为与限制

### 解析 WXML

使用 `angular-html-parser` 将 WXML 当作类 HTML 解析，用于收集插值区间、处理 `<!-- prettier-ignore -->` 对应范围，以及自闭合阶段。若与微信 WXML 存在细微差异，或源码无法被解析器接受，可能产生解析错误。默认整文件原样返回（不做任何处理）；若 `wxmlThrowOnError: true` 则抛出。开启 `wxmlFormat` 时，结构化缩进由 Prettier Vue 阶段完成（直解析失败时会临时包一层 `<template>` 再去壳），其失败行为由 `wxmlFormatOnError` 控制。

### 扫描范围

仅在 AST 给出的文本节点与属性值对应区间内提取 `{{ }}`。注释不处理。

### WXML 对象语法处理

WXML 支持 `data="{{foo, bar}}"` 的对象用法（[详见](https://developers.weixin.qq.com/miniprogram/dev/reference/wxml/data.html#对象)），由于它不是标准的 JS 对象字面量。为了能正常格式化，内部先按“表达式”尝试；若失败，会再尝试把内容包成对象字面量（`{...}`）格式化后去壳写回。若仍无法解析，才会按容错原样保留。

### 属性值单双引号

WXML 元素属性支持 `data="{{ 'foo' }}"` 或 `data='{{ "foo" }}'` 两种写法。属性值插值会优先与外层属性引号保持可解析的一致性，以避免无法解析格式化后的 WXML。文本节点主要取决于你的 `singleQuote` 配置。

```html
<!-- input -->
<view data="{{'foo'}}"></view>
<view data='{{"foo"}}'></view>
<view>{{"foo"}}</view>
```

```html
<!-- output -->
<view data='{{ "foo" }}'></view>
<view data="{{ 'foo' }}"></view>
<view>{{ 'foo' }}</view>
```

### 属性插值 `{{ }}` 外的空格

WXML 支持属性写成 `wx:for="{{[1,2,3]}} "`（[详见](https://developers.weixin.qq.com/miniprogram/dev/reference/wxml/data.html#对象)），`}}` 与闭合引号 `"` 之间有一个空格，等同于 `wx:for="{{[1,2,3] + ' '}}"`。为降低实现复杂度，本插件仅对插值内表达式前后做格式化，不会删除或移动 `}}` 与引号之间的空格。

```html
<!-- input -->
<view wx:for="{{[1,2,3]}} "></view>
```

```html
<!-- output -->
<view wx:for="{{ [1, 2, 3] }} "></view>
```

## 🛡️ 容错与错误

- 默认 `wxmlThrowOnError: false`：`parseHtml` 失败则整文件不变；某一插值表达式失败则仅该插值不变，其余继续。
- `wxmlThrowOnError: true`：上述错误直接抛出。
- `wxmlReportLevel: 'warn'`：在容错回退时向 `console.warn` 输出一行提示，例如：
  - `[@tofrankie/prettier-plugin-wxml] <filepath>: wxml-format-failed: <message>`
  - `[@tofrankie/prettier-plugin-wxml] <filepath>: mustache-collect-failed: <message>`
  - `[@tofrankie/prettier-plugin-wxml] <filepath>: expression-format-failed x<N>`
  - 内联 `wxs` 正文无法被 `babel` 格式化时：`wxs-inline-format-failed: block <id>`

## ❓ 常见问题

### Opening tag "view" not terminated. 与 Unexpected closing tag "view".

通常是 WXML 属性使用了不合法的引号包裹（见下方示例）。

原因：属性外层引号与 mustache 内部引号字符串冲突，解析器把属性提前截断，导致后续标签边界错乱并产生连锁 closing tag 错误。
解决方案：需手动修正后，后续便可以正常解析了。

```html
<!-- bad -->
<view data='{{ 'foo' }}'></view>
<view data="{{ "foo" }}"></view>
```

```html
<!-- good -->
<view data="{{ 'foo' }}"></view>
<view data='{{ "foo" }}'></view>
```

### Only void, custom and foreign elements can be self closed "slot"

原因：`angular-html-parser` 默认按 HTML 规则校验自闭合；`slot`/`textarea`/`button` 在该规则下不能使用 `/>`，但 WXML 中常见此写法。

## 📄 License

MIT
