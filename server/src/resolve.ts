import type { LegendKeeper } from '@legendkeeper/sdk'
import type { Workspace } from './mirror.js'

const RESOURCE_ID = /^r[A-Za-z0-9]{8,}$/

export interface Resolver {
  resolve: (name: string) => string | undefined
  /** Names that matched more than one page; collected as resolve() runs. */
  ambiguous: string[]
}

/**
 * Resolves page names and aliases to resource ids: first `extra` (pages created in the same
 * call), then the local mirror's index, then a live exact-match search for anything left.
 * Templates are never link targets.
 */
export async function buildResolver(
  lk: LegendKeeper,
  ws: Workspace,
  sources: string[],
  extra = new Map<string, string>(),
): Promise<Resolver> {
  const table = new Map<string, Set<string>>()
  const add = (name: string, id: string) => {
    const key = name.trim().toLowerCase()
    if (!table.has(key)) table.set(key, new Set())
    table.get(key)!.add(id)
  }
  const index = await ws.readIndex()
  for (const entry of index?.entries ?? []) {
    if (entry.template) continue
    add(entry.name, entry.id)
    for (const alias of entry.aliases) add(alias, entry.id)
  }

  const wanted = new Set<string>()
  for (const source of sources) {
    for (const match of source.matchAll(/(?<!\\)\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) wanted.add(match[1]!.trim())
  }
  for (const name of wanted) {
    const key = name.toLowerCase()
    if (extra.has(key) || table.has(key) || RESOURCE_ID.test(name)) continue
    const hits = await lk.search.search({ q: name, limit: 10 })
    for (const hit of hits.data) {
      const names = [hit.resource.name, ...((hit.resource as { aliases?: string[] }).aliases ?? [])]
      if (names.some((n) => n.trim().toLowerCase() === key)) add(name, hit.resource.id)
    }
  }

  const ambiguous: string[] = []
  const resolve = (name: string): string | undefined => {
    const key = name.trim().toLowerCase()
    if (extra.has(key)) return extra.get(key)
    if (RESOURCE_ID.test(name.trim())) return name.trim()
    const ids = table.get(key)
    if (!ids) return undefined
    if (ids.size > 1) {
      ambiguous.push(name)
      return undefined
    }
    return [...ids][0]
  }
  return { resolve, ambiguous }
}
