# @tofrankie/prettier-plugin-wxml

[![npm version](https://img.shields.io/npm/v/@tofrankie/prettier-plugin-wxml)](https://www.npmjs.com/package/@tofrankie/prettier-plugin-wxml) [![node version](https://img.shields.io/node/v/@tofrankie/prettier-plugin-wxml)](https://nodejs.org) [![npm package license](https://img.shields.io/npm/l/@tofrankie/prettier-plugin-wxml)](https://github.com/tofrankie/prettier-plugin-wxml/blob/main/LICENSE) [![npm last update](https://img.shields.io/npm/last-update/@tofrankie/prettier-plugin-wxml)](https://www.npmjs.com/package/@tofrankie/prettier-plugin-wxml)

> [!WARNING]
> **尚未稳定**，在 **1.0.0** 之前仍可能发布**不兼容的破坏性变更**，升级前请查看 [CHANGELOG](CHANGELOG.md)。

面向微信小程序 **WXML** 的 **Prettier 3.x** 插件：仅做一件事，在**不改动标签结构、缩进与换行策略**的前提下，对文本节点与属性值中的 **`{{ ... }}` 插值语法**格式化处理：

- 花括号内部表达式保留一个空格：`{{username}}` → `{{ username }}`
- 若 WXML 插值语法使用语句（如 `if` / `return`）而不是表达式，则会保持原样（**不处理**）。
- 若 WXML 插值语法内使用不合法的表达式（如 `{{foo+}}`），则会保持原样（**不处理**）。

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

通用选项（如 `singleQuote`、`printWidth`、`tabWidth` 等）会**一并传入**内层对表达式的 `format()`，但内层固定 `semi: false` 且**不会**加载本插件，以避免循环解析。

## 插件选项

| 选项               | 类型                 | 默认       | 说明                                                                                                    |
| ------------------ | -------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `wxmlThrowOnError` | `boolean`            | `false`    | 为 `true` 时，WXML 解析失败或某一插值无法安全格式化时**抛出**原始错误，便于排查。                       |
| `wxmlReportLevel`  | `'silent' \| 'warn'` | `'silent'` | 为 `warn` 时，在容错回退（整文件跳过或部分插值未改）时向 `console.warn` 输出一行提示（含 `filepath`）。 |

## 行为与限制

### 整文件 HTML 解析（`angular-html-parser` 的 `parseHtml`）

插件依赖 `angular-html-parser` 将源码当作类 HTML 解析。若与微信 WXML 存在细微差异，或源码无法被解析器接受，可能产生**解析错误**。默认**整文件原样返回**（不做任何插值改写）；若 `wxmlThrowOnError: true` 则抛出。

### 扫描范围

仅在 AST 给出的**文本节点**与**属性值**对应区间内提取 `{{ }}`。**注释节点整段跳过**（注释里的 `{{ }}` 不处理）。

### 插值边界扫描（字符串与模板字符串）

在每一段可扫描的文本或属性值内部，用状态机配对 `{{` 与 `}}`：在 **单引号 / 双引号** 字符串字面量内出现的 `}}` **不会**被当作闭合。  
**模板字符串**（反引号 `` ` ``）与嵌套 `{}` **未**按 JS 模板字符串语法处理；若插值内使用反引号表达式，可能出现 `}}` 配对错误，属于已知限制，该插值可能无法正确格式化或区间异常。

### 插值语言

仅将内容视为 **JavaScript 表达式** 格式化；**不包含** TypeScript（无 `typescript` / `babel-ts` 承诺）。

### 典型表达式

业务中常见：标识符、数字、字符串、数组字面量（如 `wx:for="{{[1, 2, 3]}}"`）、对象字面量等。更复杂的写法在能解析时同样会格式化；**若解析或格式化失败，则该插值原样保留**（默认）。

### `template` / `data` 的「类对象」简写

小程序 `data="{{foo, bar}}"` 等运行时语义与 **ECMAScript 中同一字符串作为独立表达式** 的解析结果**可能不一致**。本插件仍对**抽出的字符串**按 JS 去 `format`；若无法解析或存在语义偏差，依赖容错——**该插值原样保留**（首版不承诺还原为与微信「完全等价」的对象字面量）。

### 属性值与源码偏移

实现依赖解析器给出的节点在源码中的起止位置；若某版本解析器对属性值区间与微信不一致，可能影响插值定位（属实现细节）。

### `}}` 与 `}}` 后、引号前的空格

若属性写成 `wx:for="{{[1,2,3]}} "`（`}}` 与闭合引号 `"` 之间有空格），该空格**属于属性值字符串的一部分**，可能影响运行时语义。  
**插件行为**：只替换一对 `{{`…`}}` 所覆盖的区间内的表达式；**不会**删除或移动 `}}` 与引号之间的空格。

### 绝对偏移与逆序替换

整份 `.wxml` 是一个字符串，从 0 编号。每个插值记录 `{{` 与 `}}` 之后**在**整串中的**绝对偏移**；**printer** 按各插值的 `start` **从大到小**逆序替换，避免先改前面导致后面下标偏移。

## 容错与错误

- 默认 **`wxmlThrowOnError: false`**：`parseHtml` 失败则整文件不变；某一插值表达式失败则**仅该插值**不变，其余继续。
- **`wxmlThrowOnError: true`**：上述错误直接抛出。
- **`wxmlReportLevel: 'warn'`**：在容错回退时向 `console.warn` 输出一行提示，例如：
  - `[prettier-plugin-wxml] 已跳过 <filepath>：WXML 解析失败：<message>`
  - `[prettier-plugin-wxml] 部分失败 <filepath>：共 <N> 处插值未能格式化`

## License

MIT
