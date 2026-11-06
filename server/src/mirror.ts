// Pulls a LegendKeeper project into a local folder of Markdown files that Claude can
// grep and read. The mirror is read-only: edits go back through the write tools,
// which refresh the affected files afterwards.
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import type { LegendKeeper } from '@legendkeeper/sdk'
import type { Block } from '@legendkeeper/sdk/blocks'
import { blocksToMarkdown } from './markdown.js'

export const STYLE_TAG = 'claude-style'

export interface IndexEntry {
  id: string
  name: string
  aliases: string[]
  tags: string[]
  parentId: string | null
  hidden: boolean
  /** Hidden itself or under a hidden ancestor: keep out of player-facing answers. */
  playerHidden: boolean
  /** Path relative to the workspace root, e.g. legendkeeper/world/Places/Thornwick.md */
  file: string
}

export interface WorldIndex {
  projectId: string
  projectName: string
  pulledAt: string
  entries: IndexEntry[]
}

export interface PullResult {
  index: WorldIndex
  pages: number
  timelines: number
  skipped: string[]
  warnings: string[]
}

/** The fields of a resource the mirror needs; both list items and full resources fit. */
interface ResourceLike {
  id: string
  name: string
  parentId?: string | null
  tags: string[]
  aliases: string[]
  isHidden?: boolean
  updatedAt?: string | null
  documents: { id: string; name?: string | null; type?: string | null }[]
}

export class Workspace {
  constructor(readonly root: string) {}
  get base() { return join(this.root, 'legendkeeper') }
  get world() { return join(this.base, 'world') }
  get indexFile() { return join(this.base, '.state', 'index.json') }
  rel(path: string) { return relative(this.root, path).split('\\').join('/') }
  abs(rel: string) { return join(this.root, rel) }

  async readIndex(): Promise<WorldIndex | undefined> {
    try {
      return JSON.parse(await readFile(this.indexFile, 'utf8')) as WorldIndex
    } catch {
      return undefined
    }
  }

  async writeIndex(index: WorldIndex): Promise<void> {
    await mkdir(dirname(this.indexFile), { recursive: true })
    await writeFile(this.indexFile, JSON.stringify(index, null, 2))
    await writeFile(join(this.world, 'INDEX.md'), renderIndex(index, this))
  }
}

// ---------------------------------------------------------------------------
// Full pull
// ---------------------------------------------------------------------------

export async function pull(lk: LegendKeeper, ws: Workspace): Promise<PullResult> {
  const project = await lk.project()
  const items: ResourceLike[] = []
  for await (const item of await lk.resources.list({ limit: 100 })) items.push(item)

  const byId = new Map(items.map((item) => [item.id, item]))
  const nameOf = (id: string) => byId.get(id)?.name
  const files = assignFiles(items, byId, ws.world)
  const result: PullResult = {
    index: { projectId: project.id, projectName: project.name ?? 'Untitled project', pulledAt: new Date().toISOString(), entries: [] },
    pages: 0,
    timelines: 0,
    skipped: [],
    warnings: [],
  }

  // Write into a staging folder, then swap, so a failed pull never leaves half a mirror.
  const staging = `${ws.world}.pulling`
  await rm(staging, { recursive: true, force: true })
  await pool(items, 4, async (item) => {
    const ancestors = ancestry(item, byId)
    const rendered = await renderResource(lk, item, ancestors.map((a) => a.name), playerHidden(item, ancestors), nameOf)
    result.pages += rendered.pages
    result.timelines += rendered.timelines
    result.skipped.push(...rendered.skipped)
    result.warnings.push(...rendered.warnings)
    const target = join(staging, relative(ws.world, files.get(item.id)!))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, rendered.text)
  })

  result.index.entries = items.map((item) =>
    entryFor(item, ws.rel(files.get(item.id)!), playerHidden(item, ancestry(item, byId))))
  await mkdir(staging, { recursive: true })
  await rm(ws.world, { recursive: true, force: true })
  await rename(staging, ws.world)
  await ws.writeIndex(result.index)
  return result
}

// ---------------------------------------------------------------------------
// Refresh after a write
// ---------------------------------------------------------------------------

