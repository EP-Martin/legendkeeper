# Markdown dialect

The plugin's write tools (`lk_create_pages`, `lk_append_to_page`) accept CommonMark with GFM tables and task lists, plus the extensions below. The mirror under `legendkeeper/world/` is written in the same dialect, so anything you read there can be written back.

## Text

| Markdown | LegendKeeper |
| --- | --- |
| `**bold**`, `*italic*`, `~~struck~~`, `` `code` `` | Marks |
| `[text](https://…)` | Link |
| `[[Page Name]]` | Mention of a page, matched by name or alias, case-insensitive |
| `[[Page Name\|the old man]]` | Mention with its own label |
| `[text](lk://resources/<id>)` | Mention by resource id (the mirror uses this for pages it can't name) |
| A line ending in `\` | Line break |

A mention resolves against, in order: other pages in the same `lk_create_pages` batch (names and aliases), the mirror index, then a live exact-name search. A name that matches two pages is left as plain text with an "ambiguous" warning. Link the page's exact name instead, or use its id.

## Blocks

| Markdown | LegendKeeper |
| --- | --- |
| `#` … `######` | Heading 1 to 6. Start page sections at `##`. |
| `-` / `1.` lists, nested by indentation | Bullet and numbered lists |
| `- [ ]` / `- [x]` | Checklist. Every item in the list must be a checkbox. |
| `> quote` | Quote |
| `> [!warning]` on the first line of a quote | Callout: `info`, `note`, `success`, `warning`, `error` |
| `---` | Divider |
| ```` ``` ```` fences | Code block |
| GFM table | Table, with the first row as headers |
| `<!-- comment -->` | Ignored. Use `<!-- -->` to keep two adjacent lists apart. |

## Containers

Each opens with `:::name` alone on its line and closes with `:::` alone on its line. They don't nest.

```
:::infobox
Role: Harbormaster
Faction: [[The Salt Court]]
Status: Alive
:::

:::secret
She sells the harbor schedules to [[Captain Ilse Marr]].
:::

:::expand Full ledger
- 12 crowns to the watch
- 40 crowns to the guild
:::
```

- **Infobox:** one `Key: value` line per fact. Values take inline Markdown and links. Keep values short; long text belongs in the body.
- **Secret:** hidden from players in LegendKeeper. Any Markdown inside.
- **Expand:** a collapsible section with a title.

## Not supported yet

Images, maps, embeds, collections and layout columns can't be written. The mirror shows them as comments such as `<!-- lk: embedded map -->`. Appending to a page never touches them.

`<!-- lk: content the API cannot read -->` marks a block that LegendKeeper's API doesn't expose, such as a 5e stat block or a legacy child-page list. Its content is real but invisible to Claude. Never report it as missing information or a continuity gap; say the page has content that can only be read in LegendKeeper.
