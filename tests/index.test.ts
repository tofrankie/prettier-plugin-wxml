import type { WxmlPluginOptions } from '../src/plugin-options'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import baseOptions from '@tofrankie/prettier'
import * as prettier from 'prettier'
import { describe, expect, it, vi } from 'vitest'
import plugin from '../src/index'
import { resolveSelfCloseExcludeSet, selfCloseTags } from '../src/self-close-tags'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_ROOT = join(__dirname, 'fixtures')

type FormatOptions = Pick<
  WxmlPluginOptions,
  | 'filepath'
  | 'wxmlThrowOnError'
  | 'wxmlReportLevel'
  | 'wxmlFormat'
  | 'wxmlFormatWxs'
  | 'wxmlFormatOnError'
  | 'wxmlSelfClose'
  | 'wxmlSelfCloseExclude'
>

function getFixtureCaseDirs(): string[] {
  const out: string[] = []
  const stack = [FIXTURES_ROOT]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    const entries = readdirSync(current, { withFileTypes: true })
    const hasInput = entries.some(e => e.isFile() && e.name === 'input.wxml')
    const hasOutput = entries.some(e => e.isFile() && e.name === 'output.wxml')
    if (hasInput && hasOutput) {
      out.push(current)
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory()) stack.push(join(current, entry.name))
    }
  }
  return out.sort((a, b) => a.localeCompare(b))
}

async function formatRaw(source: string, opts: FormatOptions = {}) {
  return prettier.format(source, {
    ...baseOptions,
    parser: 'wxml',
    plugins: [plugin],
    filepath: opts.filepath ?? 'test.wxml',
    ...(opts.wxmlThrowOnError !== undefined && { wxmlThrowOnError: opts.wxmlThrowOnError }),
    ...(opts.wxmlReportLevel !== undefined && { wxmlReportLevel: opts.wxmlReportLevel }),
    ...(opts.wxmlFormat !== undefined && { wxmlFormat: opts.wxmlFormat }),
    ...(opts.wxmlFormatWxs !== undefined && { wxmlFormatWxs: opts.wxmlFormatWxs }),
    ...(opts.wxmlFormatOnError !== undefined && { wxmlFormatOnError: opts.wxmlFormatOnError }),
    ...(opts.wxmlSelfClose !== undefined && {
      wxmlSelfClose: opts.wxmlSelfClose,
    }),
    ...(opts.wxmlSelfCloseExclude !== undefined && {
      wxmlSelfCloseExclude: opts.wxmlSelfCloseExclude,
    }),
  })
}

async function format(source: string, opts: FormatOptions = {}) {
  const out = await formatRaw(source, opts)
  return trimSingleEofNewline(out)
}

function trimSingleEofNewline(text: string): string {
  return text.endsWith('\n') ? text.slice(0, -1) : text
}

