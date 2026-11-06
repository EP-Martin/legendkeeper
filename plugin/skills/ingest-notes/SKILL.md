---
name: ingest-notes
description: Turn scans, photos or PDFs of handwritten session notes, annotated adventures or GM prep into LegendKeeper content. It creates pages and NPC profiles, appends session sections to existing pages, and adds timeline events, all matched against the existing world and written in the world's style guide voice. Use when the user shares note images or asks to "add my notes", "ingest", "log last session" or "put this in LegendKeeper".
argument-hint: "[image, PDF or folder paths]"
---

# Ingest notes into LegendKeeper

This is a pipeline with two approval gates. Nothing is written to LegendKeeper until the user approves twice: once for the plan, and once for the drafts. Keep the user informed in one line per stage.

Working folders under the workspace (create them as needed):

- `legendkeeper/inbox/`: where the user can drop scans
- `legendkeeper/sources/<slug>/`: the original images and transcripts, kept for provenance
- `legendkeeper/plans/<slug>.md`: the change plan
- `legendkeeper/drafts/<slug>/`: one file per page to create or append to

`<slug>` is `YYYY-MM-DD-<short-name>`, such as `2026-11-06-session-14`.

## 0. Preflight

1. Call `lk_status`. Without a connection, stop and point the user to the plugin's API key option. Without a mirror, call `lk_pull`. If the mirror is from an earlier day, ask whether to pull again; the user may have edited the world since then.
2. Load the `legendkeeper:lk-style` skill. Read the style guide file that `lk_status` reports, in full.
3. Read `legendkeeper/world/INDEX.md`, the map of every page name, alias and tag.

## 1. Gather and transcribe

1. Sources come from images attached in the conversation, paths in the arguments, or everything in `legendkeeper/inbox/`. Order pages by their number or filename and confirm the order if it's unclear. Copy each file into `sources/<slug>/`.
2. Transcribe each page into `sources/<slug>/transcript.md` under a `## Page N` heading, following [transcription.md](transcription.md). For more than six pages, transcribe in parallel with one subagent per page, each writing `transcript-pN.md`, then merge.
3. Never correct a name while transcribing. Spelling is reconciled in step 3.

## 2. Extract

From the transcript, list every person, place, faction, item, event and lore claim. Give each one:

- a source reference, such as `p2 L4-6`
- its kind (it chooses the page shape)
- the facts stated about it, as short claims
- the secrecy of each fact: `player-known`, `gm-only` or `unsure`

## 3. Reconcile with the world

For each entity, search the mirror for its name, its aliases and plausible variants: a first name alone, a title ("the Harbormaster"), a misspelling, a nickname. Read the matching pages in full. Classify each entity as:

| Class | Meaning | Plan action |
| --- | --- | --- |
| **New** | Not in the world | Create a page |
| **Known, new facts** | Exists; the notes add something | Append a section |
| **Known, nothing new** | Exists; the notes only mention it | None (the mention becomes a link) |
| **Conflict** | Notes contradict a page | Ask the user. Never pick a side silently. |
| **Identity unclear** | Might be an existing entity | Ask the user. Name the candidates. |

Flag minor characters too, but default them to **mention only** unless the notes give them a name *and* at least one fact worth keeping. Wikis bloat fast.

## 4. Plan (gate 1)

Write `plans/<slug>.md` from [plan-template.md](plan-template.md). Then tell the user in a few lines what it will create, append and add to the timeline, and what needs their decision. Ask them to review and edit the plan: they can uncheck items, answer questions inline and fix names.

**Stop here until the user approves.** Reread the plan file before going on, because the user may have edited it.

## 5. Draft (gate 2)

For each checked item, write a draft file:

- **Create:** `drafts/<slug>/<Page Name>.md`, with frontmatter and then the body in the dialect.
  ```
  ---
  name: Mira Vell
  parent: Characters
  tags: [NPC, Thornwick]
  aliases: [Mira]
  hidden: false
  ---
  :::infobox
  …
  ```
  `parent` is an existing page name or another page in the batch. Take tree placement from the style guide, or else from where similar pages live.
- **Append:** `drafts/<slug>/append--<Page Name>.md`, holding only the new section.
- **Timeline events** stay in the plan's Timeline section.

Then validate every create with **`lk_create_pages` and `dryRun: true`**. Fix each warning: correct the link spelling, add the missing page to the batch, or remove the brackets. Report the remaining warnings and point the user to the drafts folder. They can edit any draft before you apply.

**Stop until the user says to apply.**

## 6. Apply

Reread every draft and the plan. Then, in this order:

1. `lk_create_pages` with all creates in one call (up to 100 pages; split into more calls if needed, parents first).
2. `lk_append_to_page` once per append draft.
3. `lk_add_timeline_events` for the checked timeline items. Use the timeline page and lane names from the style guide. If there are none, ask once and suggest recording them in the style guide.

After each call, tick the item in the plan and record the created page's id next to it. If a call fails, stop, leave the remaining items unticked, and report the error with its `requestId`. Never retry a failed create under a new name.

Finally, move the processed files out of `inbox/` into `sources/<slug>/`. Report what changed, with links to the updated mirror files.

## Rules

- **Invent nothing.** The style guide changes the wording, never the facts. Thin notes make short pages.
- **Secrets default to secret.** `gm-only` and `unsure` facts go in `:::secret` blocks. A whole page about something the players don't know exists gets `hidden: true`.
- **No uncertain readings in pages.** Every `[?…]` in the transcript is resolved in the plan, or the fact stays out of the pages.
- **The user's spelling wins** once they settle it. Add a new spelling as an alias, and offer to record it in the style guide's names list.
