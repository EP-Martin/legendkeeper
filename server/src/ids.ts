// Ids derived from the request content make every write retry-safe: sending the same tool
// call twice reuses the same ids, and the server answers DUPLICATE_ID instead of creating a
// copy. Idempotency keys derived the same way replay the first response for 24 hours.
import { createHash } from 'node:crypto'
import { ConflictError } from '@legendkeeper/sdk'

export const digest = (...parts: string[]) => createHash('sha256').update(parts.join('\u0000')).digest('hex')
export const stableId = (prefix: string, ...parts: string[]) => `${prefix}${digest(...parts).slice(0, 23)}`
export const idempotencyKey = (...parts: string[]) => `lkp-${digest(...parts).slice(0, 48)}`
export const isDuplicate = (error: unknown) => error instanceof ConflictError && error.code === 'DUPLICATE_ID'

// A replayed request returns the first response unchanged, so a retried create looks like a fresh one.
// The client's fetch notes which keys the server replayed (the Idempotent-Replay header).
const replayed = new Set<string>()
export const noteReplays = (inner: typeof fetch = fetch) => async (input: string, init: RequestInit) => {
  const response = await inner(input, init)
  const key = new Headers(init.headers).get('idempotency-key')
  if (key && response.headers.get('idempotent-replay') === 'true') replayed.add(key)
  return response
}
export const wasReplayed = (key: string) => replayed.has(key)
