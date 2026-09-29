#!/usr/bin/env node
// Skill icons: rtm-database.pages.dev/assets/skills/<ICON>.png
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '../public/skills')
mkdirSync(OUT, { recursive: true })

const skills = JSON.parse(readFileSync(join(HERE, '../src/data/skills.json'), 'utf8'))
const icons = [...new Set(skills.map((s) => s.icon).filter(Boolean))]

let ok = 0, skip = 0, miss = 0, fail = 0
const queue = [...icons]
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) {
    const ic = queue.shift()
    const file = join(OUT, `${ic}.png`)
    if (existsSync(file)) { skip++; continue }
    try {
      const r = await fetch(`https://rtm-database.pages.dev/assets/skills/${ic}.png`)
      if (r.status === 404) { miss++; continue }
      if (!r.ok) { fail++; continue }
      writeFileSync(file, Buffer.from(await r.arrayBuffer()))
      ok++
    } catch { fail++ }
  }
}))
console.log(`skill icons: ${icons.length} distinct · downloaded ${ok} · already present ${skip} · no icon ${miss} · failed ${fail}`)
