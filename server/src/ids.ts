// Ids derived from the request content make every write retry-safe: sending the same tool
// call twice reuses the same ids, and the server answers DUPLICATE_ID instead of creating a
// copy. Idempotency keys derived the same way replay the first response for 24 hours.
import { createHash } from 'node:crypto'
import { ConflictError } from '@legendkeeper/sdk'

export const digest = (...parts: string[]) => createHash('sha256').update(parts.join('\u0000')).digest('hex')
export const stableId = (prefix: string, ...parts: string[]) => `${prefix}${digest(...parts).slice(0, 23)}`
export const idempotencyKey = (...parts: string[]) => `lkp-${digest(...parts).slice(0, 48)}`
export const isDuplicate = (error: unknown) => error instanceof ConflictError && error.code === 'DUPLICATE_ID'

// The client's fetch does two things the SDK doesn't:
// - It notes which idempotency keys the server replayed (Idempotent-Replay), because a replay
//   returns the first response unchanged and a retried create would look like a fresh one.
// - It waits out rate limits. LegendKeeper allows 120 writes a minute per key, and the SDK gives
//   up after waits of 8 seconds, so a large batch would fail partway. Waiting the server's
//   Retry-After and resending makes a large batch slow instead.
const replayed = new Set<string>()
export const MAX_RATE_WAIT_MS = 180_000
export const clientFetch = (inner: typeof fetch = fetch, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) =>
  async (input: string, init: RequestInit) => {
    let waited = 0
    for (;;) {
      const response = await inner(input, init)
      if (response.status === 429) {
        const seconds = Number(response.headers.get('retry-after'))
        const ms = Math.max(1, Number.isFinite(seconds) && seconds > 0 ? seconds : 10) * 1000
        if (waited + ms <= MAX_RATE_WAIT_MS) {
          await sleep(ms)
          waited += ms
          continue
        }
      }
      const key = new Headers(init.headers).get('idempotency-key')
      if (key && response.headers.get('idempotent-replay') === 'true') replayed.add(key)
      return response
    }
  }
export const wasReplayed = (key: string) => replayed.has(key)
