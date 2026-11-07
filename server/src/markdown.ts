// Converts between the plugin's Markdown dialect and LegendKeeper blocks.
//
// Dialect = CommonMark + GFM tables and task lists, plus:
//   [[Page Name]] / [[Page Name|label]]   mention of a resource (resolved by name or alias)
//   [text](lk://resources/<id>)           mention by id
//   > [!note] ...                         callout (info, note, success, warning, error)
//   :::secret ... :::                     GM-only content
//   :::expand Title ... :::               collapsible section
//   :::infobox ... :::                    infobox; each "Key: value" line is a fact row
import { Lexer, type Token, type Tokens } from 'marked'
import type { Block, Run } from '@legendkeeper/sdk/blocks'

type TextRun = Extract<Run, { text: string }>
type Marks = Omit<TextRun, 'text'>

export interface ParseOptions {
  /** Returns the resource id for a page name or alias, or undefined if unknown. */
  resolve: (name: string) => string | undefined
  /** Returns the uploaded asset URL for a local image path, or undefined if it has none. */
  image?: (src: string) => string | undefined
}

export interface ParseResult {
  blocks: Block[]
  warnings: string[]
}

const CALLOUT_TONES = new Set(['info', 'note', 'success', 'warning', 'error'])
const LK_RESOURCE = /^lk:\/\/resources\/([A-Za-z0-9_-]+)$/
const WIKI_SCHEME = 'lkname:'

// ---------------------------------------------------------------------------
// Markdown -> blocks
// ---------------------------------------------------------------------------

export function markdownToBlocks(markdown: string, options: ParseOptions): ParseResult {
  const warnings: string[] = []
  const blocks = parseContainers(markdown.replace(/\r\n?/g, '\n'), options, warnings)
  return { blocks, warnings }
}

/** Splits out ::: containers (one level deep), then lexes the Markdown between them. */
function parseContainers(source: string, options: ParseOptions, warnings: string[]): Block[] {
  const out: Block[] = []
  const lines = source.split('\n')
  let buffer: string[] = []
  const flush = () => {
    if (buffer.length) out.push(...parseMarkdown(buffer.join('\n'), options, warnings))
    buffer = []
  }

  for (let i = 0; i < lines.length; i++) {
    const open = /^:::(secret|expand|infobox)\b\s*(.*)$/.exec(lines[i]!.trim())
    if (!open) {
      buffer.push(lines[i]!)
      continue
    }
    const close = lines.findIndex((line, j) => j > i && line.trim() === ':::')
    if (close === -1) {
      warnings.push(`Unclosed :::${open[1]} at line ${i + 1}; treated as text.`)
      buffer.push(lines[i]!)
      continue
    }
    flush()
    const inner = lines.slice(i + 1, close).join('\n')
    const kind = open[1]!
    if (kind === 'infobox') {
      out.push(parseInfobox(inner, options, warnings))
    } else {
      const children = parseMarkdown(inner, options, warnings)
      if (children.length === 0) children.push(paragraph([]))
      out.push(kind === 'secret'
        ? { kind: 'secret', children }
        : { kind: 'expand', title: open[2]!.trim() || 'Details', children })
    }
    i = close
  }
  flush()
  return out
}

function parseInfobox(inner: string, options: ParseOptions, warnings: string[]): Block {
  const rows: { key: string; content: Run[] }[] = []
  for (const line of inner.split('\n')) {
    if (!line.trim()) continue
    const match = /^\s*(?:[-*]\s+)?\**([^:*]+?)\**\s*:\s*(.*)$/.exec(line)
    if (!match) {
      warnings.push(`Infobox line is not "Key: value": ${line.trim()}`)
      continue
    }
    rows.push({ key: match[1]!.trim(), content: inlineMarkdown(match[2]!, options, warnings) })
  }
  return {
    kind: 'infobox',
    rows: [{ kind: 'keyValue', title: 'Facts', isTitleHidden: true, rows }],
  }
}

function parseMarkdown(source: string, options: ParseOptions, warnings: string[]): Block[] {
  return blockTokens(new Lexer({ gfm: true }).lex(wikiToLinks(source)), options, warnings)
}

/** [[Name|label]] -> [label](lkname:Name) so the lexer carries it as a link. */
function wikiToLinks(source: string): string {
  return source.replace(/(?<!\\)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, name: string, label?: string) =>
    `[${(label ?? name).trim()}](${WIKI_SCHEME}${encodeURIComponent(name.trim())})`)
}

