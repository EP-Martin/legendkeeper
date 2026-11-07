import { describe, expect, it } from 'vitest'
import { clientFetch, MAX_RATE_WAIT_MS, wasReplayed } from '../src/ids.js'

const reply = (status: number, headers: Record<string, string> = {}) => new Response(status === 200 ? '{}' : null, { status, headers })

describe('clientFetch', () => {
  it('waits out a rate limit for the Retry-After time and resends the same request', async () => {
    const replies = [reply(429, { 'retry-after': '30' }), reply(429, { 'retry-after': '20' }), reply(200)]
    const sent: RequestInit[] = []
    const waits: number[] = []
    const fetch = clientFetch(async (_url, init) => { sent.push(init!); return replies.shift()! }, async (ms) => { waits.push(ms) })
    const init = { method: 'POST', body: '{"a":1}' }
    const response = await fetch('https://x/api', init)
    expect(response.status).toBe(200)
    expect(waits).toEqual([30_000, 20_000])
    expect(sent).toEqual([init, init, init])
  })

  it('gives the 429 back once the waits would pass the cap, so the caller sees the error', async () => {
    const waits: number[] = []
    const fetch = clientFetch(async () => reply(429, { 'retry-after': '3600' }), async (ms) => { waits.push(ms) })
    expect((await fetch('https://x/api', {})).status).toBe(429)
    expect(waits).toEqual([])
    expect(MAX_RATE_WAIT_MS).toBeLessThan(3_600_000)
  })

  it('notes replayed idempotency keys', async () => {
    const fetch = clientFetch(async () => reply(200, { 'idempotent-replay': 'true' }), async () => {})
    await fetch('https://x/api', { method: 'POST', headers: { 'Idempotency-Key': 'lkp-test-1' } })
    expect(wasReplayed('lkp-test-1')).toBe(true)
    expect(wasReplayed('lkp-test-2')).toBe(false)
  })
})
