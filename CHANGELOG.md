# Changelog

## prettier-plugin-wxml@0.0.2 (2026-03-23)

- 修复插件导出形态，兼容 `plugins: [require.resolve('@tofrankie/prettier-plugin-wxml')]` + `parser: 'wxml'` 的加载方式
- 插值内表达式格式化改为 `@babel/parser` 校验 + Prettier `babel` 格式化，并新增对象回退：`a:1,b:2` 等可按对象字面量格式化后去壳写回
- 属性值插值新增内层引号偏好：外层属性为 `"` 时内层倾向 `'`，外层为 `'` 时内层倾向 `"`；该逻辑仅作用于属性插值，不影响文本节点
- 扩充测试覆盖：长属性值（>150 且含多个插值）、空格归一、非法表达式（含已带空格场景）、布尔属性、字符串边界与多种属性插值组合

## prettier-plugin-wxml@0.0.1 (2026-03-23)

- 使用 `angular-html-parser` 解析 WXML
- 格式化插值