function inlineMarkdown(source: string, options: ParseOptions, warnings: string[]): Run[] {
  return inlineTokens(new Lexer({ gfm: true }).inlineTokens(wikiToLinks(source)), {}, options, warnings)
}

function blockTokens(tokens: Token[], options: ParseOptions, warnings: string[]): Block[] {
  const out: Block[] = []
  for (const token of tokens) {
    const block = blockToken(token, options, warnings)
    if (block) out.push(block)
  }
  return out
}

function blockToken(token: Token, options: ParseOptions, warnings: string[]): Block | undefined {
  switch (token.type) {
    case 'space':
    case 'def':
      return undefined
    case 'heading': {
      const t = token as Tokens.Heading
      return { kind: 'heading', level: t.depth, content: inlineTokens(t.tokens, {}, options, warnings) }
    }
    case 'paragraph':
    case 'text': {
      const t = token as Tokens.Paragraph | Tokens.Text
      // A paragraph that is only an image becomes an image block.
      const parts = (t.tokens ?? []).filter((x) => !(x.type === 'text' && !x.raw.trim()))
      if (parts.length === 1 && parts[0]!.type === 'image') return imageBlock(parts[0] as Tokens.Image, options, warnings)
      return paragraph(t.tokens ? inlineTokens(t.tokens, {}, options, warnings) : textRuns(t.text, {}))
    }
    case 'code': {
      const t = token as Tokens.Code
      return t.lang ? { kind: 'code', text: t.text, language: t.lang } : { kind: 'code', text: t.text }
    }
    case 'hr':
      return { kind: 'rule' }
    case 'blockquote':
      return blockquote(token as Tokens.Blockquote, options, warnings)
    case 'list':
      return list(token as Tokens.List, options, warnings)
    case 'table':
      return table(token as Tokens.Table, options, warnings)
    case 'html':
      if (/^\s*<!--[\s\S]*-->\s*$/.test(token.raw)) return undefined
      warnings.push(`Raw HTML kept as text: ${token.raw.trim().slice(0, 60)}`)
      return paragraph(textRuns(token.raw.trim(), {}))
    default:
      warnings.push(`Unsupported Markdown (${token.type}) kept as text.`)
      return paragraph(textRuns(token.raw.trim(), {}))
  }
}

function paragraph(content: Run[]): Block {
  return { kind: 'paragraph', content }
}

function blockquote(token: Tokens.Blockquote, options: ParseOptions, warnings: string[]): Block {
  const marker = /^\s*\[!(\w+)\][ \t]*\n?/.exec(token.text)
  if (marker && CALLOUT_TONES.has(marker[1]!.toLowerCase())) {
    const children = parseMarkdown(token.text.slice(marker[0].length), options, warnings)
    if (children.length === 0) children.push(paragraph([]))
    return { kind: 'callout', tone: marker[1]!.toLowerCase() as 'note', children }
  }
  const children = blockTokens(token.tokens, options, warnings)
  if (children.length === 0) children.push(paragraph([]))
  return { kind: 'quote', children }
}

function list(token: Tokens.List, options: ParseOptions, warnings: string[]): Block {
  if (token.items.length > 0 && token.items.every((item) => item.task)) {
    const children: Block[] = token.items.map((item) => {
      const [first, ...rest] = item.tokens.filter((t) => t.type !== 'space' && t.type !== 'checkbox')
      if (rest.length) warnings.push('Nested content under a checklist item was dropped.')
      const content = first && 'tokens' in first && first.tokens
        ? inlineTokens(first.tokens, {}, options, warnings)
        : textRuns(item.text, {})
      return { kind: 'taskItem', checked: Boolean(item.checked), content }
    })
    return { kind: 'taskList', children }
  }

  const children: Block[] = token.items.map((item) => {
    const kids = blockTokens(item.tokens.filter((t) => t.type !== 'checkbox'), options, warnings)
    if (kids[0]?.kind !== 'paragraph') kids.unshift(paragraph([]))
    return { kind: 'listItem', children: kids }
  })
  if (token.ordered) {
    const start = typeof token.start === 'number' ? token.start : 1
    return start === 1 ? { kind: 'orderedList', children } : { kind: 'orderedList', start, children }
  }
  return { kind: 'bulletList', children }
}

function table(token: Tokens.Table, options: ParseOptions, warnings: string[]): Block {
  const cell = (c: Tokens.TableCell, header: boolean): Block => ({
    kind: 'tableCell',
    ...(header ? { header: true } : {}),
    children: [paragraph(inlineTokens(c.tokens, {}, options, warnings))],
  })
  const rows: Block[] = [
    { kind: 'tableRow', children: token.header.map((c) => cell(c, true)) },
    ...token.rows.map((row): Block => ({ kind: 'tableRow', children: row.map((c) => cell(c, false)) })),
  ]
  return { kind: 'table', children: rows }
}

