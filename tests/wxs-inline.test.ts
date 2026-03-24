import type { Options } from 'prettier'
import baseOptions from '@tofrankie/prettier'
import * as prettier from 'prettier'
import { describe, expect, it, vi } from 'vitest'
import { collectMustacheRegions } from '../src/collect-mustache-regions'
import plugin from '../src/index'
import {
  extractInlineWxsForPipeline,
  mergeFormattedWxsInlineBlocks,
  normalizeWxsBlocksLayout,
} from '../src/pipeline/wxs-inline-pass'

const base = baseOptions as Options

/**
 * 与 index 测试一致：去掉 Prettier 默认追加的单个 EOF 换行，便于断言。
 * @param source
 */
async function formatWxmlSample(source: string) {
  const out = await prettier.format(source, {
    ...base,
    parser: 'wxml',
    plugins: [plugin],
    filepath: 'sample.wxml',
    wxmlFormat: true,
    wxmlSelfClose: true,
  })
  return out.endsWith('\n') ? out.slice(0, -1) : out
}

describe('wxs 内联抽取（extractInlineWxsForPipeline）', () => {
  it('formatWxsEnabled=false：不抽取', () => {
    const src = '<wxs module="m">var a=1</wxs>'
    const { source, blocks } = extractInlineWxsForPipeline(src, { formatWxsEnabled: false })
    expect(blocks).toHaveLength(0)
    expect(source).toBe(src)
  })

  it('无 src 且有非空白正文：替换为占位注释并记录 rawInner', () => {
    const src = '<wxs module="m">var a=1</wxs>'
    const { source, blocks } = extractInlineWxsForPipeline(src)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].id).toBe(0)
    expect(blocks[0].rawInner).toBe('var a=1')
    expect(source).toMatch(/^<wxs module="m"><!--__WXML_WXS_INLINE_\d+_0__--><\/wxs>$/)
    expect(source).not.toContain('var a=1')
  })

  it('存在 src 属性：不抽取（外链 wxs 走整文件排版）', () => {
    const src = '<wxs src="./a.wxs" module="m">var a=1</wxs>'
    const { source, blocks } = extractInlineWxsForPipeline(src)
    expect(blocks).toHaveLength(0)
    expect(source).toBe(src)
  })

  it('属性名 src 大小写不敏感', () => {
    const src = '<wxs SRC="./x" module="m">code</wxs>'
    const { blocks } = extractInlineWxsForPipeline(src)
    expect(blocks).toHaveLength(0)
  })

  it('正文仅空白：不抽取', () => {
    const src = '<wxs module="m">   \n\t  </wxs>'
    const { source, blocks } = extractInlineWxsForPipeline(src)
    expect(blocks).toHaveLength(0)
    expect(source).toBe(src)
  })

  it('多个内联 wxs：按文档顺序分配递增 id，从后往前替换不破坏 offset', () => {
    const src = '<wxs module="a">var a=1</wxs><view /><wxs module="b">var b=2</wxs>'
    const { source, blocks } = extractInlineWxsForPipeline(src)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].rawInner.trim()).toBe('var a=1')
    expect(blocks[1].rawInner.trim()).toBe('var b=2')
    expect(source).toMatch(/__WXML_WXS_INLINE_\d+_0__/)
    expect(source).toMatch(/__WXML_WXS_INLINE_\d+_1__/)
    expect(source).not.toMatch(/var [ab]=[12]/)
  })

  it('源码已含占位符文本时：自动换盐值避免碰撞', () => {
    const existing = '<!--__WXML_WXS_INLINE_0_0__-->'
    const src = `<view>${existing}</view><wxs module="m">var a=1</wxs>`
    const { source, blocks } = extractInlineWxsForPipeline(src)
    expect(blocks).toHaveLength(1)
    expect(source).toContain(existing)
    expect(blocks[0].placeholder).not.toBe(existing)
    expect(blocks[0].placeholder).toMatch(/__WXML_WXS_INLINE_\d+_0__/)
    expect(source).toContain(blocks[0].placeholder)
  })

  it('HTML 解析致命错误：原样返回且 blocks 为空', () => {
    const bad = '<view attr'
    const { source, blocks } = extractInlineWxsForPipeline(bad)
    expect(blocks).toHaveLength(0)
    expect(source).toBe(bad)
  })
})

