# Working on this repo

- `plugin/` is what users install. `server/` is the source of `plugin/server/index.js`; after changing `server/src`, run `npm run build` in `server/` and commit both.
- Keep the MCP tool surface small. Workflows belong in skills (`plugin/skills/`), not in new tools.
- Skills must work without Bash (Cowork has none of this repo's tooling). Put logic in the server.
- Don't add a top-level `bin/` to `plugin/`: Cowork and claude.ai refuse to install plugins that have one.
- The Markdown dialect is documented in `plugin/skills/lk-style/dialect.md`. Change it and `server/src/markdown.ts` together, with a test.