function inlineTokens(tokens: Token[], marks: Marks, options: ParseOptions, warnings: string[]): Run[] {
  return mergeRuns(inlineTokensRaw(tokens, marks, options, warnings))
}

/** Joins neighbouring text runs that carry the same marks. */
function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = []
  for (const run of runs) {
    const prev = out[out.length - 1]
    if (prev && 'text' in prev && 'text' in run && sameMarks(prev, run)) {
      out[out.length - 1] = { ...prev, text: prev.text + run.text }
    } else {
      out.push(run)
    }
  }
  return out
}

function sameMarks(a: TextRun, b: TextRun): boolean {
  const keys = ['bold', 'italic', 'underline', 'strike', 'code', 'link', 'sub', 'sup'] as const
  return keys.every((key) => a[key] === b[key])
}

function inlineTokensRaw(tokens: Token[], marks: Marks, options: ParseOptions, warnings: string[]): Run[] {
  const out: Run[] = []
  for (const token of tokens) {
    switch (token.type) {
      case 'text':
      case 'escape': {
        const t = token as Tokens.Text
        out.push(...(t.tokens?.length ? inlineTokens(t.tokens, marks, options, warnings) : textRuns(decode(t.text), marks)))
        break
      }
      case 'strong':
        out.push(...inlineTokens((token as Tokens.Strong).tokens, { ...marks, bold: true }, options, warnings))
        break
      case 'em':
        out.push(...inlineTokens((token as Tokens.Em).tokens, { ...marks, italic: true }, options, warnings))
        break
      case 'del':
        out.push(...inlineTokens((token as Tokens.Del).tokens, { ...marks, strike: true }, options, warnings))
        break
      case 'codespan':
        out.push({ text: decode((token as Tokens.Codespan).text), code: true })
        break
      case 'br':
        out.push({ break: true })
        break
      case 'link':
        out.push(...linkRuns(token as Tokens.Link, marks, options, warnings))
        break
      case 'image':
        warnings.push(`Image "${imagePath((token as Tokens.Image).href)}" skipped: put an image on a line of its own.`)
        break
      default:
        out.push(...textRuns(token.raw, marks))
    }
  }
  return out
}

function linkRuns(token: Tokens.Link, marks: Marks, options: ParseOptions, warnings: string[]): Run[] {
  const label = token.text
  if (token.href.startsWith(WIKI_SCHEME)) {
    const name = decodeURIComponent(token.href.slice(WIKI_SCHEME.length))
    const resourceId = options.resolve(name)
    if (!resourceId) {
      warnings.push(`Unresolved link [[${name}]] written as plain text.`)
      return textRuns(label, marks)
    }
    unmarked(`[[${name}]]`, marks, warnings)
    return [{ mention: label === name ? { resourceId } : { resourceId, text: label } }]
  }
  const id = LK_RESOURCE.exec(token.href)?.[1]
  if (id) {
    unmarked(`[${label}]`, marks, warnings)
    return [{ mention: { resourceId: id, text: label } }]
  }
  return inlineTokens(token.tokens, { ...marks, link: token.href }, options, warnings)
}

const REMOTE = /^https?:\/\//i

/** The path or URL an image token names, with %20-style escapes decoded for local paths. */
export function imagePath(href: string): string {
  if (REMOTE.test(href)) return href
  try { return decodeURI(href) } catch { return href }
}

function imageBlock(token: Tokens.Image, options: ParseOptions, warnings: string[]): Block | undefined {
  const src = imagePath(token.href)
  // A URL passes through: LegendKeeper accepts its own asset URLs, as the mirror writes them.
  const url = REMOTE.test(src) ? src : options.image?.(src)
  if (!url) {
    warnings.push(`Image "${src}" skipped: no uploaded image for it.`)
    return undefined
  }
  const alt = decode(token.text).trim()
  return { kind: 'image', url, ...(alt ? { alt } : {}) }
}

/** LegendKeeper mentions carry no marks, so bold or italic around a link would be dropped silently. */
function unmarked(link: string, marks: Marks, warnings: string[]) {
  const dropped = Object.entries(marks).filter(([, on]) => on).map(([mark]) => mark)
  if (dropped.length) warnings.push(`${link} can't be ${dropped.join(' or ')} in LegendKeeper; written without it. Keep the link outside the formatting, e.g. "**Camarilla:** [[Camarilla]]".`)
}

