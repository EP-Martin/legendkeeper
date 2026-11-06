---
name: continuity-check
description: Check fiction, session recaps, read-aloud text, adventure drafts or LegendKeeper pages for continuity against the user's LegendKeeper world. It finds contradictions, unknown or misspelled names, timeline errors, and characters who know secrets they shouldn't. Use when the user asks "does this fit my world", "check continuity" or "any contradictions", or wants a lore check on a draft.
argument-hint: "[file path, or paste the text]"
---

# Continuity check

Check a text against the world in the local mirror and report the problems. **Don't rewrite the text** unless the user asks.

## Prepare

1. Get the text: a file path in the arguments, text pasted in the conversation, or a mirror page the user names. For pasted text, refer to passages by paragraph number. For files, use line numbers.
2. Call `lk_status`. Pull if there's no mirror, or offer to pull if the user mentions recent edits.
3. Read the style guide's names list, if there is one.

## Extract claims

Go through the text and list every checkable claim, with its location:

- **Names:** people, places, factions, items, gods, ships, titles
- **Relationships:** kin, allegiance, rank, who serves whom
- **States:** alive or dead, location, ownership, office held, physical traits, injuries
- **Time:** dates, ages, durations, order of events, "years ago"
- **Space:** distances, travel times, what borders what, climate
- **Rules of the world:** how magic, religion, law and technology work as the pages describe them
- **Knowledge:** what each character knows, says or acts on

For a long text (over about 4,000 words), split it into chunks. Check the chunks in parallel with subagents, then merge and deduplicate their findings.

## Check each claim

Find the evidence in the mirror the way `/legendkeeper:ask-world` does: index, search, read in full, and follow links one hop. Then classify each claim:

| Finding | Meaning |
| --- | --- |
| **Contradiction** | A page says otherwise. Quote both sides. |
| **Timeline error** | The order or dates don't fit the timeline or stated ages. Show the arithmetic. |
| **Knowledge leak** | A character acts on something from a `:::secret` block, a `[GM only]` tab or a hidden page that they have no in-story way to know. |
| **Unknown name** | Not in the world. Note whether it's probably a misspelling of an existing name ("Thornwik" → [[Thornwick]]) or new. |
| **New fact** | Consistent but not yet recorded. Not an error; offer to add it. |
| **Consistent** | Supported. Don't list these unless the user asks. |

Judge contradictions against the world, not against real-world logic. If the pages say a river flows uphill, it does. When two pages disagree with each other, report that as a separate **world conflict**.

## Report

1. A one-line verdict: "3 contradictions, 1 timeline error, 2 unknown names, 5 new facts."
2. A table sorted by severity: contradiction, timeline, knowledge leak, unknown name, new fact. Columns: location in the text, the claim, the finding, evidence (`[[Page]]` plus a short quote), and a suggested fix.
3. Offer next steps:
   - Fix the text. Only if asked; show the changes as edits.
   - Record the new facts in LegendKeeper. Do this through the `/legendkeeper:ingest-notes` plan and drafts flow, treating the text as the source. The gates still apply.
   - Fix a world conflict. That is a manual edit in LegendKeeper; say which page and what to change.
