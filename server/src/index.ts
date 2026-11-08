#!/usr/bin/env node
// MCP server for the LegendKeeper plugin. Stdio transport; one project per API key.
import { ConnectionError, LegendKeeper, LegendKeeperError } from '@legendkeeper/sdk'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createPages } from './create.js'
import { editPage } from './edit.js'
import { readDrafts } from './drafts.js'
import { prepareImages } from './images.js'
import { clientFetch, digest, isDuplicate, stableId } from './ids.js'
import { markdownToBlocks } from './markdown.js'
import { pull, refresh, STYLE_TAG, Workspace } from './mirror.js'
import { buildResolver as resolverFor } from './resolve.js'
import { laneFinder } from './timeline.js'

const VERSION = '0.1.0'
const apiKey = process.env.LEGENDKEEPER_API_KEY?.trim()
// Hosts that cannot substitute ${CLAUDE_PROJECT_DIR} pass it through literally; fall back to cwd.
const workspaceEnv = process.env.LEGENDKEEPER_WORKSPACE?.trim()
const ws = new Workspace(workspaceEnv && !workspaceEnv.includes('${') ? workspaceEnv : process.cwd())
// Large batch writes can take well over the SDK's default 30 s per attempt.
const lk = apiKey ? new LegendKeeper({ apiKey, maxRetries: 4, timeoutMs: 120_000, fetch: clientFetch() }) : undefined

const server = new McpServer({ name: 'legendkeeper', version: VERSION })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

function client(): LegendKeeper {
  if (!lk) throw new Error('No API key. Set the plugin\'s "LegendKeeper API key" option (Project Settings → Developers → API Keys in LegendKeeper).')
  return lk
}

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] }
}

const RETRY_HINT = 'The write may have completed on the server. Every write tool is safe to call again with exactly the same input: work already done is recognized and skipped.'

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn())
  } catch (error) {
    if (error instanceof LegendKeeperError) {
      const uncertain = error.code === 'IN_PROGRESS' || (error.status >= 500 && error.status !== 501)
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({
          status: error.status, code: error.code, message: error.message, errors: error.errors, requestId: error.requestId,
          ...(uncertain ? { hint: RETRY_HINT } : {}),
        }, null, 2) }],
      }
    }
    const hint = error instanceof ConnectionError ? ` ${RETRY_HINT}` : ''
    return { isError: true, content: [{ type: 'text', text: (error as Error).message + hint }] }
  }
}

const buildResolver = (sources: string[]) => resolverFor(client(), ws, sources)

// ---------------------------------------------------------------------------
// Tools: reading
// ---------------------------------------------------------------------------

server.registerTool('lk_status', {
  title: 'LegendKeeper status',
  description: 'Shows the connected LegendKeeper project, the local mirror folder, when it was last pulled, the world\'s style guide page and its page templates. Call this first in a session.',
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, () => run(async () => {
  const index = await ws.readIndex()
  const project = lk ? await lk.project() : undefined
  const style = index?.entries.find((e) => e.tags.includes(STYLE_TAG))
  const templates = index?.entries.filter((e) => e.template && e.parentId === 'templates').map((e) => ({ name: e.name, file: e.file }))
  return {
    connected: Boolean(project),
    project: project ? { id: project.id, name: project.name } : null,
    workspace: ws.root,
    mirror: index
      ? { folder: ws.rel(ws.world), index: ws.rel(ws.world) + '/INDEX.md', pulledAt: index.pulledAt, resources: index.entries.length }
      : null,
    styleGuide: style ? { name: style.name, file: style.file } : null,
    templates: templates?.length ? templates : undefined,
    hint: !project ? 'Set the plugin API key option.' : !index ? 'Run lk_pull to build the local mirror.' : undefined,
  }
}))

server.registerTool('lk_pull', {
  title: 'Pull world into local mirror',
  description: `Downloads every resource in the project into Markdown files under legendkeeper/world/ (one file per page, folders follow the sidebar tree) with an INDEX.md listing names, aliases, tags and hidden pages. Replaces the previous mirror. Costs about two API reads per resource, so a large world takes minutes; pull at the start of a session, not before every question. Pages tagged "${STYLE_TAG}" are the style guide.`,
  inputSchema: {},
  annotations: { readOnlyHint: false, idempotentHint: true },
}, () => run(async () => {
  const result = await pull(client(), ws)
  return {
    project: result.index.projectName,
    resources: result.index.entries.length,
    pages: result.pages,
    timelines: result.timelines,
    index: ws.rel(ws.world) + '/INDEX.md',
    notMirrored: result.skipped.length ? result.skipped : undefined,
    warnings: result.warnings.length ? result.warnings : undefined,
  }
}))

server.registerTool('lk_search', {
  title: 'Search LegendKeeper',
  description: 'Live keyword search over page names, aliases and content. Use for fresh results or before a mirror exists; for questions and continuity checks, prefer reading the local mirror.',
  inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(100).default(20) },
  annotations: { readOnlyHint: true },
}, ({ query, limit }) => run(async () => {
  const hits = await client().search.search({ q: query, limit })
  return hits.data.map((hit) => ({
    id: hit.resource.id,
    name: hit.resource.name,
    path: (hit.resource.path ?? []).map((p) => p.name).join(' / '),
    tags: hit.resource.tags,
    match: hit.document ? { document: hit.document.name, passage: hit.document.highlights?.[0]?.segment } : 'name',
  }))
}))

