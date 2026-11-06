# TODO

## Before the user-facing README

- [ ] Write the user-facing README (install, setup, the three workflows, privacy notes).
- [ ] **Update the GitHub repository description** to match the README's one-line summary.
- [ ] Add screenshots or a short demo of the ingest flow.

## Needs a live LegendKeeper project

- [ ] Calibrate the default page shapes and style guide against LegendKeeper's two sample projects (`plugin/skills/lk-style/page-shapes.md`, `plugin/skills/setup/style-guide-template.md`).
- [ ] Run `lk_pull` against both samples; fix rendering gaps in `server/src/markdown.ts` (blocks shown as `<!-- lk: ... -->`).
- [ ] Confirm that a block read from `getBlocks` round-trips through Markdown into `replaceBlocks` without validation errors.
- [ ] Measure pull time and request count on a large world. Make pulls incremental: `resources.get` returns each tab's `updatedAt`; check whether it changes on content edits.
- [ ] Check whether per-resource `permissions` can hide a page from players in a way `isHidden` doesn't; if so, fold it into `playerHidden`.
- [ ] Confirm whether children of a hidden resource are hidden from players in the app (the mirror assumes they are: `playerHidden`).
- [ ] Confirm that a `formattedStart` in a custom calendar parses as expected.

## Product

- [ ] Verify the plugin installs and runs unchanged in Claude Desktop's Cowork mode.
- [ ] Verify how users re-enter a sensitive `userConfig` value (the setup skill's wording).
- [ ] Images: upload scans or portraits through `assets.uploadImage` and support `![](...)` in the dialect.
- [ ] Mirror map pins (names, links) and board text.
- [ ] Templates: create pages from LegendKeeper templates where a world has them.
- [ ] Decide whether to submit to Anthropic's plugin directory; that needs icon, support and privacy URLs in `plugin.json`.
