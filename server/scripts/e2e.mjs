// Calls one tool on the bundled server over stdio, the way Claude Code runs it.
//   node server/scripts/e2e.mjs <workspace-dir> <tool> ['<json-args>' | @args.json]
// The API key comes from LEGENDKEEPER_API_KEY, or from LK_KEY=<NAME> read out of the repo's .env.
// Use a workspace outside the repo: mirrors hold GM secrets.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const [workspace, tool, args = '{}'] = process.argv.slice(2)
if (!workspace || !tool) throw new Error('usage: e2e.mjs <workspace-dir> <tool> [json-args]')

const env = { ...process.env, LEGENDKEEPER_WORKSPACE: workspace }
if (!env.LEGENDKEEPER_API_KEY && env.LK_KEY) {
  const dotenv = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
  env.LEGENDKEEPER_API_KEY = new RegExp(`^${env.LK_KEY}=(.*)$`, 'm').exec(dotenv)?.[1]?.trim()
  if (!env.LEGENDKEEPER_API_KEY) throw new Error(`${env.LK_KEY} not found in .env`)
}

const client = new Client({ name: 'e2e', version: '0' })
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../../plugin/server/index.js', import.meta.url))],
  env, stderr: 'inherit',
}))
const json = args.startsWith('@') ? readFileSync(args.slice(1), 'utf8') : args
const result = await client.callTool({ name: tool, arguments: JSON.parse(json) }, undefined, { timeout: 1_800_000 })
console.log(result.content.map((c) => c.text).join('\n'), result.isError ? '\n[ERROR]' : '')
await client.close()
