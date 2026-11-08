import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDraft, readDrafts } from '../src/drafts.js'

// The example from plugin/skills/lk-style/page-shapes.md#draft-file-format.
const SELA = `---
name: Sela Varn
parent: Characters
template: Character
tags: [npc]
aliases: [The Tidewitch]
hidden: true
---
## Sidebar

:::infobox
Summary: Harbor witch who runs the smuggling at [[Saltmouth Docks]].
:::

## Tab: Overview

## Description
Tall, salt-stained.

## Tab: Backstory [GM only]

Born in [[Marr's Hideout]].
`

describe('parseDraft', () => {
  it('reads the documented draft format', () => {
    expect(parseDraft(SELA, 'Sela Varn.md')).toEqual({
      name: 'Sela Varn',
      parent: 'Characters',
      template: 'Character',
      tags: ['npc'],
      aliases: ['The Tidewitch'],
      hidden: true,
      markdown: '## Description\nTall, salt-stained.',
      tabs: [{ name: 'Backstory', hidden: true, markdown: "Born in [[Marr's Hideout]]." }],
      sidebar: { Summary: 'Harbor witch who runs the smuggling at [[Saltmouth Docks]].' },
    })
  })

  it('treats a draft without tab headings as a single tab, with empty fields as absent', () => {
    const page = parseDraft('---\nname: Piety\nparent: Gods\ntemplate:\ntags: []\nhidden: false\n---\nScores go **up**.\n', 'Piety.md')
    expect(page).toEqual({ name: 'Piety', parent: 'Gods', tags: [], aliases: [], hidden: false, markdown: 'Scores go **up**.', tabs: [], sidebar: {} })
  })

  it('reads a mirror file: JSON frontmatter, the title heading and CRLF line endings', () => {
    const mirror = '---\r\nid: "r1"\r\nname: "The Creator"\r\ntags: ["deity"]\r\naliases: ["Maker, of All"]\r\nhidden: false\r\n---\r\n\r\n# The Creator\r\n\r\n## Sidebar\r\n\r\n:::infobox\r\nSummary: Maker\r\nImage: \r\n:::\r\n\r\n## Myth\r\n\r\nOld.\r\n'
    const page = parseDraft(mirror, 'The Creator.md')
    expect(page).toMatchObject({ name: 'The Creator', tags: ['deity'], aliases: ['Maker, of All'], markdown: '## Myth\n\nOld.', sidebar: { Summary: 'Maker' } })
  })

  it('refuses drafts it would misread', () => {
    expect(() => parseDraft('name: X\n', 'a.md')).toThrow('a.md: missing the --- frontmatter')
    expect(() => parseDraft('---\ntags: [x]\n---\nBody', 'b.md')).toThrow('b.md: frontmatter has no name')
    expect(() => parseDraft('---\nname: X\n---\nStray.\n\n## Tab: Main\n\nBody', 'c.md')).toThrow('text before the first')
    expect(() => parseDraft('---\nname: X\n---\n## Tab: Secrets [GM only]\n\nBody', 'd.md')).toThrow('first tab cannot be [GM only]')
    expect(() => parseDraft('---\nname: X\n---\n## Sidebar\n\nSummary: no box', 'e.md')).toThrow('must be followed by an :::infobox')
  })
})

describe('readDrafts', () => {
  it('reads a folder of create drafts, skips append and edit drafts, and refuses paths outside the workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lk-drafts-'))
    const dir = join(root, 'legendkeeper', 'drafts', 'batch')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'B.md'), '---\nname: B\n---\nBee')
    await writeFile(join(dir, 'A.md'), '---\nname: A\n---\nAy')
    await writeFile(join(dir, 'append--A.md'), '## Session 2\n\nMore.')

    const pages = await readDrafts(root, ['legendkeeper/drafts/batch'])
    expect(pages.map((p) => p.name)).toEqual(['A', 'B'])
    expect((await readDrafts(root, ['legendkeeper/drafts/batch/B.md']))[0]?.markdown).toBe('Bee')
    await expect(readDrafts(root, ['../elsewhere.md'])).rejects.toThrow('outside the workspace')
  })
})
