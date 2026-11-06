# LegendKeeper plugin for Claude

> **Work in progress.** An unofficial plugin; not affiliated with LegendKeeper. The user-facing README comes later (see [TODO.md](TODO.md)).

A Claude Code plugin (also aimed at Claude Desktop's Cowork mode) that connects Claude to a [LegendKeeper](https://www.legendkeeper.com) world through the [v3 API](https://www.legendkeeper.com/developers/).

- **Ingest notes:** scans or photos of session notes → a reviewed plan → pages, appended sections and timeline events in the world's voice.
- **Ask the world:** answers with citations, with a player-safe mode.
- **Continuity check:** contradictions, timeline errors, knowledge leaks and unknown names in a draft.

## How it works

`lk_pull` mirrors the world into `legendkeeper/world/` as Markdown, one file per page, so Claude reads and searches local files instead of making API calls. Writes go through a small set of MCP tools and refresh the affected mirror files. The world's own style guide is a hidden page tagged `claude-style`.

## Install (development)

```bash
/plugin marketplace add EP-Martin/legendkeeper
/plugin install legendkeeper@ep-martin
```

Or load a local checkout with `claude --plugin-dir ./plugin`.

## Layout

| Path | What |
| --- | --- |
| `.claude-plugin/marketplace.json` | Marketplace listing this repo's plugin |
| `plugin/` | The plugin as installed: manifest, skills, bundled server |
| `plugin/server/index.js` | Bundled MCP server. Generated; do not edit. |
| `server/` | Server source (TypeScript), tests and build |

## Develop

```bash
cd server && npm install
npm run typecheck && npm test
npm run build   # regenerates plugin/server/
```

CI fails when `plugin/server/` is out of date with `server/src/`.

## License

[MIT](LICENSE). The bundled server includes third-party packages under their own licenses; see `plugin/server/THIRD_PARTY_LICENSES.md`.
