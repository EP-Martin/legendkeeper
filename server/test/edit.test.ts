import type { Block } from '@legendkeeper/sdk/blocks'
import { describe, expect, it } from 'vitest'
import { planSection, sameText } from '../src/edit.js'
import { blocksToMarkdown } from '../src/markdown.js'

const render = (blocks: Block[]) => blocksToMarkdown(blocks, { nameOf: () => undefined })
const h = (id: string, level: number, text: string) => ({ id, kind: 'heading', level, content: [{ text }] }) as Block & { id: string }
const p = (id: string, text: string) => ({ id, kind: 'paragraph', content: [{ text }] }) as Block & { id: string }

const page = [
  p('intro', 'Intro.'),
  h('h1', 2, 'Elysium'), p('a', 'Old one.'), h('sub', 3, 'Aftermath'), p('b', 'Old two.'),
  h('h2', 2, 'The warehouse'), p('c', 'Untouched.'),
]
const oldBody = 'Old one.\n\n### Aftermath\n\nOld two.'

describe('planSection', () => {
  it('replaces the body of a section, through its subsections, inserting before deleting', () => {
    const plan = planSection(page, { section: 'Elysium', old: oldBody }, [p('n1', 'New one.'), p('n2', 'New two.')], render)
    expect(plan).toEqual({ done: false, replaceAll: false, deletes: ['a', 'sub', 'b'], inserts: [
      { block: p('n1', 'New one.'), after: 'h1' },
      { block: p('n2', 'New two.'), after: 'n1' },
    ] })
  })

  it('accepts a heading written with its hashes, case-insensitively', () => {
    expect(planSection(page, { section: '## elysium', old: oldBody }, [p('n1', 'x')], render).done).toBe(false)
  })

  it('refuses when the live text no longer matches old, and shows the current text', () => {
    expect(() => planSection(page, { section: 'Elysium', old: 'Something else.' }, [p('n1', 'x')], render))
      .toThrow(/no longer matches `old`[\s\S]*Old one\./)
  })

  it('finishes an interrupted call, and reports a finished one as done', () => {
    const half = [h('h1', 2, 'Elysium'), p('n1', 'New one.'), p('a', 'Old one.')]
    const plan = planSection(half, { section: 'Elysium', old: 'Old one.' }, [p('n1', 'New one.'), p('n2', 'New two.')], render)
    expect(plan).toEqual({ done: false, replaceAll: false, deletes: ['a'], inserts: [{ block: p('n2', 'New two.'), after: 'n1' }] })
    const whole = [h('h1', 2, 'Elysium'), p('n1', 'New one.'), p('n2', 'New two.')]
    expect(planSection(whole, { section: 'Elysium', old: 'Old one.' }, [p('n1', 'New one.'), p('n2', 'New two.')], render)).toEqual({ done: true })
  })

  it('treats a section that already says the new text as done', () => {
    const same = [h('h1', 2, 'Elysium'), p('x', 'Fixed.')]
    expect(planSection(same, { section: 'Elysium', old: 'Broken.' }, [p('n1', 'Fixed.')], render)).toEqual({ done: true })
  })

  it('replaces a whole tab when no section is named', () => {
    const old = render(page)
    expect(planSection(page, { old }, [p('n1', 'All new.')], render)).toEqual({ done: false, replaceAll: true })
  })

  it('refuses unknown, repeated or unreadable sections, and new text that would start a section', () => {
    expect(() => planSection(page, { section: 'Nope', old: '' }, [], render)).toThrow(/Sections in this tab: "Elysium", "Aftermath", "The warehouse"/)
    const twice = [h('h1', 2, 'Notes'), h('h2', 2, 'Notes')]
    expect(() => planSection(twice, { section: 'Notes', old: '' }, [], render)).toThrow(/2 sections are named/)
    const unreadable = [h('h1', 2, 'Stats'), { id: 'u', kind: 'unsupported' } as never]
    expect(() => planSection(unreadable, { section: 'Stats', old: '' }, [], render)).toThrow(/can't read or write/)
    expect(() => planSection(page, { section: 'Elysium', old: oldBody }, [h('n1', 2, 'Oops')], render)).toThrow(/would start a new section/)
  })
})

describe('sameText', () => {
  it('ignores differences in whitespace only', () => {
    expect(sameText('a  b\n\nc ', ' a b c')).toBe(true)
    expect(sameText('a b', 'a c')).toBe(false)
  })
})
