import { describe, expect, it } from 'vitest'
import { blocksToMarkdown, markdownToBlocks } from '../src/markdown.js'

const pages: Record<string, string> = { 'mira vell': 'rMira0001', 'the gilded eel': 'rEel00001', 'vell': 'rMira0001' }
const resolve = (name: string) => pages[name.toLowerCase()]
const nameOf = (id: string) => ({ rMira0001: 'Mira Vell', rEel00001: 'The Gilded Eel' })[id]

describe('markdownToBlocks', () => {
  it('converts headings, paragraphs and marks', () => {
    const { blocks, warnings } = markdownToBlocks('## Rumors\n\nShe is **very** *quiet* and `odd`, ~~maybe~~.', { resolve })
    expect(warnings).toEqual([])
    expect(blocks).toEqual([
      { kind: 'heading', level: 2, content: [{ text: 'Rumors' }] },
      { kind: 'paragraph', content: [
        { text: 'She is ' }, { text: 'very', bold: true }, { text: ' ' }, { text: 'quiet', italic: true },
        { text: ' and ' }, { text: 'odd', code: true }, { text: ', ' }, { text: 'maybe', strike: true }, { text: '.' },
      ] },
    ])
  })

  it('resolves wikilinks by name and alias, and warns on unknown names', () => {
    const { blocks, warnings } = markdownToBlocks('[[Mira Vell]] runs [[The Gilded Eel|the Eel]]. [[Vell]] owes [[Nobody]].', { resolve })
    expect(blocks[0]).toEqual({ kind: 'paragraph', content: [
      { mention: { resourceId: 'rMira0001' } },
      { text: ' runs ' },
      { mention: { resourceId: 'rEel00001', text: 'the Eel' } },
      { text: '. ' },
      { mention: { resourceId: 'rMira0001' } },
      { text: ' owes Nobody.' },
    ] })
    expect(warnings).toEqual(['Unresolved link [[Nobody]] written as plain text.'])
  })

  it('builds infobox, secret, expand and callout blocks', () => {
    const md = [
      ':::infobox', 'Role: Innkeeper', 'Haunt: [[The Gilded Eel]]', ':::',
      '', '> [!warning]', '> Do not trust her ledger.',
      '', ':::secret', 'She is a **smuggler**.', ':::',
      '', ':::expand Session notes', '- one', '- two', ':::',
    ].join('\n')
    const { blocks, warnings } = markdownToBlocks(md, { resolve })
    expect(warnings).toEqual([])
    expect(blocks.map((b) => b.kind)).toEqual(['infobox', 'callout', 'secret', 'expand'])
    expect(blocks[0]).toEqual({ kind: 'infobox', rows: [{ kind: 'keyValue', title: 'Facts', isTitleHidden: true, rows: [
      { key: 'Role', content: [{ text: 'Innkeeper' }] },
      { key: 'Haunt', content: [{ mention: { resourceId: 'rEel00001' } }] },
    ] }] })
    expect(blocks[1]).toMatchObject({ kind: 'callout', tone: 'warning', children: [{ kind: 'paragraph' }] })
    expect(blocks[3]).toMatchObject({ kind: 'expand', title: 'Session notes', children: [{ kind: 'bulletList' }] })
  })

  it('builds nested lists, ordered lists, task lists and tables', () => {
    const md = '- a\n  - b\n\n3. x\n4. y\n\n- [x] done\n- [ ] todo\n\n| Name | Role |\n| --- | --- |\n| Mira | Host |'
    const { blocks } = markdownToBlocks(md, { resolve })
    expect(blocks[0]).toEqual({ kind: 'bulletList', children: [{ kind: 'listItem', children: [
      { kind: 'paragraph', content: [{ text: 'a' }] },
      { kind: 'bulletList', children: [{ kind: 'listItem', children: [{ kind: 'paragraph', content: [{ text: 'b' }] }] }] },
    ] }] })
    expect(blocks[1]).toMatchObject({ kind: 'orderedList', start: 3 })
    expect(blocks[2]).toEqual({ kind: 'taskList', children: [
      { kind: 'taskItem', checked: true, content: [{ text: 'done' }] },
      { kind: 'taskItem', checked: false, content: [{ text: 'todo' }] },
    ] })
    expect(blocks[3]).toMatchObject({ kind: 'table', children: [
      { kind: 'tableRow', children: [{ kind: 'tableCell', header: true }, { kind: 'tableCell', header: true }] },
      { kind: 'tableRow', children: [{ kind: 'tableCell' }, { kind: 'tableCell' }] },
    ] })
  })

  it('keeps quotes, apostrophes and ampersands as typed', () => {
    const { blocks } = markdownToBlocks('Mira’s "deal" & Tom\'s <debt>', { resolve })
    expect(blocks[0]).toEqual({ kind: 'paragraph', content: [{ text: 'Mira’s "deal" & Tom\'s <debt>' }] })
  })

  it('warns about images instead of writing a broken image block', () => {
    const { blocks, warnings } = markdownToBlocks('![portrait](portrait.png)', { resolve })
    expect(blocks).toEqual([{ kind: 'paragraph', content: [] }])
    expect(warnings[0]).toMatch(/Image "portrait.png" skipped/)
  })
})

describe('round trip', () => {
  it('renders blocks back to the same dialect', () => {
    const md = [
      '## Who she is',
      '',
      '[[Mira Vell]] runs [[The Gilded Eel|the Eel]] with **iron** rules.',
      '',
      ':::infobox',
      'Role: Innkeeper',
      ':::',
      '',
      '> [!note]',
      '> Owes the guild.',
      '',
      ':::secret',
      'Smuggler.',
      ':::',
      '',
      '- one',
      '  - two',
      '',
      '<!-- -->',
      '',
      '- [x] met the party',
      '',
      '| Name | Role |',
      '| --- | --- |',
      '| Mira | Host |',
    ].join('\n')
    const first = markdownToBlocks(md, { resolve })
    const rendered = blocksToMarkdown(first.blocks, { nameOf })
    expect(rendered.trim()).toBe(md)
    expect(markdownToBlocks(rendered, { resolve }).blocks).toEqual(first.blocks)
  })

  it('renders mentions of unknown pages as lk:// links that parse back to mentions', () => {
    const rendered = blocksToMarkdown([{ kind: 'paragraph', content: [{ mention: { resourceId: 'rGone0001', text: 'Old Tom' } }] }], { nameOf })
    expect(rendered.trim()).toBe('[Old Tom](lk://resources/rGone0001)')
    expect(markdownToBlocks(rendered, { resolve }).blocks[0]).toEqual({ kind: 'paragraph', content: [
      { mention: { resourceId: 'rGone0001', text: 'Old Tom' } },
    ] })
  })

  it('moves infobox rows hidden from players into a secret block', () => {
    const rendered = blocksToMarkdown([{ kind: 'infobox', rows: [
      { kind: 'keyValue', rows: [{ key: 'Role', content: [{ text: 'Innkeeper' }] }] },
      { kind: 'keyValue', isHidden: true, rows: [{ key: 'True name', content: [{ text: 'Sela' }] }] },
    ] } as never], { nameOf })
    expect(rendered.trim()).toBe(':::infobox\nRole: Innkeeper\n:::\n\n:::secret\n- True name: Sela\n:::')
  })
})
