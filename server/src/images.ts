// Uploads the local images that Markdown names (`![alt](path)`), once per file. Uploads go to one
// asset folder, and each asset's description records the file's hash, so a retried call reuses
// the asset it uploaded before instead of uploading a copy.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, relative, resolve as resolvePath } from 'node:path'
import type { LegendKeeper } from '@legendkeeper/sdk'
import { Lexer, type Token } from 'marked'
import { imagePath } from './markdown.js'

export const UPLOAD_FOLDER = 'Uploaded by Claude'
const TYPES: Record<string, 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
}

/** Local image paths named in the sources, in order of first use. URLs are left out. */
export function localImages(sources: string[]): string[] {
  const found = new Set<string>()
  const walk = (tokens: Token[]) => {
    for (const t of tokens) {
      if (t.type === 'image' && !/^https?:\/\//i.test(t.href)) found.add(imagePath(t.href))
      const children = (t as { tokens?: Token[] }).tokens
      if (children) walk(children)
      for (const item of (t as { items?: { tokens: Token[] }[] }).items ?? []) walk(item.tokens)
      for (const cell of [...((t as { header?: { tokens: Token[] }[] }).header ?? []), ...((t as { rows?: { tokens: Token[] }[][] }).rows ?? []).flat()]) walk(cell.tokens)
    }
  }
  for (const source of sources) walk(new Lexer({ gfm: true }).lex(source))
  return [...found]
}

/**
 * Uploads each local image the sources name (paths relative to the workspace) and returns a lookup
 * from path to asset URL. A dry run only checks the files. Problems become warnings, and the
 * image is left out, as an unresolved link is.
 */
export async function prepareImages(lk: LegendKeeper, root: string, sources: string[], dryRun: boolean) {
  const urls = new Map<string, string>()
  const warnings: string[] = []
  const paths = localImages(sources)
  let library: Promise<{ folderId: string; byHash: Map<string, string> }> | undefined

  for (const path of paths) {
    const full = resolvePath(root, path)
    const rel = relative(resolvePath(root), full)
    if (rel.startsWith('..') || isAbsolute(rel)) { warnings.push(`Image "${path}" is outside the workspace; skipped.`); continue }
    const contentType = TYPES[extname(full).toLowerCase()]
    if (!contentType) { warnings.push(`Image "${path}" is not PNG, JPEG, GIF or WebP; skipped.`); continue }
    let data: Buffer
    try { data = await readFile(full) } catch { warnings.push(`Image "${path}" was not found in the workspace; skipped.`); continue }
    if (dryRun) { urls.set(path, `file:${path}`); continue }

    library ??= uploadLibrary(lk)
    const { folderId, byHash } = await library
    const hash = `sha256:${createHash('sha256').update(data).digest('hex')}`
    let url = byHash.get(hash)
    if (!url) {
      const asset = await lk.assets.uploadImage({ data, contentType, name: basename(full, extname(full)), description: hash, folderId })
      url = asset.url!
      byHash.set(hash, url)
    }
    urls.set(path, url)
  }
  return { image: (src: string) => urls.get(src), warnings, count: urls.size }
}

/** The upload folder (created on first use) and the images already in it, by content hash. */
async function uploadLibrary(lk: LegendKeeper) {
  let folderId: string | undefined
  for await (const asset of await lk.assets.list({ limit: 100 })) {
    if (asset.type === 'FOLDER' && asset.name === UPLOAD_FOLDER) { folderId = asset.id; break }
  }
  folderId ??= (await lk.assets.createFolder({ name: UPLOAD_FOLDER })).id
  const byHash = new Map<string, string>()
  for await (const asset of await lk.assets.list({ folderId, limit: 100 })) {
    if (asset.type === 'IMAGE' && asset.url && asset.description?.startsWith('sha256:')) byHash.set(asset.description, asset.url)
  }
  return { folderId, byHash }
}
