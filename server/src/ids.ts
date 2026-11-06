// Ids derived from the request content make every write retry-safe: sending the same tool
// call twice reuses the same ids, and the server answers DUPLICATE_ID instead of creating a
// copy. Idempotency keys derived the same way replay the first response for 24 hours.
import { createHash } from 'node:crypto'
import { ConflictError } from '@legendkeeper/sdk'

export const digest = (...parts: string[]) => createHash('sha256').update(parts.join('\u0000')).digest('hex')
export const stableId = (prefix: string, ...parts: string[]) => `${prefix}${digest(...parts).slice(0, 23)}`
export const idempotencyKey = (...parts: string[]) => `lkp-${digest(...parts).slice(0, 48)}`
export const isDuplicate = (error: unknown) => error instanceof ConflictError && error.code === 'DUPLICATE_ID'
