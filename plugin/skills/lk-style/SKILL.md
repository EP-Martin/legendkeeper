---
name: lk-style
description: Reference for writing LegendKeeper pages with this plugin. Covers the Markdown dialect the write tools accept, building pages from the world's own LegendKeeper templates, fallback page shapes, and how the world's style guide page overrides them. Load it before drafting or editing any LegendKeeper content.
user-invocable: false
---

# Writing for LegendKeeper

## Precedence

1. **The world's style guide page wins.** It is the page tagged `claude-style` (usually hidden). `lk_status` reports its file in the mirror. Read the whole file before drafting. Follow its voice, template choices, tree placement, tags and spelling list over anything below.
2. **The world's LegendKeeper templates come next.** If a template fits the kind of page, build the page from it. See [page-shapes.md](page-shapes.md#use-the-worlds-templates-first).
3. **Then the world's existing pages.** Copy the conventions of similar pages in the mirror: tabs, section names, sidebar fields, tag spelling, and where pages sit in the tree.
4. **The fallback shapes in [page-shapes.md](page-shapes.md) come last.**

If no style guide exists, say so once and suggest `/legendkeeper:setup`. Keep working with the defaults.

## Markdown dialect

The write tools convert Markdown to LegendKeeper blocks. The full syntax is in [dialect.md](dialect.md). The essentials:

- `[[Page Name]]` links to a page by name or alias; `[[Page Name|shown text]]` changes the label. Unknown names become plain text with a warning, so check names against the mirror's `INDEX.md`.
- `:::infobox` … `:::` with one `Key: value` line per fact puts an infobox at the top of the page.
- `:::secret` … `:::` holds content hidden from players.
- `> [!note]`, `[!info]`, `[!success]`, `[!warning]` and `[!error]` start callouts.
- Do not repeat the page title as a heading. LegendKeeper shows it.
- `![alt](<path>)` on a line of its own uploads an image file from the workspace; `Image: ![alt](<path>)` in a draft's sidebar sets the portrait. Only files can be uploaded, not pictures that exist only in the conversation.

## Page shapes

[page-shapes.md](page-shapes.md) covers how LegendKeeper pages are built (tabs, sidebar, hidden GM tabs), how to fill a template, the fallback shapes, and the draft file format.

## Default voice

- Write a GM's working reference: quick to scan at the table. Present tense for how things are, past tense for history and session events. A world written in an in-world voice, such as a scholar's natural history, keeps that voice; match the existing pages.
- Be concrete. Name the person, the place and the price. Cut anything the notes don't support.
- Keep sentences varied and short. Avoid filler and stock phrases ("tapestry," "testament," "beacon," "realm," "delve," "nestled," "bustling," "shrouded in mystery").
- Use American English and Chicago Manual of Style conventions, unless the style guide says otherwise.
- Use names exactly as the world spells them. If notes spell a name differently, flag it rather than picking one.

## Facts and secrets

- **Style changes the wording, never the facts.** Don't invent motives, histories or relationships to fill out a shape. Leave a section out when there is nothing for it.
- **Secrets default to secret.** Anything the notes mark as GM-only, and anything that reveals a twist, a hidden identity, a true motive or a plan the players haven't uncovered, goes in the page's hidden GM tab (the template's `Backstory` or `History`, or a `GM Notes` tab). A one-line secret inside visible text can use a `:::secret` block instead. When a whole page is about something the players don't know exists, make the page hidden (`hidden: true`). When unsure, hide it and say so in the plan.
- **Templates are not lore.** Files under `legendkeeper/world/_templates/` (frontmatter `template: true`) hold structure and instructions. Never cite or copy their text as facts.
