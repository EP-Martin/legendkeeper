// Creates pages, plain or from the world's LegendKeeper templates, in one retry-safe call.
import type { LegendKeeper } from '@legendkeeper/sdk'
import type { Block } from '@legendkeeper/sdk/blocks'
import { digest, idempotencyKey, isDuplicate, stableId } from './ids.js'
import { markdownToBlocks } from './markdown.js'
import type { Workspace } from './mirror.js'
import { buildResolver } from './resolve.js'

export interface PageInput {
  name: string
  parent?: string
  template?: string
  tags: string[]
  aliases: string[]
  hidden: boolean
  markdown: string
  tabs: { name: string; markdown: string; hidden: boolean }[]
  sidebar: Record<string, string>
}

interface Tab { name: string; hidden: boolean; blocks: Block[] }

interface Prepared {
  id: string
  name: string
  parentId?: string
  templateId?: string
  tags: string[]
  aliases: string[]
  hidden: boolean
  tabs: Tab[] // the first is the main tab
  sidebar: Record<string, Block[]>
}

const CHUNK = 25
const PLACEHOLDER = 'New page'

export async function createPages(lk: LegendKeeper, ws: Workspace, pages: PageInput[], dryRun: boolean) {
  const projectId = (await lk.project()).id
  const batch = digest(projectId, JSON.stringify(pages))
  const warnings: string[] = []

  const ids = new Map<string, string>()
  for (const page of pages) {
    const key = page.name.trim().toLowerCase()
    if (ids.has(key)) throw new Error(`Two pages in the batch are named "${page.name}".`)
    ids.set(key, stableId('r', batch, key))
    for (const alias of page.aliases) ids.set(alias.trim().toLowerCase(), ids.get(key)!)
  }

  const templates = new Map<string, string>()
  if (pages.some((p) => p.template)) {
    for await (const t of await lk.templates.list({ limit: 100 })) templates.set(t.name.trim().toLowerCase(), t.id)
  }

  const sources = pages.flatMap((p) => [p.markdown, ...p.tabs.map((t) => t.markdown), ...Object.values(p.sidebar)])
  const { resolve, ambiguous } = await buildResolver(lk, ws, sources, ids)
  const convert = (where: string, markdown: string) => {
    const result = markdownToBlocks(markdown, { resolve })
    warnings.push(...result.warnings.map((w) => `${where}: ${w}`))
    return result.blocks
  }

  const prepared: Prepared[] = pages.map((page) => {
    let templateId: string | undefined
    if (page.template) {
      templateId = templates.get(page.template.trim().toLowerCase())
      if (!templateId) throw new Error(`No template named "${page.template}". Templates: ${[...templates.keys()].join(', ') || 'none'}.`)
    }
    let parentId: string | undefined
    if (page.parent) {
      parentId = resolve(page.parent)
      if (!parentId) throw new Error(`Parent "${page.parent}" of "${page.name}" was not found. Pull the mirror or create the parent in this batch.`)
    }
    if (!templateId && Object.keys(page.sidebar).length) warnings.push(`${page.name}: sidebar values need a template; ignored.`)
    return {
      id: ids.get(page.name.trim().toLowerCase())!,
      name: page.name.trim(),
      ...(parentId ? { parentId } : {}),
      ...(templateId ? { templateId } : {}),
      tags: page.tags,
      aliases: page.aliases,
      hidden: page.hidden,
      tabs: [
        { name: 'Main', hidden: false, blocks: convert(page.name, page.markdown) },
        ...page.tabs.map((t) => ({ name: t.name.trim(), hidden: t.hidden, blocks: convert(`${page.name} / ${t.name}`, t.markdown) })),
      ],
      sidebar: Object.fromEntries(Object.entries(page.sidebar).map(([k, v]) => [k, convert(`${page.name} / sidebar ${k}`, v)])),
    }
  })
  if (ambiguous.length) warnings.push(`Ambiguous names left as plain text (several pages match): ${[...new Set(ambiguous)].join(', ')}`)

  const sorted = parentsFirst(prepared)
  if (dryRun) {
    return {
      dryRun: true,
      pages: sorted.map((p) => ({
        name: p.name,
        template: p.templateId ? pages.find((q) => q.name.trim() === p.name)!.template : undefined,
        tabs: p.tabs.map((t) => (t.hidden ? `${t.name} (hidden)` : t.name)),
        parent: p.parentId ?? null,
      })),
      warnings,
    }
  }

  const created: { id: string; name: string }[] = []
  const existing: { id: string; name: string }[] = []
  // Plain pages go in createMany chunks; a template page is its own request. Parents sort first.
  let run: Prepared[] = []
  const flush = async () => {
    for (let i = 0; i < run.length; i += CHUNK) await createChunk(lk, projectId, run.slice(i, i + CHUNK), created, existing)
    run = []
  }
  for (const page of sorted) {
    if (!page.templateId) {
      run.push(page)
      continue
    }
    await flush()
    await createFromTemplate(lk, page, created, existing)
  }
  await flush()

  // Hidden tabs (and template pages' content) are written once the page exists and is hidden.
  for (const page of sorted) {
    if (page.templateId) await fillTemplatePage(lk, page)
    else await addHiddenTabs(lk, page)
  }
  return { created, existing, warnings }
}

