import type { Options } from 'prettier'
import baseOptions from '@tofrankie/prettier'
import * as prettier from 'prettier'
import { describe, expect, it, vi } from 'vitest'
import { buildWxmlFormatOptions, runFormatWxmlPass } from '../src/pipeline/format-wxml-pass'
import { runMustachePass } from '../src/pipeline/mustache-pass'
import {
  pipelineOptionsToStages,
  runFullWxmlPipeline,
  runPipelineStages,
} from './helpers/pipeline-test-kit'

const base = baseOptions as Options

describe('WXML 流水线', () => {
  describe('单阶段', () => {
    describe('selfClose（self-close-pass）', () => {
      it('空标签可转为自闭合', async () => {
        const out = await runPipelineStages({
          source: '<view></view>',
          stages: ['selfClose'],
          prettierOptions: base,
        })
        expect(out).toBe('<view />')
      })
    })

    describe('formatWxml（format-wxml-pass）', () => {
      it('buildWxmlFormatOptions：沿用 Prettier 配置并固定 vue parser', () => {
        const merged = buildWxmlFormatOptions({
          ...base,
          printWidth: 80,
          singleAttributePerLine: true,
        } as Options)
        expect(merged.parser).toBe('vue')
        expect(merged.plugins).toEqual([])
        expect(merged.printWidth).toBe(80)
        expect(merged.singleAttributePerLine).toBe(true)
      })

      it('runFormatWxmlPass：合法模板与直接 prettier.format(vue) 一致', async () => {
        const src = '<view><text>x</text></view>'
        const expected = await prettier.format(src, buildWxmlFormatOptions(base))
        const out = await runFormatWxmlPass({
          source: src,
          prettierOptions: base,
          formatOnError: 'warn',
          onWarn: () => {},
        })
        expect(out).toBe(expected)
      })

      it('runFormatWxmlPass：非法模板且 formatOnError=warn 时回退原串并告警', async () => {
        const bad = '<view attr'
        const onWarn = vi.fn()
        const out = await runFormatWxmlPass({
          source: bad,
          prettierOptions: base,
          formatOnError: 'warn',
          onWarn,
        })
        expect(out).toBe(bad)
        expect(onWarn).toHaveBeenCalledTimes(1)
        expect(String(onWarn.mock.calls[0]?.[0])).toContain('wxml-format-failed')
      })

      it('runFormatWxmlPass：非法模板且 formatOnError=throw 时抛出', async () => {
        const bad = '<view attr'
        const onWarn = vi.fn()
        await expect(
          runFormatWxmlPass({
            source: bad,
            prettierOptions: base,
            formatOnError: 'throw',
            onWarn,
          })
        ).rejects.toThrow()
        expect(onWarn).not.toHaveBeenCalled()
      })
    })

    describe('mustache（mustache-pass）', () => {
      it('格式化插值表达式', async () => {
        const out = await runMustachePass({
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
        const out = await runMustachePass({
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
  })

  describe('阶段组合（runPipelineStages）', () => {
    it('仅 mustache：等价于全局 wxmlFormat=false、wxmlSelfClose=false', async () => {
      const out = await runPipelineStages({
        source: '<view>{{a+b}}</view>',
        stages: ['mustache'],
        prettierOptions: base,
      })
      expect(out).toBe('<view>{{ a + b }}</view>')
    })

    it('selfClose + mustache：先自闭合再插值', async () => {
      const out = await runPipelineStages({
        source: '<view></view><text>{{a+b}}</text>',
        stages: ['selfClose', 'mustache'],
        prettierOptions: base,
      })
      expect(out).toBe('<view /><text>{{ a + b }}</text>')
    })

    it('formatWxml + mustache：先整文件排版再插值', async () => {
      const out = await runPipelineStages({
        source: '<view>\n<text>{{a+b}}</text>\n</view>',
        stages: ['formatWxml', 'mustache'],
        prettierOptions: base,
      })
      expect(out).toBe('<view>\n<text>{{ a + b }}</text>\n</view>\n')
    })

    it('selfClose + formatWxml + mustache：全阶段串联', async () => {
      const out = await runPipelineStages({
        source: '<view>\n<text></text>\n</view>',
        stages: ['selfClose', 'formatWxml', 'mustache'],
        prettierOptions: base,
      })
      expect(out).toBe('<view>\n<text />\n</view>\n')
    })

    it('selfClose + formatWxml（无 mustache）：不跑插值、不做 EOF trim', async () => {
      const raw = '<view><text>{{a+b}}</text></view>'
      const out = await runPipelineStages({
        source: raw,
        stages: ['selfClose', 'formatWxml'],
        prettierOptions: base,
      })
      expect(out).toContain('{{a+b}}')
      expect(out).not.toContain('{{ a + b }}')
    })

    it('pipelineOptionsToStages 与插件开关对应', () => {
      expect(
        pipelineOptionsToStages({
          selfCloseEnabled: false,
          formatEnabled: false,
        })
      ).toEqual(['mustache'])
      expect(
        pipelineOptionsToStages({
          selfCloseEnabled: true,
          formatEnabled: true,
        })
      ).toEqual(['selfClose', 'formatWxml', 'mustache'])
    })
  })

  describe('完整流水线（runFullWxmlPipeline / runWxmlPipeline）', () => {
    it('与 runPipelineStages 三阶段全开结果一致', async () => {
      const source = '<view></view><text>{{x+y}}</text>'
      const onWarn = vi.fn()
      const common = {
        source,
        prettierOptions: base,
        selfCloseExclude: undefined as string[] | undefined,
        formatOnError: 'warn' as const,
        throwOnError: false,
        onWarn,
      }
      const a = await runFullWxmlPipeline({
        ...common,
        selfCloseEnabled: true,
        formatEnabled: true,
        formatWxsEnabled: true,
      })
      const b = await runPipelineStages({
        source,
        stages: ['selfClose', 'formatWxml', 'mustache'],
        prettierOptions: base,
        formatOnError: 'warn',
        throwOnError: false,
        onWarn,
      })
      expect(a).toBe(b)
      expect(a).toContain('<view />')
      expect(a).toContain('{{ x + y }}')
    })
  })
})
