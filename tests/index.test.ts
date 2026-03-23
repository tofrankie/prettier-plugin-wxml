import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import baseOptions from '@tofrankie/prettier'
import * as prettier from 'prettier'
import { describe, expect, it, vi } from 'vitest'
import plugin from '../src/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function format(
  source: string,
  opts: { filepath?: string; wxmlThrowOnError?: boolean; wxmlReportLevel?: 'silent' | 'warn' } = {}
) {
  return prettier.format(source, {
    ...baseOptions,
    parser: 'wxml',
    plugins: [plugin],
    filepath: opts.filepath ?? 'test.wxml',
    ...(opts.wxmlThrowOnError !== undefined && { wxmlThrowOnError: opts.wxmlThrowOnError }),
    ...(opts.wxmlReportLevel !== undefined && { wxmlReportLevel: opts.wxmlReportLevel }),
  })
}

describe('prettier-plugin-wxml', () => {
  it('fixture/index 输入与 output.wxml 一致', async () => {
    const base = join(__dirname, 'fixtures/index')
    const input = await readFile(join(base, 'input.wxml'), 'utf8')
    const expected = await readFile(join(base, 'output.wxml'), 'utf8')
    const out = await format(input, { filepath: 'index.wxml' })
    expect(out).toBe(expected)
  })

  it('幂等：连续格式化结果不变', async () => {
    const a = '<view>{{a+1}}{{b}}</view>'
    const once = await format(a)
    const twice = await format(once)
    expect(twice).toBe(once)
  })

  it('混合文本', async () => {
    expect(await format('hello {{name}} !')).toMatchInlineSnapshot('"hello {{ name }} !"')
  })

  it('同一行多个插值', async () => {
    expect(await format('{{a}}{{b}}')).toMatchInlineSnapshot('"{{ a }}{{ b }}"')
  })

  it('左右多空格归一为单空格', async () => {
    expect(await format('{{   a+b   }}')).toBe('{{ a + b }}')
  })

  it('文本节点内多个插值与字面量相间', async () => {
    expect(await format('<text>a{{x}}b{{y}}c</text>')).toBe('<text>a{{ x }}b{{ y }}c</text>')
  })

  it('一行 HTML 多个属性各自含插值', async () => {
    expect(await format('<view wx:if="{{a}}" hidden="{{b}}">t</view>')).toBe(
      '<view wx:if="{{ a }}" hidden="{{ b }}">t</view>'
    )
  })

  it('同一属性值内多个插值', async () => {
    expect(await format('<view data="{{a}}{{b}}"></view>')).toBe(
      '<view data="{{ a }}{{ b }}"></view>'
    )
  })

  it('同一属性值内多个插值（长度 > 150）', async () => {
    const source =
      '<view data-long="prefix-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-abcdefghijklmnopqrstuvwxyz-{{firstValue+1}}-MID-{{secondValue&&thirdValue}}-TAIL-{{ user.profile?.nickname }}-suffix-END"></view>'
    const out = await format(source)
    expect(source.length).toBeGreaterThan(150)
    expect(out).toContain('{{ firstValue + 1 }}')
    expect(out).toContain('{{ secondValue && thirdValue }}')
    expect(out).toContain('{{ user.profile?.nickname }}')
    expect(out).toContain(
      'prefix-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-abcdefghijklmnopqrstuvwxyz-'
    )
  })

  it('算术与比较', async () => {
    expect(await format('{{a+b*c-d/e%3}}')).toMatchInlineSnapshot(
      '"{{ a + b * c - ((d / e) % 3) }}"'
    )
    expect(await format('{{a===b&&c||d}}')).toMatchInlineSnapshot('"{{ (a === b && c) || d }}"')
  })

  it('一元与括号', async () => {
    expect(await format('{{!flag}}')).toMatchInlineSnapshot('"{{ !flag }}"')
    expect(await format('{{(a+b)*c}}')).toMatchInlineSnapshot('"{{ (a + b) * c }}"')
  })

  it('三元', async () => {
    expect(await format('{{cond?a:b}}')).toMatchInlineSnapshot('"{{ cond ? a : b }}"')
  })

  it('可选链', async () => {
    expect(await format('{{user.info?.name}}')).toMatchInlineSnapshot('"{{ user.info?.name }}"')
  })

  it('wx:for 数组字面量', async () => {
    expect(await format('<view wx:for="{{[1,2,3]}}"></view>')).toMatchInlineSnapshot(
      '"<view wx:for="{{ [1, 2, 3] }}"></view>"'
    )
  })

  it('WXML 对象写法 a:1,b:2：用 {} 包一层按对象格式化后去壳（非 {{ { } }}）', async () => {
    expect(await format('{{a:1,b:2}}')).toBe('{{ a: 1, b: 2 }}')
  })

  it('函数与箭头函数', async () => {
    expect(await format('{{fn(a,b)}}')).toMatchInlineSnapshot('"{{ fn(a, b) }}"')
    expect(await format('{{list.map(x=>x+1)}}')).toMatchInlineSnapshot(
      '"{{ list.map(x => x + 1) }}"'
    )
  })

  it('已规范输入保持稳定', async () => {
    const s = '{{ user.name }}'
    expect(await format(s)).toBe(s)
  })

  it('字符串内 }} 不误截断', async () => {
    const s = '{{ "a}}" }}'
    expect(await format(s)).toMatchInlineSnapshot(`
      "{{ 'a}}' }}"
    `)
  })

  it('字符串内 {{', async () => {
    const s = `{{ '{{x}}' }}`
    expect(await format(s)).toMatchInlineSnapshot('"{{ \'{{x}}\' }}"')
  })

  it('注释内插值不处理', async () => {
    const s = '<!-- {{count+1}} --><view>{{a}}</view>'
    expect(await format(s)).toMatchInlineSnapshot(`
      "<!-- {{count+1}} --><view>{{ a }}</view>"
    `)
  })

  it('非法表达式原样', async () => {
    const s = '{{foo+}}'
    expect(await format(s)).toBe(s)
  })

  it('非法表达式（已是正常空格）原样', async () => {
    const s = '{{ foo+ }}'
    expect(await format(s)).toBe(s)
  })

  it('语句类输入原样', async () => {
    expect(await format('{{ if (a) b }}')).toBe('{{ if (a) b }}')
    expect(await format('{{ return a }}')).toBe('{{ return a }}')
  })

  it('WXML 解析失败整文件原样', async () => {
    const bad = '<view attr'
    expect(await format(bad)).toBe(bad)
  })

  it('属性值中 }} 与引号间空格保留', async () => {
    const s = '<view wx:for="{{[1,2,3]}} "></view>'
    const out = await format(s)
    expect(out).toContain('}} "')
    expect(out).toMatch(/wx:for="\{\{.*\}\} "/)
  })

  it('属性外层双引号时，内层字符串保持/倾向单引号', async () => {
    const s = '<view data-str="{{ \'a\' }}"></view>'
    expect(await format(s)).toBe('<view data-str="{{ \'a\' }}"></view>')
  })

  it('属性外层单引号时，内层字符串优先双引号', async () => {
    const s = '<view data-str=\'{{ "a" }}\'></view>'
    expect(await format(s)).toBe('<view data-str=\'{{ "a" }}\'></view>')
  })

  it('throwOnError：解析失败时抛出', async () => {
    const bad = '<view attr'
    await expect(
      prettier.format(bad, {
        parser: 'wxml',
        plugins: [plugin],
        filepath: 'bad.wxml',
        wxmlThrowOnError: true,
      })
    ).rejects.toThrow()
  })

  it('throwOnError：非法表达式抛出', async () => {
    await expect(
      prettier.format('{{foo+}}', {
        parser: 'wxml',
        plugins: [plugin],
        filepath: 'bad.wxml',
        wxmlThrowOnError: true,
      })
    ).rejects.toThrow()
  })

  it('wxmlReportLevel=warn：解析失败输出 warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bad = '<view attr'
    await format(bad, { filepath: 'bad.wxml', wxmlReportLevel: 'warn' })
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('skipped')
    expect(String(warn.mock.calls[0]?.[0])).toContain('bad.wxml')
    warn.mockRestore()
  })

  it('wxmlReportLevel=warn：部分插值失败计数', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await format('{{a}}{{foo+}}', { filepath: 'p.wxml', wxmlReportLevel: 'warn' })
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('partial')
    expect(String(warn.mock.calls[0]?.[0])).toContain('x1')
    warn.mockRestore()
  })

  it('wxmlReportLevel=warn：非法表达式与语句类插值都会计入失败数', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const source = `
<text>{{foo+}}</text>
<view data-bad="{{foo+}}"></view>
<text>{{ if (a) b }}</text>
<text>{{ return a }}</text>
<view data-stmt-if="{{ if (a) b }}"></view>
<view data-stmt-ret="{{ return a }}"></view>
`.trim()
    await format(source, { filepath: 'warn-invalid.wxml', wxmlReportLevel: 'warn' })
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('partial')
    expect(String(warn.mock.calls[0]?.[0])).toContain('warn-invalid.wxml')
    expect(String(warn.mock.calls[0]?.[0])).toContain('x6')
    warn.mockRestore()
  })

  it('默认 silent 不输出 warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await format('<view attr')
    await format('{{bad+}}')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('template data 简写：能解析则按 JS 格式化', async () => {
    const s = '<template is="x" data="{{foo, bar}}"></template>'
    const out = await format(s)
    expect(out).toContain('data=')
  })
})
