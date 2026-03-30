# @tofrankie/prettier-plugin-wxml

[![npm version](https://img.shields.io/npm/v/@tofrankie/prettier-plugin-wxml)](https://www.npmjs.com/package/@tofrankie/prettier-plugin-wxml) [![node version](https://img.shields.io/node/v/@tofrankie/prettier-plugin-wxml)](https://nodejs.org) [![npm package license](https://img.shields.io/npm/l/@tofrankie/prettier-plugin-wxml)](https://github.com/tofrankie/prettier-plugin-wxml/blob/main/LICENSE) [![npm last update](https://img.shields.io/npm/last-update/@tofrankie/prettier-plugin-wxml)](https://www.npmjs.com/package/@tofrankie/prettier-plugin-wxml)

> [!WARNING]
> **尚未稳定**，在 1.0.0 之前仍可能发布不兼容的破坏性变更，升级前请查看 [CHANGELOG](CHANGELOG.md)。

面向微信小程序 [WXML](https://developers.weixin.qq.com/miniprogram/dev/reference/wxml/) 的 Prettier 插件。

## ✨ 功能特性

- 对 WXML 插值表达式进行格式化（默认开启且不可关闭）
- 对 WXML 空内容元素自闭合（默认开启）
- 对 WXML 文件进行整体格式化（默认开启）
  - 支持内联 WXS 格式化
  - 支持属性排序（默认关闭）

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
  mode="aspectFill"
  src="{{ flag ? 'https://placehold.co/600x400/000000/FFFFFF?text=Hello+World' : 'https://placehold.co/600x400/000000/FFFFFF?text=Hello+World' }}"
/>

<!-- prettier-ignore -->
<view>{{c+d}}</view>
<view>{{ e + f }}</view>

<!-- invalid: {{'invalid expression cases'}} -->
<view>{{foo+}}</view>
```
<!-- prettier-ignore-end -->

## ⚙️ 快速开始

安装

```bash
pnpm add -D prettier @tofrankie/prettier-plugin-wxml
```

在配置文件（如 `prettier.config.js`）中注册插件，并指定 `parser` 为 `wxml`：

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

若编写 Prettier 共享配置（shareable configuration）并对外发布 npm 包时，推荐以下写法：

```js
import wxmlPlugin from '@tofrankie/prettier-plugin-wxml'

export default {
  plugins: [wxmlPlugin],
  parser: 'wxml',
}
```

也支持通过 `require.resolve()` 传入插件路径：

```js
module.exports = {
  plugins: [require.resolve('@tofrankie/prettier-plugin-wxml')],
  parser: 'wxml',
}
```

## 🔧 高级选项

插值格式化默认开启且不可关闭，其他可按需选择开启或关闭。

| 选项                     | 类型                         | 默认     | 说明                                                                                                                                                                |
| ------------------------ | ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wxmlStrict`             | `boolean`                    | `true`   | 采用严格模式，遇到无法解析或无法安全格式化的内容会抛出错误。为 `false` 时尽量保留原文继续处理。                                                                     |
| `wxmlFallbackLog`        | `boolean`                    | `true`   | 遇到无法解析或无法安全格式化的内容会输出提示，但不抛出错误。仅当 `wxmlStrict` 为 `false` 时有效。                                                                   |
| `wxmlFormat`             | `boolean`                    | `true`   | 对 WXML 文件整体格式化，并按 JavaScript 的方式格式化内联 `<wxs>` 内容。                                                                                             |
| `wxmlSelfClose`          | `boolean`                    | `true`   | 对空内容元素标签进行自闭合处理。                                                                                                                                    |
| `wxmlSelfCloseExclude`   | `string[] \| () => string[]` | `[]`     | 指定不做自闭合处理的标签名数组（小写形式）。空数组表示不排除任何标签。仅在 `wxmlSelfClose` 为 `true` 时有效。                                                       |
| `wxmlOrganizeAttributes` | `boolean`                    | `false`  | 启用 [`prettier-plugin-organize-attributes`](https://github.com/NiklasPor/prettier-plugin-organize-attributes) 对属性进行排序。仅在 `wxmlFormat` 为 `true` 时生效。 |
| `attributeGroups`        | `string[]`                   | 上游默认 | [详见](https://github.com/NiklasPor/prettier-plugin-organize-attributes#groups)                                                                                     |
| `attributeSort`          | `'ASC' \| 'DESC' \| 'NONE'`  | 上游默认 | [详见](https://github.com/NiklasPor/prettier-plugin-organize-attributes#sort)                                                                                       |
| `attributeIgnoreCase`    | `boolean`                    | 上游默认 | [详见](https://github.com/NiklasPor/prettier-plugin-organize-attributes#case-sensitivity)                                                                           |

> 注意，`prettier --log-level silent` 会屏蔽 Prettier 的输出。

比如，仅开启插值格式化并尽可能容错，可以这样配置：

```js
export default {
  plugins: ['@tofrankie/prettier-plugin-wxml'],
  overrides: [
    {
      files: '*.wxml',
      options: {
        parser: 'wxml',
        wxmlStrict: false,
        wxmlFormat: false,
        wxmlSelfClose: false,
      },
    },
  ],
}
```

若需要同时开启属性排序，提供一份参考：

```js
export default {
  plugins: ['@tofrankie/prettier-plugin-wxml'],
  overrides: [
    {
      files: '*.wxml',
      options: {
        parser: 'wxml',
        wxmlOrganizeAttributes: true,
        attributeSort: 'ASC',
        attributeIgnoreCase: true,
        attributeGroups: [
          '^for$',
          '^(if|elif|else)$',
          '^key$',
          '^for-item$',
          '^for-index$',
          '^slot$',
          '^id$',
          '^class$',
          '^hover-class$',
          '^hover-',
          '$DEFAULT',
          '^tap$',
          '^bind',
          '^catch',
          '^on',
          '^worklet',
        ],
      },
    },
  ],
}
```

## ❓ 常见问题

### 关于属性插值 `{{ }}` 外的空格

WXML 支持属性写成 `wx:for="{{[1,2,3]}} "`（[详见](https://developers.weixin.qq.com/miniprogram/dev/reference/wxml/data.html#对象)），`}}` 与闭合引号 `"` 之间有一个空格，等同于 `wx:for="{{[1,2,3] + ' '}}"`。为降低实现复杂度，本插件不会删除或移动 `}}` 与引号之间的空格，前导空格同理。

```html
<!-- input -->
<view wx:for="{{[1,2,3]}} "></view>
```

```html
<!-- output -->
<view wx:for="{{ [1, 2, 3] }} "></view>
```

### 开启 `wxmlOrganizeAttributes` 后，缩进排版和属性排序是几次处理？

一次内层 `prettier.format` 同时完成，不需要额外再跑一轮整文件格式化。

`prettier-plugin-organize-attributes` 会在 `parse` 后重排属性，再由同一轮 `print` 产出最终缩进/换行结果。本插件在流水线中会先抽取内联 `<wxs>` 再进入 `vue` parser 格式化，因此不会把内联 `wxs` 正文当作模板属性参与排序。

### Opening tag "view" not terminated. 与 Unexpected closing tag "view".

通常是 WXML 属性使用了不合法的引号包裹（见下方示例）。

原因：属性外层引号与 mustache 内部引号字符串冲突，解析器把属性提前截断，导致后续标签边界错乱并产生连锁 closing tag 错误。
解决方案：本插件无法自动修复，需手动修正。

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

## 🎉 致谢

感谢 [prettier-plugin-organize-attributes](https://github.com/NiklasPor/prettier-plugin-organize-attributes) 提供的属性排序功能。

## 📄 License

MIT