// ---------------------------------------------------------------------------
// Tools: writing
// ---------------------------------------------------------------------------

const pageInput = z.object({
  name: z.string().min(1).describe('Page title.'),
  parent: z.string().optional().describe('Parent page: the name of an existing page, a resource id, or the name of another page in this batch. Omit for the top level.'),
  template: z.string().optional().describe('Name of a LegendKeeper template in this world (lk_status lists them) to build the page from. Its sidebar and map tabs are kept; its page tabs are filled from markdown and tabs, and unfilled ones are removed.'),
  tags: z.array(z.string()).default([]).describe('Tags. With a template, omit to keep the template\'s tags.'),
  aliases: z.array(z.string()).default([]).describe('Other names the page goes by; links and search match them.'),
  hidden: z.boolean().default(false).describe('Hide the whole page from players.'),
  markdown: z.string().describe('Body of the first tab (a template\'s first tab, e.g. "Overview", or "Main") in the plugin Markdown dialect (see the lk-style skill). Do not repeat the title as a heading. An image on its own line, ![alt](<workspace path>), is uploaded.'),
  tabs: z.array(z.object({
    name: z.string().min(1).describe('Tab name. With a template, use the template\'s tab names.'),
    markdown: z.string(),
    hidden: z.boolean().default(false).describe('Hide this tab from players, e.g. "GM Notes" or "Backstory".'),
  })).max(4).default([]).describe('Further page tabs after the first.'),
  sidebar: z.record(z.string(), z.string()).default({}).describe('Sidebar fields by title, e.g. {"Summary": "…", "Image": "![Portrait](<legendkeeper/sources/x/images/Mira.png>)"}. Fills a template\'s field of that title; any other title becomes a new field, in this order. A value that is only an image makes an image field.'),
})

