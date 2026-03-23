# @tofrankie/prettier-plugin-wxml

[![npm version](https://img.shields.io/npm/v/@tofrankie/prettier-plugin-wxml)](https://www.npmjs.com/package/@tofrankie/prettier-plugin-wxml) [![node version](https://img.shields.io/node/v/@tofrankie/prettier-plugin-wxml)](https://nodejs.org) [![npm package license](https://img.shields.io/npm/l/@tofrankie/prettier-plugin-wxml)](https://github.com/tofrankie/prettier-plugin-wxml/blob/main/LICENSE) [![npm last update](https://img.shields.io/npm/last-update/@tofrankie/prettier-plugin-wxml)](https://www.npmjs.com/package/@tofrankie/prettier-plugin-wxml)

> [!WARNING]
> **尚未稳定**，在 1.0.0 之前仍可能发布不兼容的破坏性变更，升级前请查看 [CHANGELOG](CHANGELOG.md)。

面向微信小程序 WXML 的 Prettier 插件，对文本节点与属性值中的 `{{ ... }}` 插值语法进行格式化处理。

- 对 WXML 插值中的表达式进行空格归一与格式化：`{{username}}` → `{{ username }}`、`{{count+1}}` → `{{ count + 1 }}`
- 若 WXML 插值语法使用语句（如 `if` / `return`）而不是表达式，则会保持原样（不处理）。
- 若 WXML 插值语法内使用不合法的表达式（如 `{{foo+}}`），则会保持原样（不处理）。

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

在编写 Prettier 共享配置（shareable config）并对外发布 npm 包时，推荐使用这种写法，避免使用方因模块解析路径差异导致插件加载失败。

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

通用选项（如 `singleQuote`、`printWidth`、`tabWidth` 等）会一并传入内层对表达式的 `format()`，但内层固定 `semi: false`，且不会加载本插件，以避免循环解析。

## 插件选项

| 选项               | 类型                 | 默认       | 说明                                                                                                    |
| ------------------ | -------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `wxmlThrowOnError` | `boolean`            | `false`    | 为 `true` 时，WXML 解析失败或某一插值无法安全格式化时抛出原始错误，便于排查。                           |
| `wxmlReportLevel`  | `'silent' \| 'warn'` | `'silent'` | 为 `warn` 时，在容错回退（整文件跳过或部分插值未改）时向 `console.warn` 输出一行提示（含 `filepath`）。 |

## 行为与限制

### 整文件 HTML 解析（`angular-html-parser` 的 `parseHtml`）

插件依赖 `angular-html-parser` 将源码当作类 HTML 解析。若与微信 WXML 存在细微差异，或源码无法被解析器接受，可能产生解析错误。默认整文件原样返回（不做任何处理）；若 `wxmlThrowOnError: true` 则抛出。

### 扫描范围

仅在 AST 给出的文本节点与属性值对应区间内提取 `{{ }}`。注释节点整段跳过（注释里的 `{{ }}` 不处理）。

### 插值边界扫描（字符串与模板字符串）

在每一段可扫描的文本或属性值内部，用状态机配对 `{{` 与 `}}`：在单引号/双引号字符串字面量内出现的 `}}` 不会被当作闭合。  
模板字符串（反引号 `` ` ``）与嵌套 `{}` 未按 JS 模板字符串语法处理；若插值内使用反引号表达式，可能出现 `}}` 配对错误，属于已知限制，该插值可能无法正确格式化或区间异常。

### 插值语言

仅将内容视为 JavaScript 表达式格式化；不包含 TypeScript（无 `typescript` / `babel-ts` 承诺）。

### 典型表达式

业务中常见：标识符、数字、字符串、数组字面量（如 `wx:for="{{[1, 2, 3]}}"`）、对象字面量等。更复杂的写法在能解析时同样会格式化；若解析或格式化失败，则该插值原样保留（默认）。

### `template` / `data` 的「类对象」简写

小程序 `data="{{foo, bar}}"` 等运行时语义与 ECMAScript 中同一字符串作为独立表达式的解析结果可能不一致。  
本插件会先按“单表达式”尝试；若失败，会再尝试把内容包成对象字面量（`{...}`）格式化后去壳写回。若仍无法解析，才会按容错原样保留。

### 属性值内外引号偏好

仅在属性值插值场景下，内层字符串会参考外层属性引号：

- 外层属性是 `"`，内层字符串优先 `'`
- 外层属性是 `'`，内层字符串优先 `"`

文本节点插值不做这项引号偏好处理。

### 属性值与源码偏移

实现依赖解析器给出的节点在源码中的起止位置；若某版本解析器对属性值区间与微信不一致，可能影响插值定位（属实现细节）。

### `}}` 与 `}}` 后、引号前的空格

若属性写成 `wx:for="{{[1,2,3]}} "`（`}}` 与闭合引号 `"` 之间有空格），该空格属于属性值字符串的一部分，可能影响运行时语义。  
插件行为：只替换一对 `{{`…`}}` 所覆盖的区间内的表达式；不会删除或移动 `}}` 与引号之间的空格。

### 绝对偏移与逆序替换

整份 `.wxml` 是一个字符串，从 0 编号。每个插值记录 `{{` 与 `}}` 之后在整串中的绝对偏移；printer 按各插值的 `start` 从大到小逆序替换，避免先改前面导致后面下标偏移。

## 容错与错误

- 默认 `wxmlThrowOnError: false`：`parseHtml` 失败则整文件不变；某一插值表达式失败则仅该插值不变，其余继续。
- `wxmlThrowOnError: true`：上述错误直接抛出。
- `wxmlReportLevel: 'warn'`：在容错回退时向 `console.warn` 输出一行提示，例如：
  - `[prettier-plugin-wxml] skipped <filepath>: wxml-parse-failed: <message>`
  - `[prettier-plugin-wxml] partial <filepath>: expression-format-failed x<N>`

## License

MIT
