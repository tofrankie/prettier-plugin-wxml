import { describe, expect, it } from 'vitest'
import { extractMustacheRegions } from '../src/mustache.js'

describe('extractMustacheRegions', () => {
  it('单个 mustache，区间含一对花括号', () => {
    expect(extractMustacheRegions('a{{ x }}b')).toEqual([{ start: 1, end: 8 }])
  })

  // 与单行 `{{a}}{{b}}`、属性 `data="{{a}}{{b}}"` 的 value 片段扫描方式相同
  it('同一内容内多个 mustache', () => {
    expect(extractMustacheRegions('{{a}}{{b}}')).toEqual([
      { start: 0, end: 5 },
      { start: 5, end: 10 },
    ])
  })

  it('文本中与字面量相间的多个 mustache', () => {
    expect(extractMustacheRegions('a{{x}}b{{y}}c')).toEqual([
      { start: 1, end: 6 },
      { start: 7, end: 12 },
    ])
  })

  it('双引号字符串内的 }} 不当作闭合', () => {
    expect(extractMustacheRegions('{{ "a}}" }}')).toEqual([{ start: 0, end: 11 }])
  })

  it('单引号字符串内的 }} 不当作闭合', () => {
    expect(extractMustacheRegions("{{ 'a}}' }}")).toEqual([{ start: 0, end: 11 }])
  })

  it('转义引号后继续扫描', () => {
    expect(extractMustacheRegions('{{ "\\\\" }}')).toEqual([{ start: 0, end: 10 }])
  })

  it('无闭合 }} 时不产生区间，游标前进避免死循环', () => {
    expect(extractMustacheRegions('{{ a')).toEqual([])
  })

  it('无 {{ 时为空', () => {
    expect(extractMustacheRegions('plain')).toEqual([])
  })
})
