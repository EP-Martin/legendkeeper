// Corrects an existing page: replaces a section or a whole tab, sets sidebar fields, and updates
// or deletes timeline events. Every text replacement names the text it expects to replace, so a
// page edited in LegendKeeper since the last pull is never overwritten blindly.
import type { LegendKeeper } from '@legendkeeper/sdk'
import type { Block } from '@legendkeeper/sdk/blocks'
import { writeSidebar } from './create.js'
import { digest, stableId } from './ids.js'
import { prepareImages } from './images.js'
import { blocksToMarkdown, markdownToBlocks } from './markdown.js'
import type { Workspace } from './mirror.js'
import { buildResolver } from './resolve.js'
import { laneFinder } from './timeline.js'

export interface SectionEdit {
  tab?: string
  section?: string
  old: string
  markdown: string
}

export interface EventEdit {
  event: string
  name?: string
  lane?: string
  start?: string
  end?: string
  link?: string
  hidden?: boolean
  color?: string
  delete?: boolean
}

export interface EditInput {
  page: string
  sections: SectionEdit[]
  sidebar: Record<string, string>
  timeline?: string
  events: EventEdit[]
  dryRun: boolean
}

type IdBlock = Block & { id?: string }

// ---------------------------------------------------------------------------
// Planning a section replacement (pure, so it can be tested without the API)
// ---------------------------------------------------------------------------

export type SectionPlan =
  | { done: true }
  | { done: false; replaceAll: true }
  | { done: false; replaceAll: false; inserts: { block: IdBlock; after: string }[]; deletes: string[] }

/** Whitespace-insensitive comparison, so Markdown copied from the mirror matches what's live. */
export const sameText = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()

