import type { Options } from 'prettier'
import baseOptions from '@tofrankie/prettier'
import * as prettier from 'prettier'
import { describe, expect, it, vi } from 'vitest'
import { runCollapseAttrsValue } from '../src/format/collapse-attrs-value'
import { runMustache } from '../src/format/mustache'
import { buildVueFormatOptions, runVueFormat } from '../src/format/vue-format'
import { extractInlineWxs } from '../src/format/wxs-inline'
import { selfCloseTags } from '../src/self-close-tags'
import { formatOptionsToStages, runFormatStages, runFullWxmlFormat } from './helpers/pipeline-test-kit'

const base = baseOptions as Options

describe('WXML 格式化流程', () => {
  describe('单阶段', () => {
    describe('extractInlineWxs', () => {
      it('HTML fatal 且 throwOnFatalHtmlParse=true 时抛出', () => {
        expect(() => extractInlineWxs('<view attr', { throwOnFatalHtmlParse: true })).toThrow(/wxml-html-parse-failed/)
      })

      it('extract 容错后 selfClose 严格仍会因 HTML fatal 抛错', () => {
        const { source } = extractInlineWxs('<view attr')
        expect(() => selfCloseTags(source, new Set(), true)).toThrow(/wxml-html-parse-failed/)
      })
    })

    describe('selfClose', () => {
      it('空标签可转为自闭合', async () => {
        const out = await runFormatStages({
          source: '<view></view>',
          stages: ['selfClose'],
          prettierOptions: base,
        })
        expect(out).toBe('<view />')
      })
    })

    describe('vueFormat', () => {
      it('buildVueFormatOptions：沿用 Prettier 配置并固定 vue parser', () => {
        const merged = buildVueFormatOptions({
          ...base,
          printWidth: 80,
          singleAttributePerLine: true,
        } as Options)
        expect(merged.parser).toBe('vue')
        expect(merged.plugins).toEqual([])
        expect(merged.printWidth).toBe(80)
        expect(merged.singleAttributePerLine).toBe(true)
      })

      it('buildVueFormatOptions：organize 开启时挂入 organize 插件', () => {
        const merged = buildVueFormatOptions(base, true)
        expect(merged.parser).toBe('vue')
        expect(merged.plugins).toHaveLength(1)
      })

      it('runVueFormat：合法模板与直接 prettier.format(vue) 一致', async () => {
        const src = '<view><text>x</text></view>'
        const expected = await prettier.format(src, buildVueFormatOptions(base))
        const out = await runVueFormat({
          source: src,
          prettierOptions: base,
          throwOnError: false,
          onWarn: () => {},
        })
        expect(out).toBe(expected)
      })

      it('runVueFormat：organize 开启时与带插件的 prettier.format(vue) 一致', async () => {
        const src = '<view id="i" class="c"></view>'
        const opts = {
          ...buildVueFormatOptions({ ...base, attributeSort: 'ASC' } as Options, true),
        }
        const expected = await prettier.format(src, opts)
        const out = await runVueFormat({
          source: src,
          prettierOptions: { ...base, attributeSort: 'ASC' } as Options,
          organizeAttributesEnabled: true,
          throwOnError: false,
          onWarn: () => {},
        })
        expect(out).toBe(expected)
      })

      it('runVueFormat：非法模板且 throwOnError=false 时回退原串并告警', async () => {
        const bad = '<view attr'
        const onWarn = vi.fn()
        const out = await runVueFormat({
          source: bad,
          prettierOptions: base,
          throwOnError: false,
          onWarn,
        })
        expect(out).toBe(bad)
        expect(onWarn).toHaveBeenCalledTimes(1)
        expect(String(onWarn.mock.calls[0]?.[0])).toContain('wxml-format-failed')
      })

      it('runVueFormat：非法模板且 throwOnError=true 时抛出', async () => {
        const bad = '<view attr'
        const onWarn = vi.fn()
        await expect(
          runVueFormat({
            source: bad,
            prettierOptions: base,
            throwOnError: true,
            onWarn,
          })
        ).rejects.toThrow()
        expect(onWarn).not.toHaveBeenCalled()
      })
    })

    describe('mustache', () => {
      it('格式化插值表达式', async () => {
        const out = await runMustache({
          source: '{{a+b}}',
          prettierOptions: base,
          throwOnError: false,
          onWarn: () => {},
        })
        expect(out).toBe('{{ a + b }}')
      })

      it('收集失败且 throwOnError=false 时回退并告警', async () => {
        const bad = '<view attr'
        const onWarn = vi.fn()
        const out = await runMustache({
          source: bad,
          prettierOptions: base,
          throwOnError: false,
          onWarn,
        })
        expect(out).toBe(bad)
        expect(onWarn).toHaveBeenCalled()
        expect(String(onWarn.mock.calls[0]?.[0])).toContain('mustache-collect-failed')
      })
    })

    describe('collapseAttrsValue', () => {
      it('任意属性名：跨行双引号值折叠并 trim 首尾空白', () => {
        const src = '<view foo="\n  bar\n  baz\n"></view>'
        expect(runCollapseAttrsValue(src)).toBe('<view foo="bar baz"></view>')
      })

      it('单引号同理', () => {
        const src = "<view x='\n  a\n'></view>"
        expect(runCollapseAttrsValue(src)).toBe("<view x='a'></view>")
      })

      it('style 内含 {{}} 不破坏插值', async () => {
        const afterMustache = await runMustache({
          source: '<view style="\n  color: {{c}}\n"></view>',
          prettierOptions: base,
          throwOnError: false,
          onWarn: () => {},
        })
        expect(runCollapseAttrsValue(afterMustache)).toBe('<view style="color: {{ c }}"></view>')
      })

      it('style 折叠后去掉引号内末尾分号', () => {
        const src = '<view style="\n  color: red;\n  width: 1px;\n"></view>'
        expect(runCollapseAttrsValue(src)).toBe('<view style="color: red; width: 1px"></view>')
      })

      it('解析失败时原样返回', () => {
        const bad = '<view attr'
        expect(runCollapseAttrsValue(bad)).toBe(bad)
      })

      it('解析失败且 throwOnFatalHtmlParse=true 时抛出', () => {
        const bad = '<view attr'
        expect(() => runCollapseAttrsValue(bad, true)).toThrow(/wxml-html-parse-failed/)
      })
    })
  })

  describe('阶段组合（runFormatStages）', () => {
    it('仅 mustache：等价于全局 wxmlFormat=false、wxmlSelfClose=false', async () => {
      const out = await runFormatStages({
        source: '<view>{{a+b}}</view>',
        stages: ['mustache'],
        prettierOptions: base,
      })
      expect(out).toBe('<view>{{ a + b }}</view>')
    })

    it('vueFormat + mustache：可关闭跨行属性折叠', async () => {
      const src = '<view data-x="\n  a\n"></view>'
      const collapsed = await runFormatStages({
        source: src,
        stages: ['vueFormat', 'mustache'],
        prettierOptions: base,
      })
      expect(collapsed).toMatch(/data-x="a"/)
      expect(collapsed).not.toMatch(/data-x="\s*\n/)
      const raw = await runFormatStages({
        source: src,
        stages: ['vueFormat', 'mustache'],
        prettierOptions: base,
        collapseAttrsValueEnabled: false,
      })
      expect(raw).toMatch(/\n\s*a/)
    })

    it('selfClose + mustache：先自闭合再插值', async () => {
      const out = await runFormatStages({
        source: '<view></view><text>{{a+b}}</text>',
        stages: ['selfClose', 'mustache'],
        prettierOptions: base,
      })
      expect(out).toBe('<view /><text>{{ a + b }}</text>')
    })

    it('vueFormat + mustache：先整文件排版再插值', async () => {
      const out = await runFormatStages({
        source: '<view>\n<text>{{a+b}}</text>\n</view>',
        stages: ['vueFormat', 'mustache'],
        prettierOptions: base,
      })
      expect(out).toBe('<view>\n  <text>{{ a + b }}</text>\n</view>\n')
    })

    it('selfClose + vueFormat + mustache：全阶段串联', async () => {
      const out = await runFormatStages({
        source: '<view>\n<text></text>\n</view>',
        stages: ['selfClose', 'vueFormat', 'mustache'],
        prettierOptions: base,
      })
      expect(out).toBe('<view>\n  <text />\n</view>\n')
    })

    it('selfClose + vueFormat（无 mustache）：不跑插件 mustache 阶段', async () => {
      const raw = '<view><text>{{a+b}}</text></view>'
      const out = await runFormatStages({
        source: raw,
        stages: ['selfClose', 'vueFormat'],
        prettierOptions: base,
      })
      expect(out).toContain('<text>')
      // 未走 runMustache；Vue 内层 printer 仍可能对 {{ }} 加空格，与插件插值阶段无关
      expect(out).toMatch(/\{\{[^a}]*a[^+}]*\+[^b}]*b[^}]*\}\}/)
    })

    it('formatOptionsToStages 与插件开关对应', () => {
      expect(
        formatOptionsToStages({
          selfCloseEnabled: false,
          formatEnabled: false,
        })
      ).toEqual(['mustache'])
      expect(
        formatOptionsToStages({
          selfCloseEnabled: true,
          formatEnabled: true,
        })
      ).toEqual(['selfClose', 'vueFormat', 'mustache'])
    })
  })

  describe('完整格式化（runFullWxmlFormat / formatWxml）', () => {
    it('与 runFormatStages 三阶段全开结果一致', async () => {
      const source = '<view></view><text>{{x+y}}</text>'
      const onWarn = vi.fn()
      const common = {
        source,
        prettierOptions: base,
        selfCloseExclude: undefined as string[] | undefined,
        throwOnError: false,
        onWarn,
      }
      const a = await runFullWxmlFormat({
        ...common,
        selfCloseEnabled: true,
        formatEnabled: true,
        formatWxsEnabled: true,
      })
      const b = await runFormatStages({
        source,
        stages: ['selfClose', 'vueFormat', 'mustache'],
        prettierOptions: base,
        throwOnError: false,
        onWarn,
      })
      expect(a).toBe(b)
      expect(a).toContain('<view />')
      expect(a).toContain('{{ x + y }}')
    })

    it('organizeAttributesEnabled 时属性按 Vue preset 分组排序', async () => {
      const source = '<view id="i" class="c"></view>'
      const onWarn = vi.fn()
      const out = await runFullWxmlFormat({
        source,
        prettierOptions: { ...base, attributeSort: 'ASC' } as Options,
        selfCloseEnabled: false,
        formatEnabled: true,
        formatWxsEnabled: true,
        organizeAttributesEnabled: true,
        throwOnError: false,
        onWarn,
      })
      expect(out.trim()).toBe('<view class="c" id="i"></view>')
    })
  })
})
