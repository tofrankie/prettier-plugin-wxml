# @tofrankie/prettier-plugin-wxml

[![npm version](https://img.shields.io/npm/v/@tofrankie/prettier-plugin-wxml)](https://www.npmjs.com/package/@tofrankie/prettier-plugin-wxml) [![node version](https://img.shields.io/node/v/@tofrankie/prettier-plugin-wxml)](https://nodejs.org) [![npm package license](https://img.shields.io/npm/l/@tofrankie/prettier-plugin-wxml)](https://github.com/tofrankie/prettier-plugin-wxml/blob/main/LICENSE) [![npm last update](https://img.shields.io/npm/last-update/@tofrankie/prettier-plugin-wxml)](https://www.npmjs.com/package/@tofrankie/prettier-plugin-wxml)

> [!WARNING]
> **尚未稳定**，在 1.0.0 之前仍可能发布不兼容的破坏性变更，升级前请查看 [CHANGELOG](CHANGELOG.md)。

面向微信小程序 WXML 的 Prettier 插件，对文本节点与属性值中的 `{{ ... }}` 插值语法进行格式化处理。

- 对 WXML 插值的变量/值/表达式进行空格归一与格式化：`{{username}}` → `{{ username }}`、`{{count+1}}` → `{{ count + 1 }}`
- 若 WXML 插值使用语句（如 `if` / `return`）而不是表达式，则会保持原样（不处理）。
- 若 WXML 插值使用不合法的表达式（如 `{{foo+}}`），则会保持原样（不处理）。

## 安装

```bash
pnpm add -D prettier @tofrankie/prettier-plugin-wxml
```

## 配置

在 Prettier 配置中注册插件，并指定 `parser` 为 `wxml`（或依赖文件扩展名 `.wxml` 自动选用该 parser）：

```json
{
  "plugins": ["@tofrankie/prettier-plugin-wxml"],
  "overrides": [
    {
      "files": "*.wxml",
      "options": {
        "parser": "wxml"
      }
    }
  ]
}
```

在编写 Prettier 共享配置（shareable configuration）并对外发布 npm 包时，推荐使用这种写法，避免使用方因模块解析路径差异导致插件加载失败。

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

## 插件选项

| 选项               | 类型                 | 默认       | 说明                                                                                                    |
| ------------------ | -------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `wxmlThrowOnError` | `boolean`            | `false`    | 为 `true` 时，WXML 解析失败或某一插值无法安全格式化时抛出原始错误，便于排查。                           |
| `wxmlReportLevel`  | `'silent' \| 'warn'` | `'silent'` | 为 `warn` 时，在容错回退（整文件跳过或部分插值未改）时向 `console.warn` 输出一行提示（含 `filepath`）。 |

## 行为与限制

### 解析 WXML

使用 `angular-html-parser` 将 WXML 文件当作类 HTML 解析。若与微信 WXML 存在细微差异，或源码无法被解析器接受，可能产生解析错误。默认整文件原样返回（不做任何处理）；若 `wxmlThrowOnError: true` 则抛出。

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

## 容错与错误

- 默认 `wxmlThrowOnError: false`：`parseHtml` 失败则整文件不变；某一插值表达式失败则仅该插值不变，其余继续。
- `wxmlThrowOnError: true`：上述错误直接抛出。
- `wxmlReportLevel: 'warn'`：在容错回退时向 `console.warn` 输出一行提示，例如：
  - `[@tofrankie/prettier-plugin-wxml] skipped <filepath>: wxml-parse-failed: <message>`
  - `[@tofrankie/prettier-plugin-wxml] partial <filepath>: expression-format-failed x<N>`

## License

MIT
