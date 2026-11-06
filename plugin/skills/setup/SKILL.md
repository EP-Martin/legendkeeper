---
name: setup
description: Set up the LegendKeeper plugin for a world. It checks the API connection, pulls the world into the local mirror, keeps GM secrets out of git, and creates or reviews the world's style guide page, a hidden page that sets voice, page shapes, tree placement, tags, calendar and spelling. Use on first run, when switching worlds, or when the user asks to set up or change the style guide.
disable-model-invocation: true
---

# Set up a world

## 1. Connect

Call `lk_status`.

- **Not connected:** the API key option is empty or wrong. Tell the user how to fix it: in LegendKeeper, open Project Settings → Developers → API Keys and create a key; then enter it in the plugin's settings (`/plugin` → legendkeeper → configure). An Admin key can create top-level pages. A Member key can't. Keys need the project owner to be on a paid plan.
- **401:** the key is revoked or mistyped. **402:** the project owner's plan doesn't allow API access.

## 2. Pull

Call `lk_pull`. Report how many resources, pages and timelines it mirrored, and anything it couldn't mirror (maps and boards aren't mirrored yet). A pull costs about three API requests per page: a few seconds for a small world, about ten minutes for a thousand pages. So pull at the start of a session, not before every question.

## 3. Protect secrets

The mirror holds every GM secret in plain text. If the workspace is a git repository, check whether `legendkeeper/` is ignored. If it isn't, explain the risk and offer to add `legendkeeper/` to `.gitignore`. Don't change the file without a yes.

## 4. Style guide

If `lk_status` reports a style guide page, read it and summarize it in a few lines. Ask whether anything needs changing. Changes to an existing guide are made by hand in LegendKeeper, or appended with `lk_append_to_page`.

If there is none, offer to create one. Before asking anything, study the mirror: tree layout, tag vocabulary, the templates in `_templates/` (tabs and sidebar fields), tabs and sections of existing pages, the voice of the longest pages, timeline page and lane names, and date formats. Propose answers drawn from the existing world. Then ask the user to confirm or correct them, at most five questions at a time:

1. **Voice:** genre and tone; in-world reference-book voice or GM-facing notes; tense; words and phrasing to avoid.
2. **Placement and templates:** where NPCs, places, factions, items and session logs go in the tree, and which template each one uses.
3. **Tags:** the tags to use for each kind of page, spelled exactly.
4. **Time:** the campaign timeline page and its lanes; how in-game dates are written.
5. **Secrets:** what is always GM-only; whether GM notes go in a hidden tab (and its name), in secret blocks or in hidden pages.

Draft the page from [style-guide-template.md](style-guide-template.md), show it to the user, and on approval create it with `lk_create_pages`:

- name: `Claude Style Guide` (or the user's choice)
- tags: `["claude-style"]`
- hidden: `true`

Then call `lk_status` to confirm the plugin finds it.
