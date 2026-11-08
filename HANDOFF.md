# Handoff: LegendKeeper plugin for Claude

Context for a fresh session picking this project up. The state described here is `main` at `abb53b2` (2026-11-07). No secrets are in this file. The earlier session's API keys were pasted into its chat and should be revoked; create new ones.

## What this is

An unofficial, public Claude Code plugin (also aimed at Claude Desktop's Cowork mode) that connects Claude to a [LegendKeeper](https://www.legendkeeper.com) world through its v3 REST API. The value is the worldbuilding layer, not the API wrapper:

- **Ingest notes:** scans or photos of handwritten session notes → transcript → change plan (approval gate 1) → drafts (gate 2) → pages, appended sections and timeline events, written in the world's voice.
- **Ask the world:** answers with citations from a local mirror, with a player-safe mode.
- **Continuity check:** contradictions, timeline errors, knowledge leaks and unknown names in a piece of writing.

The owner wants it public, lean and maintainable. Don't over-engineer. Challenge choices that add debt.

## Repo layout

| Path | What |
| --- | --- |
| `.claude-plugin/marketplace.json` | Marketplace `ep-martin`; install with `/plugin marketplace add EP-Martin/legendkeeper`, then `/plugin install legendkeeper@ep-martin` |
| `plugin/` | The installed plugin: `.claude-plugin/plugin.json` (sensitive `api_key` option), `skills/`, `server/index.js` |
| `plugin/server/index.js` | Bundled MCP server. **Generated, but committed** so users need no build step. CI fails if it's stale. |
| `server/src/` | `index.ts` (tools), `create.ts` (page creation), `mirror.ts` (pull and refresh), `markdown.ts` (dialect ↔ blocks), `resolve.ts` (name → id), `ids.ts` (content-derived ids) |
| `server/test/markdown.test.ts` | Converter tests (13) |
| `CLAUDE.md` | Repo rules. Read it first. |
| `TODO.md` | Open work, including "update the GitHub repo description when the user-facing README is written" |

Build and test: `cd server && npm install && npm run typecheck && npm test && npm run build`. Validate: `claude plugin validate ./plugin` and `claude plugin validate .`.

## MCP tools (eight; keep the surface small)

`lk_status`, `lk_pull`, `lk_search`, `lk_create_pages` (plain or from a template, extra tabs, hidden tabs, sidebar text, `dryRun`), `lk_append_to_page`, `lk_update_page_info`, `lk_add_timeline_events`, `lk_edit_page` (replace a section or tab, set sidebar fields, update or delete events).

Skills: `setup` (user-invoked), `ingest-notes`, `ask-world`, `continuity-check`, `lk-style` (shared reference, not user-invocable).

## Key design decisions and why

- **Local mirror instead of live queries.** `lk_pull` writes `legendkeeper/world/` as Markdown with JSON-in-YAML frontmatter, plus `INDEX.md` and `.state/index.json`. API search is keyword-only, returns at most 100 results and doesn't paginate, which is useless for continuity checks. Claude greps local files well. Write tools refresh the files they touch.
- **Skills hold the workflow; the server holds the logic.** Cowork has no Bash with this repo's tooling, so skills never shell out.
- **Edits are approved and checked.** Changes to existing facts are Edit items in the plan, applied with `lk_edit_page` only after the drafts gate. Each replacement carries the `old` text it expects, so a page edited in LegendKeeper since the pull is refused, not overwritten. (An earlier version of this file said the plugin never rewrites existing content; that was Claude's assumption, not a requirement.)
- **Secrets default to secret.** The mirror marks `playerHidden` (the page or any ancestor is hidden), renders hidden tabs as `## Tab: X [GM only]`, and moves hidden sidebar or infobox rows into `:::secret`. Player-safe mode skips all of these.
- **Every write is retry-safe.** Resource, block and event ids are derived from the request content (`ids.ts`). `createMany` runs in chunks of 25 with content-derived idempotency keys, and `DUPLICATE_ID` means "already done." Calling a tool again with identical input never duplicates. This was verified live.
- **The world's own templates first.** New LegendKeeper projects ship with 12 templates. `lk_create_pages` with `template` copies one under a placeholder name, then renames and hides it before any content goes in, fills tabs by name, deletes unfilled page tabs (which hold template instructions), keeps map tabs, and fills sidebar text fields by title. The fallback shapes in `plugin/skills/lk-style/page-shapes.md` apply only when no template fits.
- **The draft format matches the mirror:** frontmatter, an optional `## Sidebar` infobox, and `## Tab: Name [GM only]` sections.
- **License:** MIT, matching the SDK. Bundled dependencies are listed in `plugin/server/THIRD_PARTY_LICENSES.md`.

## LegendKeeper API facts learned the hard way

- SDK `@legendkeeper/sdk` 4.1.0 (MIT) ships its full guide in `node_modules/@legendkeeper/sdk/GUIDE.md` and `STYLE.md`. The live spec is `https://www.legendkeeper.com/api/v3/openapi.json`.
- Keys are per project, Admin at most, and need a paid owner plan (402 otherwise). There are no scopes to choose yet.
- **The `resources.list` documents field is unreliable** for older projects (missing tabs, `type: null`). Use `resources.get` for tabs, which also gives each tab's `isHidden`.
- **Content edits don't change `updatedAt`** on resources or tabs, so pulls are full. Cost is about 3 requests per resource: 10 s for 50 resources, about 10 minutes for 1,000.
- A create can't set a tab's `isHidden`. Create hidden tabs with `documents.create` and `isHidden: true`, then fill them.
- **Inline icon runs `{ icon: { name } }` are returned but missing from the spec and SDK types.** The renderer skips unknown run shapes. Report this to LegendKeeper.
- `unsupported` blocks (5e stat blocks, legacy child lists, built-in sidebar widgets like Tags and Mentioned In) can't be read. They render as `<!-- lk: content the API cannot read -->`, and the skills treat them as unseen content, not gaps.
- Templates are resources under the reserved parent `templates`. Search never returns them, but `resources.list` does. The mirror files them under `_templates/` with `template: true`, and the resolver ignores them.
- A large `createMany` can outlive the SDK's 30 s attempt timeout. The client now uses `timeoutMs: 120_000`.
- Timeline `formattedStart` accepts the calendar's own format and returns it with an era added ("March 3rd, 2012" → "March 3rd, 2012 CE"). Events have no description field.

## Testing setup

Three projects exist in the owner's LegendKeeper account. The owner will provide **new** Admin keys:

- **Questing in Selenia** (sample, D&D 5e, GM-facing voice): 49 resources, 65 pages. Read-only use.
- **Corvus Canticum's Natural History** (sample, in-world scholarly voice): 48 resources, 49 pages. Read-only use.
- **Claude Playground** (scratchpad, includes the 12 built-in templates): free to write. Test pages live under **Plugin Test**.

Running the bundled server over stdio, the way Claude Code does, is the best end-to-end test. Recreate this client locally, for example at `server/scripts/e2e.mjs` (don't commit keys):

```js
// node server/scripts/e2e.mjs <workspace-dir> <tool> '<json-args>'   (LEGENDKEEPER_API_KEY in env)
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
const [workspace, tool, args = '{}'] = process.argv.slice(2)
const client = new Client({ name: 'e2e', version: '0' })
await client.connect(new StdioClientTransport({
  command: 'node', args: [new URL('../../plugin/server/index.js', import.meta.url).pathname],
  env: { ...process.env, LEGENDKEEPER_WORKSPACE: workspace }, stderr: 'inherit',
}))
const result = await client.callTool({ name: tool, arguments: JSON.parse(args) }, undefined, { timeout: 1_800_000 })
console.log(result.content.map((c) => c.text).join('\n'), result.isError ? '\n[ERROR]' : '')
await client.close()
```

Use a separate workspace directory per project, outside the repo (mirrors hold GM secrets; `.gitignore` excludes `legendkeeper/`). The earlier cloud session needed `NODE_USE_ENV_PROXY=1` for Node's fetch; a local machine doesn't.

Useful checks from before:
- **Round trip:** strip each sample page's body, write all of them into the Playground with links flattened, pull, and diff. The last result was 95/97 identical; the other 2 differ by one space. Delete the test tree afterwards with `DELETE /resources/<id>?cascade=true`.
- **Retry safety:** send the same `lk_create_pages` call twice, then count pages by name on the server.

## Next steps (from `TODO.md`)

1. **A full ingest end to end** with the owner's real scanned session notes. This is the most important untested path.
2. In the app, confirm whether children of a hidden page are hidden from players (the mirror assumes yes; an Admin key can't tell).
3. Verify the plugin installs and runs unchanged in Cowork, and how users re-enter a sensitive `userConfig` value.
4. Optionally run `/legendkeeper:setup` against the Playground to produce a real style guide page.
5. Later: image upload (`assets.uploadImage`), mirroring map pins, sidebar properties on plain pages, faster large pulls, and the user-facing README (then update the GitHub repo description), plus an icon for any directory listing.

## Working with the owner

- Direct, peer-level tone. No filler. Push back on bloat or debt and offer the leaner option.
- Verify versions and docs with tools rather than from memory. Ask two or three targeted questions when something is truly ambiguous.
- Prose and docs: American English, Chicago Manual of Style, no AI-fluff words. Code: simplest idiomatic implementation.
- Commit only when asked or when continuing agreed work; end commit messages with the attribution lines the session provides.
