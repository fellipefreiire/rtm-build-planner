// Class lineage (Orphan -> Trickster -> Revenant), extracted from the saved page
// dump/pages/classes.html, which holds the tree as nested <ul class="cls-branch">.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DUMP } from './dump.mjs'

const TAG = /<(\/?)(ul|li)\b([^>]*)>/g

/** @returns {{ parent: Record<string,string|null>, name: Record<string,string> }} */
export function classTree() {
  const html = readFileSync(join(DUMP, 'pages/classes.html'), 'utf8')
  const parent = {}
  const name = {}
  const stack = []           // open <li> elements that are classes
  const depth = []           // whether each open <ul>/<li> pushed a class

  let m
  while ((m = TAG.exec(html))) {
    const [, close, tag, attrs] = m
    if (tag === 'li') {
      if (close) { if (depth.pop()) stack.pop(); continue }
      const isCls = /class="cls"/.test(attrs)
      const id = /id="([a-z0-9-]+)"/.exec(attrs)?.[1]
      if (isCls && id) {
        parent[id] = stack.length ? stack[stack.length - 1] : null
        stack.push(id)
        depth.push(true)
      } else {
        depth.push(false)
      }
    }
  }

  // display name: <span class="cls-name">X</span> right after the id
  const NAMED = /id="([a-z0-9-]+)"[\s\S]{0,400}?<span class="cls-name">([^<]+)</g
  let n
  while ((n = NAMED.exec(html))) if (!name[n[1]]) name[n[1]] = n[2].trim()

  return { parent, name }
}

/** Chain from the root to the class, by display name. */
export function lineage(clsName, tree) {
  const slug = Object.keys(tree.name).find((k) => tree.name[k] === clsName)
  if (!slug) return [clsName]
  const out = []
  let cur = slug
  const seen = new Set()
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    out.unshift(tree.name[cur] ?? cur.replace(/(^|-)([a-z])/g, (_, a, b) => (a ? ' ' : '') + b.toUpperCase()))
    cur = tree.parent[cur]
  }
  return out
}

/**
 * Job level required to leave each class, read from each class's "Before you go"
 * block on the page: "Revenant ... Trickster Job Level 70" means Trickster goes
 * up to job 70 before becoming Revenant.
 * @returns {Record<string, number>} class name -> job level at which it ends
 */
export function jobCaps() {
  const html = readFileSync(join(DUMP, 'pages/classes.html'), 'utf8')
  const starts = [...html.matchAll(/id="([a-z0-9-]+)" data-row/g)].map((m) => [m[1], m.index])
  const caps = {}
  for (let i = 0; i < starts.length; i++) {
    const [, from] = starts[i]
    const to = i + 1 < starts.length ? starts[i + 1][1] : html.length
    const txt = html.slice(from, to).replace(/<[^>]+>/g, ' | ').replace(/\s+/g, ' ')
    for (const m of txt.matchAll(/([A-Z][A-Za-z' ]{2,20}?) Job Level (\d+)/g)) {
      const name = m[1].trim()
      if (name.startsWith('Change can be done')) continue
      caps[name] = Number(m[2])
    }
  }
  return caps
}