describe('wxs 内联合并（mergeFormattedWxsInlineBlocks）', () => {
  it('babel 成功：写回格式化正文', async () => {
    const raw = 'var  x=1\nmodule.exports={x}'
    const { source, blocks } = extractInlineWxsForPipeline(`<wxs module="m">${raw}</wxs>`)
    expect(blocks).toHaveLength(1)
    const onWarn = vi.fn()
    const out = await mergeFormattedWxsInlineBlocks({
      source,
      blocks,
      prettierOptions: base,
      onWarn,
    })
    expect(onWarn).not.toHaveBeenCalled()
    expect(out).toContain('var x = 1')
    expect(out).toContain('module.exports')
    expect(out).not.toContain('__WXML_WXS_INLINE_')
  })

  it('babel 失败：保留原文并告警，不套缩进', async () => {
    const raw = 'this is <<< not js'
    const { source, blocks } = extractInlineWxsForPipeline(`<wxs module="m">${raw}</wxs>`)
    const onWarn = vi.fn()
    const out = await mergeFormattedWxsInlineBlocks({
      source,
      blocks,
      prettierOptions: base,
      onWarn,
    })
    expect(onWarn).toHaveBeenCalledWith('wxs-inline-format-failed: block 0')
    expect(out).toContain('this is <<< not js')
  })

  it('占位符丢失：告警且其余仍替换', async () => {
    const { blocks } = extractInlineWxsForPipeline('<wxs module="m">var a=1</wxs>')
    const onWarn = vi.fn()
    const out = await mergeFormattedWxsInlineBlocks({
      source: '<wxs module="m"></wxs>',
      blocks,
      prettierOptions: base,
      onWarn,
    })
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining('wxs-inline-placeholder-missing'))
    expect(out).toBe('<wxs module="m"></wxs>')
  })

  it('源码含同名样式占位文本时：只替换真实占位符', async () => {
    const existing = '<!--__WXML_WXS_INLINE_0_0__-->'
    const src = `<view>${existing}</view><wxs module="m">var a=1</wxs>`
    const { source, blocks } = extractInlineWxsForPipeline(src)
    const onWarn = vi.fn()
    const out = await mergeFormattedWxsInlineBlocks({
      source,
      blocks,
      prettierOptions: base,
      onWarn,
    })
    expect(onWarn).not.toHaveBeenCalledWith(
      expect.stringContaining('wxs-inline-placeholder-missing')
    )
    expect(out).toContain(existing)
    expect(out).toContain('var a = 1')
  })

  it('blocks 为空：原样返回', async () => {
    const onWarn = vi.fn()
    const out = await mergeFormattedWxsInlineBlocks({
      source: '<view />',
      blocks: [],
      prettierOptions: base,
      onWarn,
    })
    expect(out).toBe('<view />')
    expect(onWarn).not.toHaveBeenCalled()
  })
})

describe('normalizeWxsBlocksLayout（与 script 类似的起止行）', () => {
  it('单行内联 wxs：展开为起止标签各占一行', () => {
    const src = '<wxs module="m">var a=1</wxs>'
    const out = normalizeWxsBlocksLayout(src, base)
    expect(out).toBe('<wxs module="m">\n  var a=1\n</wxs>')
  })
})

describe('collectMustacheRegions：wxs 子树', () => {
  it('wxs 正文内的 {{ 不收集为 WXML 插值', () => {
    const src = '<wxs module="m">{{ notWxml }}</wxs><view>{{ a + 1 }}</view>'
    const regions = collectMustacheRegions(src)
    expect(regions).toHaveLength(1)
    const slice = src.slice(regions[0].start, regions[0].end)
    expect(slice).toContain('a + 1')
  })

  it('wxs 标签上的属性插值仍收集', () => {
    const src = '<wxs module="{{ name }}">var x=1</wxs>'
    const regions = collectMustacheRegions(src)
    expect(regions.some(r => src.slice(r.start, r.end).includes('name'))).toBe(true)
  })
})

describe('wxs 端到端（Prettier wxml）', () => {
  it('同文件外链 wxs + 内联 wxs + 外部 mustache', async () => {
    const src =
      '<wxs src="./tools.wxs" module="tools" />\n<view>{{tools.msg}}</view>\n<wxs module="m">var x=1\nmodule.exports={x}</wxs>'
    const out = await formatWxmlSample(src)
    expect(out).toContain('<wxs src="./tools.wxs" module="tools" />')
    expect(out).toContain('{{ tools.msg }}')
    expect(out).toMatch(/var x = 1/)
    expect(out).toContain('module.exports')
    expect(out).toMatch(
      /<wxs module="m">\n {2}var x = 1\n {2}module\.exports = \{ x(: x)? \}\n<\/wxs>/
    )
  })

  it('内联 wxs 与 view 混排：连续格式化幂等', async () => {
    const src = '<view>{{a+b}}</view>\n<wxs module="m">var y=2</wxs>'
    const once = await formatWxmlSample(src)
    const twice = await formatWxmlSample(once)
    expect(twice).toBe(once)
    expect(once).toContain('{{ a + b }}')
    expect(once).toMatch(/var y = 2/)
  })

  it('wxs-inline-format-failed：wxmlReportLevel=warn 时输出告警', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const src = '<wxs module="m">var x = )(</wxs>'
    await prettier.format(src, {
      ...base,
      parser: 'wxml',
      plugins: [plugin],
      filepath: 'bad-wxs.wxml',
      wxmlFormat: true,
      wxmlReportLevel: 'warn',
    })
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls.join('\n'))).toContain('wxs-inline-format-failed')
    warn.mockRestore()
  })
})

