// Reads ingest draft files (the draft format in plugin/skills/lk-style/page-shapes.md) as page inputs.
import { readdir, readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve as resolvePath } from 'node:path'
import type { PageInput } from './create.js'

const TAB = /^## Tab: *(.+?) *$/
const GM_ONLY = /\s*\[GM only\]$/i

/** Parses one draft. `where` names the file in error messages. */
export function parseDraft(text: string, where: string): PageInput {
  const fail = (message: string): never => { throw new Error(`${where}: ${message}`) }
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text.replace(/^\uFEFF/, ''))
  if (!match) return fail('missing the --- frontmatter block.')
  const [, front = '', body = ''] = match
  const meta = frontmatter(front)
  const name = typeof meta.name === 'string' ? meta.name.trim() : ''
  if (!name) fail('frontmatter has no name.')

  const lines = body.replace(/\r\n/g, '\n').split('\n')
  // A mirror file repeats the title as "# Name"; drafts don't need it.
  const first = lines.findIndex((l) => l.trim() !== '')
  if (first >= 0 && lines[first]?.trim() === `# ${name}`) lines.splice(0, first + 1)

  const sidebar: Record<string, string> = {}
  const sidebarAt = lines.findIndex((l) => l.trim() === '## Sidebar')
  if (sidebarAt >= 0) {
    const open = lines.findIndex((l, i) => i > sidebarAt && l.trim() !== '')
    if (open < 0 || lines[open]?.trim() !== ':::infobox') fail('"## Sidebar" must be followed by an :::infobox block.')
    const close = lines.findIndex((l, i) => i > open && l.trim() === ':::')
    if (close < 0) fail('the sidebar :::infobox is not closed with :::.')
    for (const line of lines.slice(open + 1, close)) {
      const kv = /^([^:]+):\s*(.*)$/.exec(line.trim())
      const [, key = '', value = ''] = kv ?? []
      if (key.trim() && value.trim()) sidebar[key.trim()] = value.trim()
    }
    lines.splice(sidebarAt, close - sidebarAt + 1)
  }

  const tabs: PageInput['tabs'] = []
  const starts = lines.flatMap((l, i) => (TAB.test(l) ? [i] : []))
  let markdown: string
  if (starts.length === 0) {
    markdown = lines.join('\n').trim()
  } else {
    if (lines.slice(0, starts[0]).some((l) => l.trim() !== '')) fail('text before the first "## Tab:" heading belongs in a tab.')
    for (const [n, start] of starts.entries()) {
      const heading = TAB.exec(lines[start] ?? '')?.[1] ?? ''
      tabs.push({
        name: heading.replace(GM_ONLY, '').trim(),
        hidden: GM_ONLY.test(heading),
        markdown: lines.slice(start + 1, starts[n + 1] ?? lines.length).join('\n').trim(),
      })
    }
    const main = tabs.shift()!
    if (main.hidden) fail('the first tab cannot be [GM only]. Put GM material in a later tab.')
    markdown = main.markdown
  }

  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : [])
  const text_ = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  return {
    name,
    ...(text_(meta.parent) ? { parent: text_(meta.parent) } : {}),
    ...(text_(meta.template) ? { template: text_(meta.template) } : {}),
    tags: list(meta.tags),
    aliases: list(meta.aliases),
    hidden: meta.hidden === true,
    markdown,
    tabs,
    sidebar,
  }
}

/** The flat frontmatter drafts use: `key: value`, `[a, b]` lists, true/false, and JSON values as the mirror writes them. */
function frontmatter(block: string): Record<string, unknown> {
  const meta: Record<string, unknown> = {}
  for (const line of block.split(/\r?\n/)) {
    const [, key, rest = ''] = /^([A-Za-z]\w*):\s*(.*)$/.exec(line) ?? []
    if (!key) continue
    const raw = rest.trim()
    let value: unknown = raw
    try { value = JSON.parse(raw) } catch {
      if (raw === '') value = undefined
      else if (raw.startsWith('[') && raw.endsWith(']')) value = raw.slice(1, -1).split(',').map((s) => s.trim().replace(/^(['"])(.*)\1$/, '$2')).filter(Boolean)
      else value = raw.replace(/^(['"])(.*)\1$/, '$2')
    }
    meta[key] = value
  }
  return meta
}

/**
 * Reads draft files, or every create draft in a folder (not `append--` drafts), from paths
 * relative to the workspace. Paths outside the workspace are refused.
 */
export async function readDrafts(root: string, paths: string[]): Promise<PageInput[]> {
  const base = resolvePath(root)
  const files: string[] = []
  for (const path of paths) {
    const full = resolvePath(base, path)
    const rel = relative(base, full)
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Draft path "${path}" is outside the workspace.`)
    if ((await stat(full)).isDirectory()) {
      const names = (await readdir(full)).filter((f) => f.endsWith('.md') && !f.startsWith('append--')).sort()
      if (names.length === 0) throw new Error(`No drafts in "${path}".`)
      files.push(...names.map((f) => join(full, f)))
    } else {
      files.push(full)
    }
  }
  return Promise.all(files.map(async (f) => parseDraft(await readFile(f, 'utf8'), relative(base, f).split('\\').join('/'))))
}