function parentsFirst(pages: Prepared[]): Prepared[] {
  const byId = new Map(pages.map((p) => [p.id, p]))
  const sorted: Prepared[] = []
  const visit = (p: Prepared, seen = new Set<string>()) => {
    if (sorted.includes(p)) return
    if (seen.has(p.id)) throw new Error(`Page "${p.name}" and its parent form a cycle.`)
    seen.add(p.id)
    const parent = p.parentId ? byId.get(p.parentId) : undefined
    if (parent) visit(parent, seen)
    sorted.push(p)
  }
  for (const p of pages) visit(p)
  return sorted
}

async function createChunk(
  lk: LegendKeeper, projectId: string, pages: Prepared[],
  created: { id: string; name: string }[], existing: { id: string; name: string }[],
) {
  let chunk = pages
  for (let attempt = 0; chunk.length > 0; attempt++) {
    const resources = chunk.map((p) => ({
      id: p.id,
      name: p.name,
      ...(p.parentId ? { parentId: p.parentId } : {}),
      tags: p.tags,
      aliases: p.aliases,
      isHidden: p.hidden,
      // A create can't hide a tab, so hidden tabs are added afterwards (addHiddenTabs).
      documents: p.tabs.filter((t) => !t.hidden).map((t) => ({ name: t.name, type: 'page' as const, blocks: t.blocks })),
    }))
    try {
      const result = await lk.resources.createMany({ resources, idempotencyKey: idempotencyKey(projectId, JSON.stringify(resources)) })
      created.push(...result.resources.map((r) => ({ id: r.id, name: r.name })))
      return
    } catch (error) {
      // Pages from an earlier, interrupted run of this same call already exist. Skip them.
      if (!isDuplicate(error) || attempt >= 2) throw error
      const dupes = new Set(((error as { errors?: { path: string }[] }).errors ?? [])
        .map((e) => /^resources\[(\d+)\]/.exec(e.path)?.[1]).filter((n): n is string => n !== undefined).map(Number))
      if (dupes.size === 0) throw error
      existing.push(...chunk.filter((_, j) => dupes.has(j)).map((p) => ({ id: p.id, name: p.name })))
      chunk = chunk.filter((_, j) => !dupes.has(j))
    }
  }
}

async function createFromTemplate(
  lk: LegendKeeper, page: Prepared,
  created: { id: string; name: string }[], existing: { id: string; name: string }[],
) {
  try {
    // Copy under a placeholder name, then name and hide it in one update before any content
    // goes in, so a hidden page's name and notes are never visible to players.
    await lk.resources.createFromTemplate({
      templateId: page.templateId!, id: page.id, name: PLACEHOLDER, ...(page.parentId ? { parentId: page.parentId } : {}),
    })
    created.push({ id: page.id, name: page.name })
  } catch (error) {
    if (!isDuplicate(error)) throw error
    existing.push({ id: page.id, name: page.name })
  }
  await lk.resources.update({ resourceId: page.id }, {
    name: page.name, isHidden: page.hidden, aliases: page.aliases, ...(page.tags.length ? { tags: page.tags } : {}),
  })
}

/** Fills a template copy: the main tab, named tabs, and sidebar text fields. Idempotent. */
async function fillTemplatePage(lk: LegendKeeper, page: Prepared) {
  const resource = await lk.resources.get({ resourceId: page.id })
  const tabs = [...resource.documents].sort((a, b) => ((a.rank ?? '') < (b.rank ?? '') ? -1 : 1))
  const pageTabs = tabs.filter((d) => d.type === 'page')
  const byName = new Map(pageTabs.map((d) => [d.name?.toLowerCase() ?? '', d]))
  const used = new Set<string>()

  for (const [i, tab] of page.tabs.entries()) {
    // The main tab fills the template's first page tab, whatever it is called ("Overview").
    let doc = i === 0 && !byName.has('main') ? pageTabs[0] : byName.get(tab.name.toLowerCase())
    if (doc && tab.hidden && !doc.isHidden) await lk.documents.update({ resourceId: page.id, documentId: doc.id }, { isHidden: true })
    if (!doc) doc = await lk.documents.create({ resourceId: page.id }, { name: tab.name, type: 'page', isHidden: tab.hidden })
    await lk.documents.replaceBlocks({ resourceId: page.id, documentId: doc.id }, { blocks: tab.blocks })
    used.add(doc.id)
  }
  // Unfilled page tabs hold the template's instructions, not lore. Map and timeline tabs stay.
  for (const doc of pageTabs) {
    if (!used.has(doc.id)) await lk.documents.delete({ resourceId: page.id, documentId: doc.id })
  }

  const wanted = new Map(Object.entries(page.sidebar).map(([k, v]) => [k.trim().toLowerCase(), v]))
  if (wanted.size === 0) return
  for (const property of (await lk.properties.list({ resourceId: page.id })).data) {
    const title = (property as { title?: string }).title?.trim().toLowerCase()
    const blocks = title ? wanted.get(title) : undefined
    if (!blocks || property.kind !== 'textField') continue
    await lk.properties.update({ resourceId: page.id, propertyId: property.id! }, { children: blocks })
  }
}

async function addHiddenTabs(lk: LegendKeeper, page: Prepared) {
  const hidden = page.tabs.filter((t) => t.hidden)
  if (hidden.length === 0) return
  const present = new Set((await lk.resources.get({ resourceId: page.id })).documents.map((d) => d.name?.toLowerCase()))
  for (const tab of hidden) {
    if (present.has(tab.name.toLowerCase())) continue // added by an earlier run of this call
    const doc = await lk.documents.create({ resourceId: page.id }, { name: tab.name, type: 'page', isHidden: true })
    await lk.documents.replaceBlocks({ resourceId: page.id, documentId: doc.id }, { blocks: tab.blocks })
  }
}