/** Re-renders the given resources into the mirror and updates the index. No-op without a mirror. */
export async function refresh(lk: LegendKeeper, ws: Workspace, resourceIds: string[]): Promise<string[]> {
  const index = await ws.readIndex()
  if (!index) return []
  const byId = new Map(index.entries.map((entry) => [entry.id, entry]))
  const written: string[] = []

  for (const id of resourceIds) {
    const resource = await lk.resources.get({ resourceId: id })
    const existing = byId.get(id)
    let file = existing?.file
    if (!file) {
      const parent = resource.parentId ? byId.get(resource.parentId) : undefined
      const dir = parent ? ws.abs(parent.file.replace(/\.md$/, '')) : ws.world
      let candidate = join(dir, `${safeName(resource.name)}.md`)
      if (existsSync(candidate)) candidate = join(dir, `${safeName(resource.name)} (${id.slice(-6)}).md`)
      file = ws.rel(candidate)
    }
    const ancestors = chain({ ...entryFor(resource, file, false) }, byId)
    const entry = entryFor(resource, file, playerHidden(resource, ancestors))
    byId.set(id, entry)
    const rendered = await renderResource(lk, resource, ancestors.map((e) => e.name), entry.playerHidden, (rid) => byId.get(rid)?.name)
    await mkdir(dirname(ws.abs(file)), { recursive: true })
    await writeFile(ws.abs(file), rendered.text)
    written.push(file)
  }

  index.entries = [...byId.values()]
  await ws.writeIndex(index)
  return written
}

// ---------------------------------------------------------------------------
// Rendering one resource
// ---------------------------------------------------------------------------

interface Rendered {
  text: string
  pages: number
  timelines: number
  skipped: string[]
  warnings: string[]
}

async function renderResource(
  lk: LegendKeeper,
  item: ResourceLike,
  path: string[],
  hiddenFromPlayers: boolean,
  nameOf: (id: string) => string | undefined,
): Promise<Rendered> {
  const out: Rendered = { text: '', pages: 0, timelines: 0, skipped: [], warnings: [] }
  const sections: string[] = []
  const documents: { id: string; name: string | null; type: string | null; hidden: boolean; version?: string }[] = []
  const hiddenTabs = new Set<string>()
  // List items are unreliable for older projects: their documents can be missing or have a
  // null type. The full resource is authoritative, so read tabs (and their flags) from it.
  let tabs = item.documents

  try {
    const full = await lk.resources.get({ resourceId: item.id })
    tabs = [...full.documents].sort((a, b) => ((a.rank ?? '') < (b.rank ?? '') ? -1 : (a.rank ?? '') > (b.rank ?? '') ? 1 : 0))
    for (const doc of full.documents) if (doc.isHidden) hiddenTabs.add(doc.id)
    const properties = (full.properties ?? []) as unknown as Block[]
    if (properties.length) {
      sections.push(`## Sidebar\n\n${blocksToMarkdown([{ kind: 'infobox', rows: properties } as Block], { nameOf }).trim()}`)
    }
  } catch (error) {
    out.warnings.push(`${item.name} (resource): ${(error as Error).message}`)
  }
  const pageCount = tabs.filter((d) => d.type === 'page').length

  for (const doc of tabs) {
    const ref = { resourceId: item.id, documentId: doc.id }
    const tabHidden = hiddenTabs.has(doc.id)
    const summary = { id: doc.id, name: doc.name ?? null, type: doc.type ?? null, hidden: tabHidden }
    const heading = (label: string) => {
      const name = doc.name ?? 'Untitled'
      return `## ${name.toLowerCase() === label.toLowerCase() ? label : `${label}: ${name}`}${tabHidden ? ' [GM only]' : ''}`
    }
    try {
      if (doc.type === 'page') {
        const content = await lk.documents.getBlocks(ref)
        documents.push({ ...summary, version: content.version })
        const body = blocksToMarkdown(content.blocks, { nameOf }).trim()
        sections.push(pageCount > 1 || tabHidden ? `${heading('Tab')}\n\n${body}` : body)
        out.pages++
      } else if (doc.type === 'time') {
        documents.push(summary)
        sections.push(await renderTimeline(lk, ref, heading('Timeline'), nameOf))
        out.timelines++
      } else {
        documents.push(summary)
        if (doc.type && doc.type !== 'blank') out.skipped.push(`${item.name} / ${doc.name} (${doc.type})`)
      }
    } catch (error) {
      out.warnings.push(`${item.name} / ${doc.name}: ${(error as Error).message}`)
    }
  }

  const front = {
    id: item.id,
    name: item.name,
    path,
    tags: item.tags,
    aliases: item.aliases,
    hidden: Boolean(item.isHidden),
    playerHidden: hiddenFromPlayers,
    updatedAt: item.updatedAt ?? null,
    documents,
  }
  out.text = `${frontmatter(front)}\n# ${item.name}\n\n${sections.filter(Boolean).join('\n\n')}\n`
  return out
}

