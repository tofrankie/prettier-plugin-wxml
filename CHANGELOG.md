# Changelog

## prettier-plugin-wxml@0.0.6 (2026-03-31)

### Changed

- 原 `wxmlThrowOnError` 升级为 `wxmlStrict` 选项。
- 将 `wxmlFormatWxs` 并入 `wxmlFormat` 选项，不再提供独立配置对 wxs 进行格式化
- 移除 `wxmlThrowOnError`、`wxmlFormatOnError`、`wxmlReportLevel` 选项（详见 README.md）

## prettier-plugin-wxml@0.0.5 (2026-03-25)

- 支持 WXML 中的 WXS 代码格式化

## prettier-plugin-wxml@0.0.4 (2026-03-25)

### Features

- 支持代码缩进格式化处理
- 支持空内容标签自闭合处理（如 `<view></view>` → `<view />`）
- 支持更多配置选项：`wxmlThrowOnError`、`wxmlReportLevel`、`wxmlFormat`、`wxmlFormatOnError`、`wxmlSelfClose`、`wxmlSelfCloseExclude`
- 丰富测试用例

## prettier-plugin-wxml@0.0.3 (2026-03-24)

- 修复插值表达式换行问题，避免格式化后小程序无法解析 WXML
- 更多测试用例

## prettier-plugin-wxml@0.0.2 (2026-03-23)

- 修复插件导出形态，兼容 `plugins: [require.resolve('@tofrankie/prettier-plugin-wxml')]` + `parser: 'wxml'` 的加载方式
- 插值内表达式格式化改为 `@babel/parser` 校验 + Prettier `babel` 格式化，并新增对象回退：`a:1,b:2` 等可按对象字面量格式化后去壳写回
- 属性值插值新增内层引号偏好：外层属性为 `"` 时内层倾向 `'`，外层为 `'` 时内层倾向 `"`；该逻辑仅作用于属性插值，不影响文本节点
- 扩充测试覆盖：长属性值（>150 且含多个插值）、空格归一、非法表达式（含已带空格场景）、布尔属性、字符串边界与多种属性插值组合

## prettier-plugin-wxml@0.0.1 (2026-03-23)

- 使用 `angular-html-parser` 解析 WXML
- 格式化插值
