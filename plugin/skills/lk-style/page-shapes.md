# Page shapes

Calibrated against LegendKeeper's built-in templates and its two sample projects, *Questing in Selenia* and *Corvus Canticum's Natural History*.

## What LegendKeeper pages look like

- **Tabs carry the structure.** A character has `Overview` and `Backstory`; an organization has `Overview`, `Mission`, `Activities` and `Alliances and Rivals`. Each tab holds a few `##` sections.
- **GM material lives in hidden tabs.** Examples: `Backstory`, `History`, `GM Notes`. Within a visible tab, small secrets use `:::secret` blocks.
- **The sidebar holds glance facts.** A portrait or logo, a one-line `Summary`, and automatic lists (Friends, Members, Located in) that LegendKeeper fills from links and tags.
- **Body prose is short and concrete.** Pages run from two paragraphs to a few hundred words. Lists, tables (menus, random tables) and bold lead-ins (`**Ideal:**`) are common. Body infoboxes are rare.
- **Tags are lowercase nouns** (`town`, `tavern`, `npc`, `flora`), reused across the world.
- **The tree is a category or geography hierarchy.** Top-level folders (`NPCs`, `Monsters`, `Magic Items`, `Deities`) sit beside the world's geography, with places nested inside places. Adventures nest under their location, and their parts are child pages.

## Use the world's templates first

When the world has a LegendKeeper template for the kind of page (`lk_status` lists them; the files are in `legendkeeper/world/_templates/`):

1. Read the template file. Note its tab names, its `##` sections and its sidebar fields.
2. Create the page with `template: "<name>"`. Put the first tab's content in `markdown`, and the other tabs in `tabs`, using the template's tab names and its sections as headings. Put short facts in `sidebar` by field title, such as `Summary`.
3. Leave out a tab or section the notes don't support. Unfilled tabs are removed, because they hold the template's instructions, not lore.
4. Never copy a template's instruction text ("Your character's physical description…") into a page.

## Fallback shapes

Use these only when the world has no template for the kind and no existing pages to imitate. Put glance facts in `sidebar` as short text fields by title, as a template page would have them, not in a body infobox.

### Character

- **Sidebar:** the facts the notes give (Summary, Role, Ancestry, Location, Faction, Status).
- **Main:** a bold one-line descriptor (`**Female Human Ferryman**`), a quote if the notes have one, and `## Appearance & Quirks` as a short list.
- **Personality:** `**Ideal:**`, `**Flaw:**` and `**Bond:**` paragraphs, only those the notes support.
- **GM Notes** (hidden): secrets, true motives and plans.

### Location

- **Sidebar:** Summary, Type, Region, Ruler or Proprietor.
- **Main:** a summary paragraph, then `## Description`, `## Notable People`, and `## Rumors and Hooks` where the notes support them. Taverns and shops add `## Menu` or `## Wares` as a table.
- **GM Notes** (hidden): what's really going on.

### Faction

- **Sidebar:** Summary, Type, Leader, Base.
- **Main:** `## Overview`, `## Members` and `## Allies and Rivals`.
- **GM Notes** (hidden): true aims and hidden members.

### Item

- **Main:** an italic type line (`*Wondrous item, rare*`), a description, then its mechanics as plain paragraphs or a table.
- **GM Notes** (hidden): origin secrets and curses.

### Session log

Name it as the world names sessions (default `Session 14`), under the campaign's sessions parent.

- **Sidebar:** Date (real), Date (in game), Party, Location.
- **Main:** `## Summary` in three to five sentences, `## Events` as an ordered list with links, `## Loot and Rewards`, and `## Open Threads` as a checklist.
- **GM Notes** (hidden): what the players missed and the consequences in motion.

## Appending to an existing page

Add a self-contained section with its own heading, such as `## Session 14`, followed by a short list of what happened. Appends go to the end of the page's first page tab. Never append a second infobox. A changed fact in an infobox or the sidebar is a **proposal** in the plan for the user to apply.

## Draft file format

Ingest drafts use the mirror's own layout, so a draft reads like a mirror page:

```
---
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
…

## Tab: Backstory [GM only]

…
```

To build the tool call, use the `## Sidebar` infobox lines for `sidebar`. The first `## Tab:` becomes `markdown`, and each later `## Tab:` becomes an entry in `tabs`. `[GM only]` means `hidden: true`. A draft without `## Tab:` headings is a single-tab page, and its whole body becomes `markdown`.
