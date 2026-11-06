// Bundles the server into the plugin and writes the licenses of every bundled package.
import { build } from 'esbuild'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const outfile = '../plugin/server/index.js'
const result = await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile,
  metafile: true,
  legalComments: 'none',
  banner: { js: '// Generated from server/src by server/scripts/build.mjs. Do not edit.\n// Third-party licenses: THIRD_PARTY_LICENSES.md' },
})

const packages = new Map()
for (const input of Object.keys(result.metafile.inputs)) {
  const match = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input)
  if (!match || packages.has(match[1])) continue
  const dir = join('node_modules', match[1])
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const licenseFile = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f))
  packages.set(match[1], {
    version: pkg.version,
    license: pkg.license,
    text: licenseFile ? readFileSync(join(dir, licenseFile), 'utf8').trim() : `License: ${pkg.license} (no license file shipped)`,
  })
}
const notices = [...packages.entries()].sort(([a], [b]) => a.localeCompare(b))
  .map(([name, p]) => `## ${name}@${p.version} (${p.license})\n\n\`\`\`\n${p.text}\n\`\`\``)
writeFileSync(join(dirname(outfile), 'THIRD_PARTY_LICENSES.md'), `# Third-party licenses\n\nThe bundled server in this folder includes the following packages.\n\n${notices.join('\n\n')}\n`)
console.log(`bundled ${outfile} with ${packages.size} packages: ${[...packages.keys()].join(', ')}`)