function textRuns(text: string, marks: Marks): Run[] {
  return text ? [{ text, ...marks }] : []
}

function decode(text: string): string {
  return text
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

// ---------------------------------------------------------------------------
// Blocks -> Markdown (for the local mirror; lossless only for the dialect above)
// ---------------------------------------------------------------------------

export interface RenderOptions {
  /** Returns a resource's current name for mentions that carry only an id. */
  nameOf: (resourceId: string) => string | undefined
}

export function blocksToMarkdown(blocks: readonly Block[], options: RenderOptions): string {
  return renderBlocks(blocks, options).trimEnd() + '\n'
}

const LISTS = new Set(['bulletList', 'orderedList', 'taskList'])

function renderBlocks(blocks: readonly Block[], options: RenderOptions): string {
  const parts: string[] = []
  blocks.forEach((block, i) => {
    // CommonMark merges two adjacent lists into one; a comment keeps them apart.
    if (i > 0 && LISTS.has(block.kind) && LISTS.has(blocks[i - 1]!.kind)) parts.push('<!-- -->')
    const text = renderBlock(block, options)
    if (text) parts.push(text)
  })
  return parts.join('\n\n')
}

function renderBlock(block: Block, o: RenderOptions): string {
  switch (block.kind) {
    case 'paragraph':
      return renderRuns(block.content, o)
    case 'heading':
      return `${'#'.repeat(Math.min(Math.max(block.level, 1), 6))} ${renderRuns(block.content, o)}`
    case 'quote':
      return prefixLines(renderBlocks(block.children, o), '> ')
    case 'callout':
      return prefixLines(`[!${block.tone === 'custom' ? 'note' : block.tone}]\n${renderBlocks(block.children, o)}`, '> ')
    case 'code':
      return `\`\`\`${block.language ?? ''}\n${block.text}\n\`\`\``
    case 'rule':
      return '---'
    case 'bulletList':
      return block.children.map((item) => renderListItem(item, '- ', o)).join('\n')
    case 'orderedList': {
      const start = block.start ?? 1
      return block.children.map((item, i) => renderListItem(item, `${start + i}. `, o)).join('\n')
    }
    case 'taskList':
      return block.children
        .map((item) => item.kind === 'taskItem'
          ? `- [${item.checked ? 'x' : ' '}] ${renderRuns(item.content, o)}`
          : indent(renderBlock(item, o), '  '))
        .join('\n')
    case 'table':
      return renderTable(block.children, o)
    case 'expand':
      return `:::expand ${block.title.trim()}\n${renderBlocks(block.children, o)}\n:::`
    case 'secret':
      return `:::secret\n${renderBlocks(block.children, o)}\n:::`
    case 'layout':
      return block.children
        .map((column) => column.kind === 'layoutColumn' ? renderBlocks(column.children, o) : renderBlock(column, o))
        .join('\n\n')
    case 'layoutColumn':
    case 'textField':
      return renderBlocks(block.children, o)
    case 'infobox':
      return renderInfobox(block.rows as unknown as Block[], o)
    case 'keyValue':
      return block.rows.map((row) => `- **${row.key}:** ${renderRuns(row.content ?? [], o) || row.text || ''}`).join('\n')
    case 'image':
      return `![${block.alt ?? block.title ?? ''}](${block.url})`
    case 'embed':
      return `[${block.title ?? block.provider}](${block.url})`
    case 'meter':
      return block.items.map((item) => `- ${item.name}: ${item.current}/${item.max}`).join('\n')
    case 'resourceLink':
    case 'resourceCollection': {
      const items = block.items ?? []
      const title = block.title && !block.isTitleHidden ? `**${block.title}**\n` : ''
      if (items.length === 0) return `${title}<!-- lk: filtered collection -->`
      return title + items.map((item) => `- ${wikiLink(item.resourceId, undefined, o)}`).join('\n')
    }
    case 'map':
      return '<!-- lk: embedded map -->'
    case 'unsupported':
      return '<!-- lk: content the API cannot read -->'
    default:
      return `<!-- lk: ${(block as { kind: string }).kind} -->`
  }
}

function renderInfobox(rows: Block[], o: RenderOptions): string {
  // Rows hidden from players move to a secret block after the infobox (containers don't nest).
  const visible: string[] = []
  const hidden: string[] = []
  for (const row of rows) {
    // Built-in widgets such as Tags and Mentioned In read as unsupported; they add nothing.
    if (row.kind === 'unsupported') continue
    const target = (row as { isHidden?: boolean }).isHidden ? hidden : visible
    if (row.kind === 'keyValue') {
      for (const kv of row.rows) target.push(`${kv.key}: ${renderRuns(kv.content ?? [], o) || kv.text || ''}`)
    } else {
      const title = propertyTitle((row as { title?: string }).title ?? row.kind)
      const body = row.kind === 'image'
        ? `![${row.alt || title}](${row.url})`
        : row.kind === 'resourceCollection' || row.kind === 'resourceLink'
          ? (row.items ?? []).map((item) => wikiLink(item.resourceId, undefined, o)).join(', ') || '(automatic list)'
          : renderBlock(row, o).replace(/\n+/g, ' ').replace(/^- /, '')
      target.push(`${title}: ${body}`)
    }
  }
  const parts: string[] = []
  if (visible.length) parts.push(`:::infobox\n${visible.join('\n')}\n:::`)
  if (hidden.length) parts.push(`:::secret\n${hidden.map((line) => `- ${line}`).join('\n')}\n:::`)
  return parts.join('\n\n')
}

/** Legacy property titles come through as IMAGE or MENTIONED_IN; show them as words. */
function propertyTitle(title: string): string {
  if (!/^[A-Z0-9_ ]+$/.test(title)) return title
  const words = title.replace(/_/g, ' ').toLowerCase().trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function renderListItem(item: Block, marker: string, o: RenderOptions): string {
  const pad = ' '.repeat(marker.length)
  if (item.kind !== 'listItem') return marker + renderBlock(item, o)
  const [first, ...rest] = item.children
  const head = first ? renderBlock(first, o) : ''
  const tail = rest.map((child) => indent(renderBlock(child, o), pad)).join('\n')
  return indent((marker + head).trimEnd(), pad, true) + (tail ? `\n${tail}` : '')
}

function renderTable(rows: readonly Block[], o: RenderOptions): string {
  const cells = rows.map((row) => row.kind === 'tableRow'
    ? row.children.map((cell) => cell.kind === 'tableCell'
      ? renderBlocks(cell.children, o).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim()
      : '')
    : [])
  const width = Math.max(1, ...cells.map((row) => row.length))
  const line = (row: string[]) => `| ${Array.from({ length: width }, (_, i) => row[i] ?? '').join(' | ')} |`
  const [header = [], ...body] = cells
  return [line(header), `|${' --- |'.repeat(width)}`, ...body.map(line)].join('\n')
}

function renderRuns(runs: readonly Run[], o: RenderOptions): string {
  // A line break at the edge of a block would render as a literal backslash.
  let start = 0
  let end = runs.length
  while (start < end && 'break' in runs[start]!) start++
  while (end > start && 'break' in runs[end - 1]!) end--
  return runs.slice(start, end).map((run) => {
    if ('break' in run) return '\\\n'
    if ('mention' in run) return wikiLink(run.mention.resourceId, run.mention.text, o, run.mention.name)
    // The API also returns run shapes the spec omits, such as inline icons ({ icon: { name } }).
    // They are decorative, so skip anything without text rather than fail the whole page.
    if (typeof (run as { text?: unknown }).text !== 'string') return ''
    // CommonMark ignores emphasis markers next to whitespace ("**Ideal: **"), so keep
    // leading and trailing spaces outside the markers.
    const [, lead = '', core = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(run.text) ?? []
    if (!core) return run.text
    let text = run.code ? `\`${core}\`` : escapeText(core)
    if (run.bold) text = `**${text}**`
    if (run.italic) text = `*${text}*`
    if (run.strike) text = `~~${text}~~`
    if (run.link) text = `[${text}](${run.link})`
    return lead + text + trail
  }).join('')
}

function wikiLink(resourceId: string, label: string | undefined, o: RenderOptions, known?: string): string {
  const name = o.nameOf(resourceId) ?? known
  if (!name) return `[${label ?? 'unknown page'}](lk://resources/${resourceId})`
  return label && label !== name ? `[[${name}|${label}]]` : `[[${name}]]`
}

function escapeText(text: string): string {
  // Brackets only need escaping where they would start a link or a [[wikilink]].
  return text.replace(/([\\*_`])/g, '\\$1').replace(/\[(?=\[)|\](?=[([])/g, '\\$&')
}

function prefixLines(text: string, prefix: string): string {
  return text.split('\n').map((line) => (line ? prefix + line : prefix.trimEnd())).join('\n')
}

function indent(text: string, pad: string, skipFirst = false): string {
  return text.split('\n').map((line, i) => (skipFirst && i === 0) || !line ? line : pad + line).join('\n')
}
