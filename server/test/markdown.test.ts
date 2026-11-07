import { describe, expect, it } from 'vitest'
import { localImages } from '../src/images.js'
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

  it('turns an image on its own line into an image block with the uploaded URL', () => {
    const uploaded: Record<string, string> = { 'art/The Creator.png': 'https://assets.example/creator.png' }
    const image = (src: string) => uploaded[src]
    const { blocks, warnings } = markdownToBlocks('![The Creator](<art/The Creator.png>)\n\n![x](art/The%20Creator.png)', { resolve, image })
    expect(warnings).toEqual([])
    expect(blocks).toEqual([
      { kind: 'image', url: 'https://assets.example/creator.png', alt: 'The Creator' },
      { kind: 'image', url: 'https://assets.example/creator.png', alt: 'x' },
    ])
  })

  it('passes image URLs through, so mirror images round-trip', () => {
    const md = '![Portrait](https://assets.legendkeeper.com/a.png)'
    const { blocks } = markdownToBlocks(md, { resolve })
    expect(blocks).toEqual([{ kind: 'image', url: 'https://assets.legendkeeper.com/a.png', alt: 'Portrait' }])
    expect(blocksToMarkdown(blocks, { nameOf }).trim()).toBe(md)
  })

  it('skips images with a warning when there is no upload or they sit inside text', () => {
    const missing = markdownToBlocks('![portrait](portrait.png)', { resolve })
    expect(missing.blocks).toEqual([])
    expect(missing.warnings[0]).toMatch(/Image "portrait.png" skipped: no uploaded image/)
    const inline = markdownToBlocks('See ![p](p.png) here.', { resolve, image: () => 'https://x/p.png' })
    expect(inline.blocks).toEqual([{ kind: 'paragraph', content: [{ text: 'See  here.' }] }])
    expect(inline.warnings[0]).toMatch(/on a line of its own/)
  })
})

describe('localImages', () => {
  it('finds local image paths anywhere in the Markdown, once each, and ignores URLs', () => {
    const sources = ['![a](<img/A one.png>)\n\n- ![b](img/b.png)\n\n| x |\n| --- |\n| ![c](c.png) |', '![a](img/A%20one.png) ![w](https://x/w.png)']
    expect(localImages(sources)).toEqual(['img/A one.png', 'img/b.png', 'c.png'])
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

  it('drops unreadable sidebar widgets and humanizes legacy property titles', () => {
    const rendered = blocksToMarkdown([{ kind: 'infobox', rows: [
      { kind: 'image', title: 'IMAGE', url: 'https://assets.legendkeeper.com/a.jpg' },
      { kind: 'unsupported', id: 'x' },
      { kind: 'keyValue', title: 'PIN APPEARANCE', rows: [{ key: 'Size', content: [{ text: 'Large' }] }] },
    ] } as never], { nameOf })
    expect(rendered.trim()).toBe(':::infobox\nImage: ![Image](https://assets.legendkeeper.com/a.jpg)\nSize: Large\n:::')
  })

  it('skips inline icon runs and other run shapes the spec does not list', () => {
    const rendered = blocksToMarkdown([{ kind: 'paragraph', content: [
      { icon: { name: 'fas fa-image' } }, { text: ' ' }, { text: 'Image', bold: true }, { text: ' blocks.' },
    ] } as never], { nameOf })
    expect(rendered.trim()).toBe(' **Image** blocks.'.trim())
  })

  it('keeps whitespace outside emphasis so the Markdown parses back to the same marks', () => {
    const blocks = [{ kind: 'paragraph', content: [{ text: 'Ideal: ', bold: true }, { text: 'A core value.' }] }] as never
    const rendered = blocksToMarkdown(blocks, { nameOf })
    expect(rendered.trim()).toBe('**Ideal:** A core value.')
    expect(markdownToBlocks(rendered, { resolve }).blocks).toEqual([{ kind: 'paragraph', content: [
      { text: 'Ideal:', bold: true }, { text: ' A core value.' },
    ] }])
  })

  it('drops line breaks at the edges of a block and escapes brackets only where they would link', () => {
    const rendered = blocksToMarkdown([
      { kind: 'paragraph', content: [{ text: 'Safe haven.' }, { break: true }] },
      { kind: 'heading', level: 2, content: [{ text: 'GM Notes [GM only]' }] },
      { kind: 'paragraph', content: [{ text: 'Not a [link](here) or [[wiki]].' }] },
    ] as never, { nameOf })
    expect(rendered.trim()).toBe('Safe haven.\n\n## GM Notes [GM only]\n\nNot a [link\\](here) or \\[[wiki]].')
    expect(markdownToBlocks(rendered, { resolve }).blocks[2]).toEqual({ kind: 'paragraph', content: [{ text: 'Not a [link](here) or [[wiki]].' }] })
  })
})