const headingText = (block: Block, render: (b: Block[]) => string) => render([block]).replace(/^#+\s*/, '').trim()

/**
 * Plans replacing the body of `section` (the blocks under that heading, up to the next heading of
 * the same or a higher level), or the whole tab when there's no section. `newBlocks` carry ids
 * derived from the call, so a retry recognizes blocks it already inserted.
 */
export function planSection(
  current: readonly IdBlock[],
  edit: { section?: string; old: string },
  newBlocks: readonly IdBlock[],
  render: (blocks: Block[]) => string,
): SectionPlan {
  let body: IdBlock[]
  let anchor: IdBlock | undefined
  if (edit.section) {
    const wanted = edit.section.replace(/^#+\s*/, '').trim().toLowerCase()
    const headings = current.map((b, i) => ({ b, i })).filter(({ b }) => b.kind === 'heading')
    const matches = headings.filter(({ b }) => headingText(b, render).toLowerCase() === wanted)
    if (matches.length === 0) {
      const names = headings.map(({ b }) => `"${headingText(b, render)}"`).join(', ')
      throw new Error(`No section "${edit.section}". Sections in this tab: ${names || 'none'}.`)
    }
    if (matches.length > 1) throw new Error(`${matches.length} sections are named "${edit.section}"; replace the whole tab instead.`)
    const { b: heading, i: start } = matches[0]!
    const level = (heading as { level: number }).level
    let end = start + 1
    while (end < current.length && !(current[end]!.kind === 'heading' && (current[end] as { level: number }).level <= level)) end++
    const stray = newBlocks.find((b) => b.kind === 'heading' && (b as { level: number }).level <= level)
    if (stray) throw new Error(`The new text of "${edit.section}" has a heading of level ${(stray as { level: number }).level}, which would start a new section. Use deeper headings, or replace the whole tab.`)
    anchor = heading
    body = current.slice(start + 1, end)
  } else {
    body = [...current]
  }

  const ours = new Set(newBlocks.map((b) => b.id))
  const rest = body.filter((b) => !ours.has(b.id))
  const restText = render(rest)
  if (restText.includes('<!-- lk:')) {
    throw new Error(`${edit.section ? `Section "${edit.section}"` : 'This tab'} holds content the API can't read or write (${restText.match(/<!-- lk:[^>]*-->/)![0]}). Edit it in LegendKeeper, or replace a smaller section.`)
  }
  const oursPresent = body.length - rest.length
  if (rest.length === 0 && oursPresent === newBlocks.length) return { done: true }
  if (oursPresent === 0 && sameText(restText, render([...newBlocks]))) return { done: true }
  if (rest.length > 0 && !sameText(restText, edit.old)) {
    throw new Error(`${edit.section ? `Section "${edit.section}"` : 'The tab'} no longer matches \`old\`; it may have been edited in LegendKeeper. Pull again and recheck the edit. Current text:\n\n${restText.trim()}`)
  }
  if (!anchor) return { done: false, replaceAll: true }

  const inserts: { block: IdBlock; after: string }[] = []
  const present = new Set(body.map((b) => b.id))
  let prev = anchor.id!
  for (const block of newBlocks) {
    if (!present.has(block.id)) inserts.push({ block, after: prev })
    prev = block.id!
  }
  return { done: false, replaceAll: false, inserts, deletes: rest.map((b) => b.id!) }
}

// ---------------------------------------------------------------------------
// Applying edits
// ---------------------------------------------------------------------------

export async function editPage(lk: LegendKeeper, ws: Workspace, input: EditInput) {
  const sources = [...input.sections.map((s) => s.markdown), ...Object.values(input.sidebar), `[[${input.page}]]`,
    ...input.events.flatMap((e) => (e.link ? [`[[${e.link}]]`] : []))]
  const { resolve, ambiguous } = await buildResolver(lk, ws, sources)
  const resourceId = resolve(input.page)
  if (!resourceId) throw new Error(`Page "${input.page}" was not found.`)
  const resource = await lk.resources.get({ resourceId })
  const index = await ws.readIndex()
  const names = new Map(index?.entries.map((e) => [e.id, e.name]))
  const render = (blocks: Block[]) => blocksToMarkdown(blocks, { nameOf: (id) => names.get(id) })

  const warnings: string[] = []
  const images = await prepareImages(lk, ws.root, sources, input.dryRun)
  warnings.push(...images.warnings)
  const convert = (where: string, markdown: string) => {
    const result = markdownToBlocks(markdown, { resolve, image: images.image })
    warnings.push(...result.warnings.map((w) => `${where}: ${w}`))
    return result.blocks
  }

  // Sections: check every edit before writing any, so a stale one stops the whole call.
  const tabs = resource.documents.filter((d) => d.type === 'page' || d.type === 'blank')
  const seen = new Set<string>()
  const sections = input.sections.map((edit) => {
    const doc = edit.tab ? tabs.find((d) => d.name?.toLowerCase() === edit.tab!.trim().toLowerCase()) : tabs[0]
    if (!doc) throw new Error(`"${resource.name}" has no page tab${edit.tab ? ` named "${edit.tab}"` : ''}. Tabs: ${tabs.map((d) => d.name).join(', ')}.`)
    const where = `${doc.name}${edit.section ? ` / ${edit.section}` : ''}`
    const key = `${doc.id}\u0000${(edit.section ?? '').trim().toLowerCase()}`
    if (seen.has(key)) throw new Error(`Two edits replace ${where}; merge them into one.`)
    seen.add(key)
    const call = digest(resourceId, doc.id, edit.section ?? '', edit.markdown)
    const blocks = convert(`${resource.name} / ${where}`, edit.markdown).map((b, i) => ({ ...b, id: stableId('b', call, String(i)) }))
    return { edit, doc, where, blocks }
  })
  const planned = []
  for (const s of sections) {
    const ref = { resourceId, documentId: s.doc.id }
    if (s.doc.type === 'blank') {
      if (s.edit.section) throw new Error(`${s.doc.name} is empty, so it has no section "${s.edit.section}".`)
      planned.push({ ...s, ref, plan: s.blocks.length ? { done: false, replaceAll: true } as SectionPlan : { done: true } as SectionPlan })
      continue
    }
    const current = await lk.documents.getBlocks(ref)
    planned.push({ ...s, ref, plan: planSection(current.blocks as IdBlock[], s.edit, s.blocks, render) })
  }

  // Events: match every edit to one event before writing.
  const eventEdits = input.events.length ? await matchEvents(lk, resourceId, resource, input, resolve, warnings) : undefined
  const sidebar = Object.fromEntries(Object.entries(input.sidebar).map(([k, v]) => [k, convert(`${resource.name} / sidebar ${k}`, v)]))
  if (ambiguous.length) warnings.push(`Ambiguous names left as plain text (several pages match): ${[...new Set(ambiguous)].join(', ')}`)

  if (input.dryRun) {
    return {
      dryRun: true,
      page: resource.name,
      sections: planned.map((p) => `${p.where}: ${p.plan.done ? 'already says this' : 'would be replaced'}`),
      sidebar: Object.keys(sidebar).length ? Object.keys(sidebar) : undefined,
      events: eventEdits?.map((e) => `${e.label}: ${e.edit.delete ? 'would be deleted' : 'would be updated'}`),
      warnings,
    }
  }

  const sectionResults: string[] = []
  for (const p of planned) {
    if (p.plan.done) {
      sectionResults.push(`${p.where}: already up to date`)
      continue
    }
    if (p.plan.replaceAll) {
      await lk.documents.replaceBlocks(p.ref, { blocks: p.blocks })
    } else {
      // Insert the new blocks first, then delete the old ones, so an interrupted call leaves the
      // new text in place and a retry only finishes the deletes.
      let { version } = await lk.documents.getBlocks(p.ref)
      for (const { block, after } of p.plan.inserts) version = (await lk.blocks.insert(p.ref, { block, after, ifMatch: version })).version
      // A delete returns no version; each names its own block, so it needs no version guard.
      for (const blockId of p.plan.deletes) await lk.blocks.delete({ ...p.ref, blockId })
    }
    sectionResults.push(`${p.where}: replaced`)
  }

  if (Object.keys(sidebar).length) await writeSidebar(lk, { id: resourceId, name: resource.name, sidebar }, warnings)

  const eventResults: string[] = []
  for (const e of eventEdits ?? []) {
    if (e.edit.delete) {
      await lk.timelines.deleteEvent({ ...e.ref, eventId: e.id })
      eventResults.push(`${e.label}: deleted`)
      continue
    }
    await lk.timelines.updateEvent({ ...e.ref, eventId: e.id }, { ...e.patch, ...(e.edit.lane ? { laneId: await e.laneFor(e.edit.lane) } : {}) })
    eventResults.push(`${e.label}: updated`)
  }

  return { page: resource.name, resourceId, sections: sectionResults, sidebar: Object.keys(sidebar), events: eventResults, warnings }
}

async function matchEvents(
  lk: LegendKeeper, resourceId: string, resource: Awaited<ReturnType<LegendKeeper['resources']['get']>>, input: EditInput,
  resolve: (name: string) => string | undefined, warnings: string[],
) {
  const named = (d: { name?: string | null }) => !input.timeline || d.name?.toLowerCase() === input.timeline.trim().toLowerCase()
  const doc = resource.documents.find((d) => d.type === 'time' && named(d))
  if (!doc) throw new Error(`"${resource.name}" has no timeline tab${input.timeline ? ` named "${input.timeline}"` : ''}.`)
  const ref = { resourceId, documentId: doc.id }
  const events: { id: string; name?: string; formattedStart?: string }[] = []
  for await (const event of await lk.timelines.listEvents(ref, { limit: 100 })) events.push(event)
  const { laneFor } = await laneFinder(lk, ref, input.dryRun)

  const out = []
  for (const edit of input.events) {
    const key = edit.event.trim().toLowerCase()
    const matches = events.filter((e) => e.id === edit.event.trim() || e.name?.trim().toLowerCase() === key)
    if (matches.length > 1) {
      throw new Error(`${matches.length} events are named "${edit.event}": ${matches.map((m) => `${m.id} (${m.formattedStart})`).join(', ')}. Name one by its id.`)
    }
    if (matches.length === 0) {
      // A rename or delete that finds nothing was most likely finished by an earlier run of this call.
      const renamed = edit.name && events.filter((e) => e.name?.trim().toLowerCase() === edit.name!.trim().toLowerCase())
      if (renamed && renamed.length === 1) {
        matches.push(renamed[0]!)
      } else if (edit.delete) {
        warnings.push(`Event "${edit.event}" not found; nothing to delete (already deleted?).`)
        continue
      } else {
        throw new Error(`No event named "${edit.event}" on ${resource.name} / ${doc.name}.`)
      }
    }
    let uri: string | undefined
    if (edit.link !== undefined) {
      const linkId = edit.link.trim() ? resolve(edit.link) : undefined
      if (edit.link.trim() && !linkId) throw new Error(`Event "${edit.event}": link "${edit.link}" was not found.`)
      uri = linkId ? `lk://resources/${linkId}` : ''
    }
    const patch = {
      ...(edit.name ? { name: edit.name } : {}),
      ...(edit.start ? { formattedStart: edit.start } : {}),
      ...(edit.end ? { formattedEnd: edit.end } : {}),
      ...(uri !== undefined ? { uri } : {}),
      ...(edit.hidden !== undefined ? { isHidden: edit.hidden } : {}),
      ...(edit.color ? { color: edit.color } : {}),
    }
    out.push({ edit, id: matches[0]!.id, label: matches[0]!.name ?? edit.event, ref, patch, laneFor })
  }
  return out
}
