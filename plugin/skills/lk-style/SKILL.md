---
name: lk-style
description: Reference for writing LegendKeeper pages with this plugin. Covers the Markdown dialect the write tools accept, default page shapes for NPCs, places, factions, items and sessions, and how the world's own style guide page overrides them. Load it before drafting or editing any LegendKeeper content.
user-invocable: false
---

# Writing for LegendKeeper

## Precedence

1. **The world's style guide page wins.** It is the page tagged `claude-style` (usually hidden). `lk_status` reports its file in the mirror. Read the whole file before drafting. Follow its voice, page shapes, tree placement, tags and spelling list over anything below.
2. **The world's existing pages come next.** When the guide is silent, copy the conventions of similar pages in the mirror: section names, infobox keys, tag spelling, where pages sit in the tree.
3. **The defaults in this skill come last.**

If no style guide exists, say so once and suggest `/legendkeeper:setup`. Keep working with the defaults.

## Markdown dialect

The write tools convert Markdown to LegendKeeper blocks. The full syntax is in [dialect.md](dialect.md). The essentials:

- `[[Page Name]]` links to a page by name or alias; `[[Page Name|shown text]]` changes the label. Unknown names become plain text with a warning, so check names against the mirror's `INDEX.md`.
- `:::infobox` … `:::` with one `Key: value` line per fact puts an infobox at the top of the page.
- `:::secret` … `:::` holds content hidden from players.
- `> [!note]`, `[!info]`, `[!success]`, `[!warning]` and `[!error]` start callouts.
- Do not repeat the page title as a heading. LegendKeeper shows it.
- Images are not supported yet. Describe them in text or leave them out.

## Page shapes

Default shapes for each kind of page are in [page-shapes.md](page-shapes.md). They are provisional until they are calibrated against LegendKeeper's sample projects.

## Default voice

- Write as the world's reference book: present tense for how things are, past tense for history and session events.
- Be concrete. Name the person, the place and the price. Cut anything the notes don't support.
- Keep sentences varied and short. Avoid filler and stock phrases ("tapestry," "testament," "beacon," "realm," "delve," "nestled," "bustling," "shrouded in mystery").
- Use American English and Chicago Manual of Style conventions, unless the style guide says otherwise.
- Use names exactly as the world spells them. If notes spell a name differently, flag it rather than picking one.

## Facts and secrets

- **Style changes the wording, never the facts.** Don't invent motives, histories or relationships to fill out a shape. Leave a section out when there is nothing for it.
- **Secrets default to secret.** Anything the notes mark as GM-only, and anything that reveals a twist, a hidden identity, a true motive or a plan the players haven't uncovered, goes in a `:::secret` block. When a whole page is about something the players don't know exists, make the page hidden (`hidden: true`). When unsure, hide it and say so in the plan.
