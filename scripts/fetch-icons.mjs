#!/usr/bin/env node
// Downloads item icons from rtm-database.pages.dev into public/icons/.
// Idempotent: skips files that already exist. Concurrency is kept low on purpose,
// since this is someone else's server.
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '../public/icons')
const ART = join(OUT, 'art')
const BASE = 'https://rtm-database.pages.dev/assets/icons'
const CONC = Number(process.env.CONC ?? 8)
const WANT_ART = process.argv.includes('--art')

mkdirSync(OUT, { recursive: true })
if (WANT_ART) mkdirSync(ART, { recursive: true })

const items = JSON.parse(readFileSync(join(HERE, '../src/data/items.json'), 'utf8'))
const ids = [...new Set(items.map((i) => i.id))].sort((a, b) => a - b)

let ok = 0, skip = 0, miss = 0, fail = 0, done = 0
const t0 = Date.now()

async function grab(id) {
  for (const [url, file] of [
    [`${BASE}/${id}.png`, join(OUT, `${id}.png`)],
    ...(WANT_ART ? [[`${BASE}/art/${id}.png`, join(ART, `${id}.png`)]] : []),
  ]) {
    if (existsSync(file)) { skip++; continue }
    try {
      const r = await fetch(url)
      if (r.status === 404) { miss++; continue }
      if (!r.ok) { fail++; continue }
      writeFileSync(file, Buffer.from(await r.arrayBuffer()))
      ok++
    } catch { fail++ }
  }
  done++
  if (done % 250 === 0) {
    const s = ((Date.now() - t0) / 1000).toFixed(0)
    process.stdout.write(`  ${done}/${ids.length}  downloaded ${ok} · no icon ${miss} · failed ${fail}  (${s}s)\n`)
  }
}

const queue = [...ids]
await Promise.all(
  Array.from({ length: CONC }, async () => {
    while (queue.length) await grab(queue.shift())
  }),
)
console.log(`\ndownloaded ${ok} · already present ${skip} · no icon on server ${miss} · failed ${fail}`)