/**
 * 用例形态来自微信文档「WXS 语法参考」子页及框架 WXS 概述页，用于覆盖内联 wxs + babel 排版。
 * @see https://developers.weixin.qq.com/miniprogram/dev/reference/wxs/01wxs-module.html
 * @see https://developers.weixin.qq.com/miniprogram/dev/reference/wxs/02variate.html
 * @see https://developers.weixin.qq.com/miniprogram/dev/reference/wxs/05statement.html
 * @see https://developers.weixin.qq.com/miniprogram/dev/reference/wxs/06datatype.html
 * @see https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxs/
 */
describe('官方 WXS 文档衍生（语法参考 / 框架示例）', () => {
  it('01 WXS 模块：内联 module="foo" 与 module.exports 对象（文档 01wxs-module）', async () => {
    const src = `<wxs module="foo">
var some_msg = "hello world";
module.exports = {
  msg : some_msg,
}
</wxs>
<view> {{foo.msg}} </view>`
    const out = await formatWxmlSample(src)
    expect(out).toContain('module.exports')
    expect(out).toMatch(/some_msg/)
    expect(out).toContain('{{ foo.msg }}')
    expect(out).toMatch(/\bvar\b/)
    expect(out).not.toMatch(/\blet\b|\bconst\b/)
  })

  it('01 WXS 模块：FOO/bar 与追加 module.exports.msg（文档 01wxs-module · tools 示例）', async () => {
    const src = `<wxs module="tools">
var foo = "'hello world' from tools.wxs";
var bar = function (d) {
  return d;
}
module.exports = {
  FOO: foo,
  bar: bar,
};
module.exports.msg = "some msg";
</wxs>
<view>{{ tools.msg }}</view>`
    const out = await formatWxmlSample(src)
    expect(out).toContain('module.exports.msg')
    expect(out).toContain('FOO')
    expect(out).toContain('{{ tools.msg }}')
  })

  it('01 WXS 模块：require 相对路径（文档 01wxs-module）', async () => {
    const src = `<wxs module="logic">
var tools = require("./tools.wxs");
console.log(tools.FOO);
</wxs>`
    const out = await formatWxmlSample(src)
    expect(out).toMatch(/require\(['"]\.\/tools\.wxs['"]\)/)
    expect(out).toContain('tools.FOO')
  })

  it('02 变量：多段 var 与仅声明（文档 02variate）', async () => {
    const src = `<wxs module="v">
var foo = 1;
var bar = "hello world";
var i;
</wxs>`
    const out = await formatWxmlSample(src)
    expect(out).toMatch(/var foo\b/)
    expect(out).toMatch(/var bar\b/)
    expect(out).toMatch(/var i\b/)
    expect(out).not.toMatch(/\blet\b|\bconst\b/)
  })

  it('05 语句：switch 与 for（文档 05statement）', async () => {
    const srcSwitch = `<wxs module="s">
var exp = 10;
switch ( exp ) {
case "10":
  console.log("string 10");
  break;
case 10:
  console.log("number 10");
  break;
case exp:
  console.log("var exp");
  break;
default:
  console.log("default");
}
</wxs>`
    const srcFor = `<wxs module="f">
for (var i = 0; i < 3; ++i) {
  console.log(i);
  if( i >= 1) break;
}
</wxs>`
    const outS = await formatWxmlSample(srcSwitch)
    const outF = await formatWxmlSample(srcFor)
    expect(outS).toContain('switch')
    expect(outS).toContain('case 10')
    expect(outF).toContain('for (var i = 0;')
    expect(outF).toContain('break')
  })

  it('06 数据类型：getDate 与 getRegExp（文档 06datatype）', async () => {
    const src = `<wxs module="d">
var date = getDate();
var a = getRegExp("x", "img");
console.log("x" === a.source);
</wxs>`
    const out = await formatWxmlSample(src)
    expect(out).toContain('getDate(')
    expect(out).toContain('getRegExp(')
    expect(out).toContain('a.source')
  })

  it('框架文档：getMax(array) 数据处理（developers · framework/view/wxs）', async () => {
    const src = `<wxs module="m1">
var getMax = function(array) {
  var max = undefined;
  for (var i = 0; i < array.length; ++i) {
    max = max === undefined ?
      array[i] :
      (max >= array[i] ? max : array[i]);
  }
  return max;
}
module.exports.getMax = getMax;
</wxs>
<view>{{ m1.getMax(array) }}</view>`
    const out = await formatWxmlSample(src)
    expect(out).toContain('getMax')
    expect(out).toContain('array.length')
    expect(out).toContain('{{ m1.getMax(array) }}')
  })

  it('文档混排：内联 wxs 仅 {{foo.msg}} 时 mustache 仍被收集', () => {
    const src = `<wxs module="foo">
var some_msg = "hello world";
module.exports = { msg: some_msg };
</wxs>
<view> {{foo.msg}} </view>`
    const regions = collectMustacheRegions(src)
    expect(regions).toHaveLength(1)
    expect(src.slice(regions[0].start, regions[0].end)).toContain('foo.msg')
  })
})
