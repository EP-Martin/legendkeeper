# TODO

## Before the user-facing README

- [ ] Write the user-facing README (install, setup, the three workflows, privacy notes).
- [ ] **Update the GitHub repository description** to match the README's one-line summary.
- [ ] Add screenshots or a short demo of the ingest flow.

## Needs a live LegendKeeper project

- [x] Calibrate page shapes and the style guide template against the two sample projects and LegendKeeper's twelve built-in templates. Pages are now built from the world's own templates; the plugin's shapes are the fallback.
- [x] Run a full ingest end to end: three typeset pages of the owner's setting book (Acquia's Prime Deities), 8 pages, drafts round-tripped identically.
- [ ] Ingest handwritten notes end to end (OCR), and a source large enough to need appends to existing pages.
- [x] Write sidebar properties on plain pages too (`properties.create`), so fallback pages can match template pages. Template pages also get new fields for titles their template lacks. Checked live on the playground, including a retry.
- [x] `lk_create_pages` retries reported replayed plain pages as `created`. They now count as already existing (the `Idempotent-Replay` header).
- [x] Run `lk_pull` against both samples; fix rendering gaps. Remaining `<!-- lk: content the API cannot read -->` blocks (stat blocks, legacy child lists) are an API limit.
- [x] Round-trip every sample page through Markdown and back: 95/97 identical, the other 2 differ by one space.
- [x] Measure pulls: about 3 requests per resource, 10 s for 50 resources. `updatedAt` on resources and tabs does not change on content edits, so pulls stay full.
- [ ] Speed up large pulls: skip `getBlocks` when a tab's block `version` is unchanged (needs a cheap way to read versions).
- [ ] Report to LegendKeeper: inline icon runs (`{ icon: { name } }`) are returned but missing from the v3 spec and SDK types.
- [ ] Check whether per-resource `permissions` can hide a page from players in a way `isHidden` doesn't; if so, fold it into `playerHidden`.
- [ ] Confirm in the app whether children of a hidden resource are hidden from players (the mirror assumes they are: `playerHidden`). The API can't show this; an Admin key sees everything.
- [ ] Confirm that a `formattedStart` in a custom calendar parses as expected. Gregorian works ("March 3rd, 2012" → "March 3rd, 2012 CE").

## Product

- [ ] Verify the plugin installs and runs unchanged in Claude Desktop's Cowork mode.
- [ ] Verify how users re-enter a sensitive `userConfig` value (the setup skill's wording).
- [x] Images: `![alt](<path>)` on its own line, or as a sidebar `Image:` value, uploads a workspace file once into the asset folder "Uploaded by Claude" (matched by hash on retry). Checked live, including a retry.
- [ ] Check whether players can browse the asset library. If they can, an image for a hidden page or GM tab leaks; upload those as hidden assets.
- [ ] Pictures that exist only in a Cowork conversation can't be uploaded; check whether Cowork can save an attachment into the workspace.
- [ ] Mirror map pins (names, links) and board text.
- [ ] Decide whether to submit to Anthropic's plugin directory; that needs icon, support and privacy URLs in `plugin.json`.
