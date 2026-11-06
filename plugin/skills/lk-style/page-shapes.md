# Default page shapes

> **Provisional.** These shapes will be recalibrated against LegendKeeper's sample projects. A world's style guide page overrides them.

Every shape starts with an infobox for facts a reader looks up at a glance, then body sections. Only include an infobox row or a section the source supports. An NPC met once might be just an infobox and two sentences, and that's correct.

## Character (NPC or PC)

Tags: `NPC` or `PC`, plus role tags the world already uses.

```
:::infobox
Role: …
Race / Ancestry: …
Faction: [[…]]
Location: [[…]]
Status: Alive | Dead | Missing | Unknown
First met: [[Session …]]
:::

One-paragraph summary: who they are and why the party cares.

## Appearance
## Personality
Voice, mannerisms, what they want.
## Relationships
- [[Name]]: how they're connected.
## History
## Session appearances
- [[Session 14]]: what happened.

:::secret
Motives, secrets and plans the players don't know.
:::
```

## Location

Tags: the kind of place (`City`, `Tavern`, `Dungeon`, …). Put it under its containing place in the tree.

```
:::infobox
Type: …
Region: [[…]]
Ruler / Owner: [[…]]
Population: …
:::

Summary paragraph.

## Description
## Notable people
## Points of interest
## History
## Rumors and hooks

:::secret
What's really going on here.
:::
```

## Faction

```
:::infobox
Type: Guild | Cult | Noble house | …
Leader: [[…]]
Base: [[…]]
Goals: …
:::

## Overview
## Members
## Allies and enemies
## History

:::secret
True aims, hidden members.
:::
```

## Item

```
:::infobox
Type: …
Owner: [[…]]
Rarity: …
:::

## Description
## Properties
## History
```

## Session log

Name it as the world names sessions (default `Session 14`), under the campaign's sessions parent.

```
:::infobox
Date (real): 2026-11-06
Date (in game): …
Party: [[…]], [[…]]
Location: [[…]]
:::

## Summary
Three to five sentences.

## Events
- What happened, in order, with [[links]].

## Loot and rewards
## Open threads
- [ ] …

:::secret
GM notes: what the players missed, consequences in motion.
:::
```

## Appending to an existing page

Add a dated section rather than rewriting:

```
## Session 14
- Met the party at [[The Gilded Eel]]; offered passage for 40 crowns.
```

Appends always go at the end of the page's first page tab, so make each one self-contained, with its own heading. Never append a second infobox. A changed infobox fact is a **proposal** in the plan for the user to apply.