describe('prettier-plugin-wxml', () => {
  it('fixtures 输入与 output.wxml 一致', async () => {
    const cases = getFixtureCaseDirs()
    for (const base of cases) {
      const input = await readFile(join(base, 'input.wxml'), 'utf8')
      const expected = await readFile(join(base, 'output.wxml'), 'utf8')
      let fixtureOptions: FormatOptions = {}
      try {
        fixtureOptions = JSON.parse(
          await readFile(join(base, 'options.json'), 'utf8')
        ) as FormatOptions
      } catch {
        // ignore missing options.json
      }
      const caseName = base.replace(`${FIXTURES_ROOT}/`, '')
      const out = await formatRaw(input, {
        filepath: `${caseName}.wxml`,
        ...fixtureOptions,
      })
      expect(out).toBe(expected)
    }
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
    expect(await format('<view data="{{a}}{{b}}"></view>')).toBe('<view data="{{ a }}{{ b }}" />')
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
      '"<view wx:for="{{ [1, 2, 3] }}" />"'
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
      "<!-- {{count+1}} -->
      <view>{{ a }}</view>"
    `)
  })

  it('prettier-ignore：文件入口注释仅忽略下一个节点', async () => {
    const s = '<!-- prettier-ignore --><view>{{a+b}}</view><view>{{c+d}}</view>'
    expect(await format(s, { wxmlFormat: false })).toBe(
      '<!-- prettier-ignore --><view>{{a+b}}</view><view>{{ c + d }}</view>'
    )
  })

  it('prettier-ignore：某一行注释仅忽略下一个节点', async () => {
    const s = '<view>{{a+b}}</view><!-- prettier-ignore --><view>{{c+d}}</view><view>{{e+f}}</view>'
    expect(await format(s, { wxmlFormat: false })).toBe(
      '<view>{{ a + b }}</view><!-- prettier-ignore --><view>{{c+d}}</view><view>{{ e + f }}</view>'
    )
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
    expect(await format(s)).toBe('<view data-str="{{ \'a\' }}" />')
  })

  it('属性外层单引号时，内层字符串优先双引号', async () => {
    const s = '<view data-str=\'{{ "a" }}\'></view>'
    expect(await format(s)).toBe('<view data-str=\'{{ "a" }}\' />')
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
    ).rejects.toThrow(/mustache at 1:3/)
  })

  it('wxmlReportLevel=warn：解析失败输出 warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bad = '<view attr'
    await format(bad, { filepath: 'bad.wxml', wxmlReportLevel: 'warn' })
    expect(warn).toHaveBeenCalled()
    const combined = warn.mock.calls.map(c => String(c[0])).join('\n')
    expect(combined).toContain('wxml-format-failed')
    expect(combined).toContain('mustache-collect-failed')
    expect(combined).toContain('bad.wxml')
    warn.mockRestore()
  })

  it('wxmlReportLevel=warn：部分插值失败计数', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await format('{{a}}{{foo+}}', { filepath: 'p.wxml', wxmlReportLevel: 'warn' })
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('expression-format-failed')
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
    expect(String(warn.mock.calls[0]?.[0])).toContain('expression-format-failed')
    expect(String(warn.mock.calls[0]?.[0])).toContain('warn-invalid.wxml')
    expect(String(warn.mock.calls[0]?.[0])).toContain('x6')
    warn.mockRestore()
  })

  it('默认 silent 不输出 warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await format('<view attr', { filepath: 'silent-bad.wxml' })
    await format('{{bad+}}', { filepath: 'silent-expr.wxml' })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('template data 简写：能解析则按 JS 格式化', async () => {
    const s = '<template is="x" data="{{foo, bar}}"></template>'
    const out = await format(s)
    expect(out).toContain('data=')
  })

  it('wxmlSelfClose：默认可 selfClose（含 view 与自定义组件）', async () => {
    const source = '<view></view><my-card></my-card><text> x </text>'
    const out = await format(source, {
      wxmlSelfClose: true,
    })
    expect(out).toBe('<view />\n<my-card />\n<text> x </text>')
  })

  it('wxmlSelfCloseExclude：可排除不做 selfClose 的标签', async () => {
    const source = '<view></view><my-card></my-card>'
    const out = await format(source, {
      wxmlSelfClose: true,
      wxmlSelfCloseExclude: ['view'],
    })
    expect(out).toBe('<view></view>\n<my-card />')
  })

  it('resolveSelfCloseExcludeSet 支持函数（不经 Prettier 选项，供程序化调用）', () => {
    const src = '<view></view><my-card></my-card>'
    const out = selfCloseTags(
      src,
      resolveSelfCloseExcludeSet(() => ['view'])
    )
    expect(out).toBe('<view></view><my-card />')
  })

  it('wxmlSelfClose：含空白文本/注释/子节点时不做 selfClose', async () => {
    const source = '<view> </view><view><!--x--></view><view><text></text></view>'
    const out = await format(source, {
      wxmlSelfClose: true,
    })
    expect(out).toBe('<view> </view>\n<view><!--x--></view>\n<view><text /></view>')
  })

  it('wxmlFormat：开启后先做整文件 HTML 格式化，再做 mustache', async () => {
    const source = '<view>\n<text>{{a+b}}</text>\n</view>'
    const out = await format(source, { wxmlFormat: true })
    expect(out).toBe('<view>\n<text>{{ a + b }}</text>\n</view>')
  })

  it('singleAttributePerLine=true 时，mustache 仍正确格式化', async () => {
    const source =
      '<view wx:if="{{a+b}}" hidden="{{c+d}}" data-sum="{{x+y}}" data-long="{{foo+bar+baz+qux+quux+corge+grault+garply+waldo+fred+plugh+xyzzy+thud}}">t</view>'
    expect(source.length).toBeGreaterThan(120)
    const out = trimSingleEofNewline(
      await prettier.format(source, {
        ...baseOptions,
        parser: 'wxml',
        plugins: [plugin],
        filepath: 'aggressive-format.wxml',
        wxmlFormat: true,
        wxmlSelfClose: false,
        singleAttributePerLine: true,
        printWidth: 120,
      })
    )
    expect(out).toContain('wx:if="{{ a + b }}"')
    expect(out).toContain('hidden="{{ c + d }}"')
    expect(out).toContain('data-sum="{{ x + y }}"')
    expect(out).toContain('data-long="{{ foo + bar + baz + qux + quux + corge + grault')
  })

  it('wxmlFormat=true 时不应把 mustache 字符串硬换行导致语法损坏', async () => {
    const source =
      "<view>{{item.product.type === 'union_buy_voucher'?'满 '+item.product.threshold+' 减 '+item.product.value:'充值话费直接抵扣'}}</view>"
    await expect(
      prettier.format(source, {
        ...baseOptions,
        parser: 'wxml',
        plugins: [plugin],
        filepath: 'mustache-protect.wxml',
        wxmlFormat: true,
        wxmlThrowOnError: true,
      })
    ).resolves.toContain("item.product.type === 'union_buy_voucher'")
  })

  it('默认使用 Vue parser：支持 Vue 风格模板格式化（含文本节点 mustache）', async () => {
    const source =
      '<view class="notice text-light">{{a?1:2}}</view><view> {{ flag ? "x" : "y" }}</view>'
    const out = await format(source, {
      wxmlFormat: true,
      wxmlSelfClose: false,
    })
    expect(out).toContain('<view class="notice text-light">{{ a ? 1 : 2 }}</view>')
    expect(out).toContain("<view> {{ flag ? 'x' : 'y' }}</view>")
  })

  it('wxmlFormatOnError=warn：formatWxml pass 失败时回退并继续（不抛错）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = await format('<view attr', {
      wxmlFormat: true,
      wxmlFormatOnError: 'warn',
      wxmlReportLevel: 'warn',
      filepath: 'format-fail.wxml',
    })
    expect(out).toBe('<view attr')
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('wxml-format-failed')
    warn.mockRestore()
  })

  it('内联 wxs：正文走 babel 排版且不把 var 改成 let', async () => {
    const src = '<wxs module="m">var a=1\nmodule.exports={a:a}</wxs>'
    const out = await format(src, { wxmlFormat: true })
    expect(out).toMatch(/var a\b/)
    expect(out).not.toMatch(/\blet a\b/)
    expect(out).toContain('module.exports')
  })

  it('wxmlFormatWxs=false：不抽取内联 wxs，正文不经 babel 合并', async () => {
    const src = '<wxs module="m">var x=1\nmodule.exports={x}</wxs>'
    const out = await format(src, { wxmlFormat: false, wxmlFormatWxs: false })
    expect(out).toBe(src)
  })

  it('wxmlFormatOnError=throw：formatWxml pass 失败时直接抛错', async () => {
    await expect(
      prettier.format('<view attr', {
        parser: 'wxml',
        plugins: [plugin],
        filepath: 'format-fail-throw.wxml',
        wxmlFormat: true,
        wxmlFormatOnError: 'throw',
      })
    ).rejects.toThrow()
  })
})
