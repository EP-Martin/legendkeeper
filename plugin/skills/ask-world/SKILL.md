---
name: ask-world
description: Answer questions about the user's LegendKeeper world from its pages, with citations, including "who is", "what happened", "where", "how are X and Y connected", "what does the party know about" and session-prep lookups. It supports a player-safe mode that leaves out hidden pages and secrets. Use for any question about the campaign world, its lore, NPCs, places or history.
argument-hint: "[question]"
---

# Answer questions from the world

Answers come from the local mirror (`legendkeeper/world/`), not from memory or invention.

## Prepare

1. If you haven't this session, call `lk_status`. Without a mirror, call `lk_pull`.
2. If the user says they just edited the world, or the question concerns something recent that the mirror lacks, offer to call `lk_pull`. For a quick check on one page, use `lk_search`.

## Find the evidence

1. Look up names, aliases and tags in `legendkeeper/world/INDEX.md`. Ignore its Templates section and everything in `_templates/`: template text is placeholder guidance, never lore.
   A `<!-- lk: content the API cannot read -->` marker means the page has content, such as a stat block, that only LegendKeeper can show. Say so rather than calling the information missing.
2. Search the mirror for the key terms, their aliases and obvious variants, and read every file that matches in full. Most answers live in two or three pages.
3. Follow `[[links]]` one hop out when the question is about relationships, causes or history.
4. Check timelines (`## Timeline` sections) for "when" and "in what order" questions.
5. In a large world, or for a broad question ("summarize everything about the Salt Court"), spread the search across subagents by subtree, and have each return claims with citations.

## Answer

- Lead with the answer. Then give the evidence.
- Cite every claim with its page as `[[Page Name]]` and a link to the mirror file. Quote a short passage when the wording matters.
- Separate what the pages **say** from what you **infer**, and label inferences.
- When the world is silent, say so plainly. Never fill gaps with plausible inventions. If it would help, offer a short list of what the pages *do* say nearby. Ask whether the user wants ideas, and mark any ideas you give as invented.
- When pages disagree, show both and point out the conflict. Suggest running `/legendkeeper:continuity-check` on those pages.

## Player-safe mode

Use it when the user says "as a player," "player-safe," "what does the party know," or asks for something to share with players (a handout, a recap). Ask when it's unclear.

In player-safe mode:

- Skip every file whose frontmatter has `playerHidden: true`. That covers hidden pages and everything under them.
- Ignore everything inside `:::secret` blocks. That includes infobox and sidebar facts hidden from players.
- Skip every section whose heading ends in `[GM only]`, which marks a hidden tab, down to the next heading of the same level.
- Ignore timeline events marked `(hidden)`.
- Don't hint that hidden material exists ("there's more, but it's secret"). Answer from the visible material alone.

State at the top of the answer which mode you used.