server.registerTool('lk_create_pages', {
  title: 'Create pages',
  description: 'Creates up to 100 pages, plain or from the world\'s templates. Give either `drafts` (draft files in the lk-style draft format, or a drafts folder) or `pages`. [[Links]] between pages in the batch resolve, so create related NPCs, places and factions together. Run with dryRun first: it reports unresolved links and conversion warnings without writing anything. Safe to retry: calling again with the same input skips work already done.',
  inputSchema: {
    drafts: z.array(z.string().min(1)).min(1).max(100).optional().describe('Draft file paths relative to the workspace, or a folder of drafts (its append-- files are skipped), e.g. ["legendkeeper/drafts/2026-11-06-session-14"]. Each file is read as it is now.'),
    pages: z.array(pageInput).min(1).max(100).optional().describe('Pages given inline, when there are no draft files.'),
    dryRun: z.boolean().default(false),
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
}, ({ drafts, pages, dryRun }) => run(async () => {
  if (!drafts === !pages) throw new Error('Give either drafts or pages, not both.')
  const input = drafts ? await readDrafts(ws.root, drafts) : pages!
  if (input.length > 100) throw new Error(`${input.length} pages; send at most 100 per call, parents first.`)
  const result = await createPages(client(), ws, input, dryRun)
  if ('dryRun' in result) return result
  const mirrored = await refresh(client(), ws, [...result.created, ...result.existing].map((r) => r.id))
  return {
    created: result.created,
    alreadyExisted: result.existing.length ? result.existing : undefined,
    mirrored,
    warnings: result.warnings,
  }
}))

server.registerTool('lk_append_to_page', {
  title: 'Append to page',
  description: 'Adds Markdown to the end of an existing page without touching what is already there, for example a dated "Session 14" section. Each block is one write, so keep appends to a section at a time. Safe to retry: blocks already appended by the same call are skipped.',
  inputSchema: {
    page: z.string().describe('Page name, alias or resource id.'),
    markdown: z.string().min(1),
    document: z.string().optional().describe('Tab name, when the page has several page tabs. Defaults to the first.'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
}, ({ page, markdown, document }) => run(async () => {
  const { resolve } = await buildResolver([markdown, `[[${page}]]`])
  const resourceId = resolve(page)
  if (!resourceId) throw new Error(`Page "${page}" was not found.`)
  const resource = await client().resources.get({ resourceId })
  const docs = resource.documents.filter((d) => d.type === 'page' || d.type === 'blank')
  const doc = document ? docs.find((d) => d.name?.toLowerCase() === document.toLowerCase()) : docs[0]
  if (!doc) throw new Error(`"${resource.name}" has no page tab${document ? ` named "${document}"` : ''} to append to.`)

  const images = await prepareImages(client(), ws.root, [markdown], false)
  const parsed = markdownToBlocks(markdown, { resolve, image: images.image })
  parsed.warnings.unshift(...images.warnings)
  const ref = { resourceId, documentId: doc.id }
  const call = digest(resourceId, doc.id, markdown)
  const blocks = parsed.blocks.map((block, i) => ({ ...block, id: stableId('b', call, String(i)) }))
  let appended = 0
  if (doc.type === 'blank') {
    await client().documents.replaceBlocks(ref, { blocks })
    appended = blocks.length
  } else {
    const current = await client().documents.getBlocks(ref)
    const present = new Set(current.blocks.map((b) => b.id))
    let { version } = current
    for (const block of blocks) {
      if (present.has(block.id)) continue
      version = (await client().blocks.insert(ref, { block, ifMatch: version })).version
      appended++
    }
  }
  const mirrored = await refresh(client(), ws, [resourceId])
  return { page: resource.name, appended, alreadyAppended: blocks.length - appended || undefined, mirrored, warnings: parsed.warnings }
}))

server.registerTool('lk_update_page_info', {
  title: 'Update page info',
  description: 'Renames a page or changes its tags, aliases or hidden flag. Lists replace the current values, so send the full list. Does not change page content.',
  inputSchema: {
    page: z.string().describe('Page name, alias or resource id.'),
    name: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
    aliases: z.array(z.string()).optional(),
    hidden: z.boolean().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
}, ({ page, name, tags, aliases, hidden }) => run(async () => {
  const { resolve } = await buildResolver([`[[${page}]]`])
  const resourceId = resolve(page)
  if (!resourceId) throw new Error(`Page "${page}" was not found.`)
  const updated = await client().resources.update({ resourceId }, {
    ...(name ? { name } : {}), ...(tags ? { tags } : {}), ...(aliases ? { aliases } : {}),
    ...(hidden === undefined ? {} : { isHidden: hidden }),
  })
  const mirrored = await refresh(client(), ws, [resourceId])
  return { id: updated.id, name: updated.name, tags: updated.tags, aliases: updated.aliases, hidden: updated.isHidden, mirrored }
}))

server.registerTool('lk_add_timeline_events', {
  title: 'Add timeline events',
  description: 'Adds events to a timeline, creating the timeline tab and any missing lanes by name. Safe to retry: events already added by the same call are skipped. Dates are written in the timeline\'s own calendar, e.g. "1042", "Spring 1042" or "March 3rd, 1042"; check an existing event in the mirror for the format.',
  inputSchema: {
    page: z.string().describe('Name, alias or id of the page that holds (or will hold) the timeline.'),
    timeline: z.string().optional().describe('Timeline tab name. Defaults to the first timeline tab, or a new tab named "Timeline".'),
    events: z.array(z.object({
      name: z.string().min(1),
      lane: z.string().min(1).describe('Lane name, e.g. "Campaign", "History", or a character.'),
      start: z.string().min(1).describe('Start date in the timeline calendar.'),
      end: z.string().optional(),
      link: z.string().optional().describe('Page this event is about (name, alias or id).'),
      note: z.boolean().default(false).describe('A note instead of an event.'),
      hidden: z.boolean().default(false).describe('Hide from players.'),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().describe('Fill color as #RRGGBB. Give each lane its own color so the timeline is readable at a glance; without one, every event is the same blue.'),
    })).min(1).max(50),
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
}, ({ page, timeline, events }) => run(async () => {
  const lkc = client()
  const { resolve } = await buildResolver([page, ...events.flatMap((e) => (e.link ? [e.link] : []))].map((n) => `[[${n}]]`))
  const resourceId = resolve(page)
  if (!resourceId) throw new Error(`Page "${page}" was not found.`)

  const resource = await lkc.resources.get({ resourceId })
  const named = (d: { name?: string | null }) => !timeline || d.name?.toLowerCase() === timeline.toLowerCase()
  let doc = resource.documents.find((d) => d.type === 'time' && named(d))
    ?? (resource.documents.length === 1 && resource.documents[0]!.type === 'blank' ? resource.documents[0] : undefined)
  if (!doc) doc = await lkc.documents.create({ resourceId }, { name: timeline ?? 'Timeline', type: 'time' })
  const ref = { resourceId, documentId: doc.id }

  const { laneFor } = await laneFinder(lkc, ref)

  const created: { name: string; start?: string; end?: string }[] = []
  const existing: string[] = []
  const warnings: string[] = []
  for (const [index, event] of events.entries()) {
    const linkId = event.link ? resolve(event.link) : undefined
    if (event.link && !linkId) warnings.push(`${event.name}: link "${event.link}" not found; event left unlinked.`)
    const id = stableId('e', doc.id, String(index), JSON.stringify(event))
    let result
    try {
      result = await lkc.timelines.createEvent(ref, {
      id,
      laneId: await laneFor(event.lane),
      type: event.note ? 'note' : 'event',
      name: event.name,
      formattedStart: event.start,
      ...(event.end ? { formattedEnd: event.end } : {}),
      ...(linkId ? { uri: `lk://resources/${linkId}` } : {}),
      ...(event.hidden ? { isHidden: true } : {}),
      ...(event.color ? { color: event.color } : {}),
      })
    } catch (error) {
      if (!isDuplicate(error)) throw error
      existing.push(event.name)
      continue
    }
    created.push({ name: event.name, start: result.formattedStart, end: result.formattedEnd })
  }
  const mirrored = await refresh(lkc, ws, [resourceId])
  return { timeline: `${resource.name} / ${doc.name}`, created, alreadyExisted: existing.length ? existing : undefined, mirrored, warnings }
}))

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/)

server.registerTool('lk_edit_page', {
  title: 'Edit page',
  description: 'Corrects content already on a page: replaces a section of a tab (the text under one heading) or a whole tab, sets sidebar fields, and updates, moves or deletes timeline events. Each replacement gives the `old` text it expects, copied from the mirror; if the page changed since the pull, nothing is written and the current text is returned. Run with dryRun first. Safe to retry: an identical call finishes work left undone and skips what is already done. Use only for changes the user approved; to add new material, use lk_append_to_page.',
  inputSchema: {
    page: z.string().describe('Page name, alias or resource id.'),
    sections: z.array(z.object({
      tab: z.string().optional().describe('Page tab name. Defaults to the first page tab.'),
      section: z.string().optional().describe('Heading text of the section to replace, e.g. "Elysium". Its heading stays; the blocks under it, up to the next heading of the same or a higher level, are replaced. Omit to replace the whole tab.'),
      old: z.string().describe('The current Markdown of that section body (or whole tab), exactly as in the mirror file. "" for an empty section.'),
      markdown: z.string().describe('The new Markdown for the section body (or whole tab), in the plugin dialect. "" empties the section.'),
    })).max(20).default([]),
    sidebar: z.record(z.string(), z.string()).default({}).describe('Sidebar fields to set, by title, as in lk_create_pages. An existing field of that title is overwritten; a new title adds a field.'),
    timeline: z.string().optional().describe('Timeline tab name for the event edits. Defaults to the first timeline tab.'),
    events: z.array(z.object({
      event: z.string().min(1).describe('Current event name, as in the mirror, or the event id when names repeat.'),
      name: z.string().min(1).optional().describe('New name.'),
      lane: z.string().min(1).optional().describe('Lane to move the event to, by name; a missing lane is created.'),
      start: z.string().optional().describe('New start date in the timeline calendar.'),
      end: z.string().optional().describe('New end date.'),
      link: z.string().optional().describe('Page to link (name, alias or id); "" removes the link.'),
      hidden: z.boolean().optional(),
      color: hex.optional().describe('New fill color, #RRGGBB.'),
      delete: z.boolean().optional().describe('Delete the event.'),
    })).max(50).default([]),
    dryRun: z.boolean().default(false),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
}, (input) => run(async () => {
  if (!input.sections.length && !Object.keys(input.sidebar).length && !input.events.length) throw new Error('Nothing to edit: give sections, sidebar or events.')
  const result = await editPage(client(), ws, input)
  if ('dryRun' in result) return result
  const mirrored = await refresh(client(), ws, [result.resourceId])
  return { ...result, resourceId: undefined, mirrored }
}))

await server.connect(new StdioServerTransport())