async function renderTimeline(
  lk: LegendKeeper,
  ref: { resourceId: string; documentId: string },
  heading: string,
  nameOf: (id: string) => string | undefined,
): Promise<string> {
  const lanes = new Map((await lk.timelines.listLanes(ref)).data.map((lane) => [lane.id, lane.name]))
  const lines = [heading, '']
  for await (const event of await lk.timelines.listEvents(ref, { limit: 100 })) {
    const when = event.formattedEnd ? `${event.formattedStart} – ${event.formattedEnd}` : event.formattedStart
    const link = /^lk:\/\/resources\/([^/]+)/.exec(event.uri ?? '')?.[1]
    const linked = link && nameOf(link) ? ` → [[${nameOf(link)}]]` : ''
    const flags = [event.type === 'note' ? 'note' : '', event.isHidden ? 'hidden' : ''].filter(Boolean)
    lines.push(`- **${when ?? '?'}** ${event.name ?? '(untitled)'}${linked} — lane: ${lanes.get(event.laneId) ?? '?'}${flags.length ? ` (${flags.join(', ')})` : ''}`)
  }
  if (lines.length === 2) lines.push('_No events._')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entryFor(item: ResourceLike, file: string, hiddenFromPlayers: boolean): IndexEntry {
  return {
    id: item.id,
    name: item.name,
    aliases: item.aliases,
    tags: item.tags,
    parentId: item.parentId ?? null,
    hidden: Boolean(item.isHidden),
    playerHidden: hiddenFromPlayers,
    file,
  }
}

function playerHidden(item: { isHidden?: boolean }, ancestors: { isHidden?: boolean; hidden?: boolean }[]): boolean {
  return Boolean(item.isHidden) || ancestors.some((a) => a.isHidden || a.hidden)
}

function ancestry(item: ResourceLike, byId: Map<string, ResourceLike>): ResourceLike[] {
  const out: ResourceLike[] = []
  const seen = new Set<string>([item.id])
  let cursor = item.parentId ? byId.get(item.parentId) : undefined
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    out.unshift(cursor)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return out
}

function chain(entry: IndexEntry, byId: Map<string, IndexEntry>): IndexEntry[] {
  const out: IndexEntry[] = []
  const seen = new Set<string>([entry.id])
  let cursor = entry.parentId ? byId.get(entry.parentId) : undefined
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    out.unshift(cursor)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return out
}

/** Mirrors the sidebar tree: a page lives at <parent folder>/<Name>.md, its children in <Name>/. */
function assignFiles(items: ResourceLike[], byId: Map<string, ResourceLike>, root: string): Map<string, string> {
  const files = new Map<string, string>()
  const used = new Set<string>()
  const visiting = new Set<string>()

  const fileFor = (item: ResourceLike): string => {
    const done = files.get(item.id)
    if (done) return done
    visiting.add(item.id)
    const parent = item.parentId ? byId.get(item.parentId) : undefined
    const dir = parent && !visiting.has(parent.id) ? fileFor(parent).replace(/\.md$/, '') : root
    let stem = safeName(item.name)
    if (used.has(join(dir, stem).toLowerCase())) stem = `${stem} (${item.id.slice(-6)})`
    used.add(join(dir, stem).toLowerCase())
    const file = join(dir, `${stem}.md`)
    files.set(item.id, file)
    visiting.delete(item.id)
    return file
  }
  for (const item of items) fileFor(item)
  return files
}

export function safeName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^\.+/, '').trim().slice(0, 80)
  return cleaned || 'Untitled'
}

function frontmatter(data: Record<string, unknown>): string {
  // JSON values are valid YAML, which keeps quoting simple and safe.
  return `---\n${Object.entries(data).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n`
}

function renderIndex(index: WorldIndex, ws: Workspace): string {
  const rows = [...index.entries]
    .sort((a, b) => a.file.localeCompare(b.file))
    .map((e) => {
      const link = relative(ws.world, ws.abs(e.file)).split('\\').join('/').replace(/ /g, '%20')
      const extra = [
        e.aliases.length ? `aka ${e.aliases.join(', ')}` : '',
        e.tags.length ? `tags: ${e.tags.join(', ')}` : '',
        e.hidden ? 'HIDDEN' : e.playerHidden ? 'hidden (parent)' : '',
      ].filter(Boolean).join(' · ')
      return `- [${e.name}](${link})${extra ? ` — ${extra}` : ''}`
    })
  const style = index.entries.find((e) => e.tags.includes(STYLE_TAG))
  return [
    `# ${index.projectName}`,
    '',
    `Pulled ${index.pulledAt}. ${index.entries.length} resources.`,
    style ? `Style guide: [${style.name}](${relative(ws.world, ws.abs(style.file)).split('\\').join('/').replace(/ /g, '%20')})` : `Style guide: none yet. Tag a hidden page "${STYLE_TAG}".`,
    '',
    ...rows,
    '',
  ].join('\n')
}

async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]!)
  }))
}
