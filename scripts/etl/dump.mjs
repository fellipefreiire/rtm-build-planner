// Reader for the columnar RTM: Refuge data dump.
//
// The raw dump is NOT included in this repository. It lives in ../dump (outside
// the repo) and is a copy of the JSON files served by rtm-database.pages.dev
// (assets/data/db-items.json, db-mobs.json, db-skills.json, saved here as
// raw-db-*.json). The ETL only reads it. The committed, pre-generated output is
// src/data/*.json, so the app builds without the dump.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
export const DUMP = join(HERE, '../../../dump')

const DEREF = {
  cat: 'cats', fam: 'fams', grp: 'grps', loc: 'locs',
  jobs: 'jobs', box: 'boxnames', hatred: 'hatreds', locks: 'locknames', cls: 'classes',
}

function deref(table, v) {
  if (Array.isArray(v)) return v.map((x) => deref(table, x))
  if (typeof v === 'number' && v >= 0 && v < table.length) return table[v]
  return v
}

/** Denormalizes a columnar dump { cols, rows, <lookup tables> } into objects. */
export function decode(src, extraDeref = {}) {
  const maps = { ...DEREF, ...extraDeref }
  return src.rows.map((row) => {
    const o = Object.fromEntries(src.cols.map((c, i) => [c, row[i]]))
    for (const [col, tbl] of Object.entries(maps)) {
      if (col in o && src[tbl]) o[col] = deref(src[tbl], o[col])
    }
    return o
  })
}

export const load = (f) => JSON.parse(readFileSync(join(DUMP, f), 'utf8'))

export function items() { return decode(load('raw-db-items.json')) }
export function mobs() { return decode(load('raw-db-mobs.json'), {}) }
export function skills() {
  return decode(load('raw-db-skills.json'), {
    cls: 'classes', elem: 'elements', nature: 'natures', wep: 'weapons',
  })
}
