import itemsJson from '@/data/items.json'
import mobsJson from '@/data/mobs.json'
import skillsJson from '@/data/skills.json'
import classesJson from '@/data/classes.json'
import coverageJson from '@/data/coverage.json'
import aliasesJson from '@/data/id-aliases.json'
import { ClassInfo, Item, Mob, Skill, SlotId, accessorySideOk } from '@/lib/types'

export const items = itemsJson as unknown as Item[]
export const mobs = mobsJson as unknown as Mob[]
export const skills = skillsJson as unknown as Skill[]
export const classes = classesJson as unknown as ClassInfo[]
export const coverage = coverageJson as {
  lines: number; numeric: number; applied: number; conditional: number; unknown: number
  byReason: Record<string, number>
  pct: { applied: number; conditional: number; unknown: number }
}

export const byId = new Map(items.map((i) => [i.id, i]))
export const mobById = new Map(mobs.map((m) => [m.id, m]))
export const skillByKey = new Map(skills.map((s) => [s.key, s]))
export const classByName = new Map(classes.map((c) => [c.name, c]))

/**
 * Who can equip it: no list = everyone. The dump also has "All except Orphan" (and Bouncer,
 * Prowler, Judge) — 344 items that used to vanish from every other class's picker.
 * In an exclusion list the classes after the first entry are excluded too:
 * ["All except Bouncer", "Dark Knight", …] keeps the Dark Knight OUT (Fleinn, Jitte).
 */
const exclusionList = (jobs: string[]) => {
  const first = /^All except (.+)$/i.exec(jobs[0] ?? '')?.[1]
  return first == null ? null : [...first.split(/\s*,\s*|\s+and\s+/), ...jobs.slice(1)]
}
export const canEquip = (it: Item, cls: string) => {
  if (!it.jobs) return true
  const except = exclusionList(it.jobs)
  return except ? !except.includes(cls) : it.jobs.includes(cls)
}

/**
 * Item categories the class actually uses in that slot, derived from the items that
 * name the class explicitly. Separates "Scythe" from "Dagger" in a weapon slot,
 * since the dump leaves some items without a class restriction and they would
 * leak into every class.
 *
 * `[caution]` Only valid when the explicit sample covers most of the slot.
 * In garment only 3 of 116 items name Revenant, and all three are Costume — concluding
 * from that that "Revenant only uses costume garments" hid the other 113. Hence
 * the 50% cutoff: a small sample does not describe the slot.
 */
const MIN_SAMPLE = 0.5
const catCache = new Map<string, Set<string> | null>()
export function allowedCats(from: string, cls: string): Set<string> | null {
  const key = `${from}|${cls}`
  const hit = catCache.get(key)
  if (hit !== undefined) return hit
  const cats = new Set<string>()
  let explicitCount = 0
  let total = 0
  for (const i of items) {
    if (i.grp === 'Card' || !i.slots.includes(from)) continue
    total++
    if (i.jobs && !exclusionList(i.jobs) && i.jobs.includes(cls)) { explicitCount++; cats.add(i.cat) }
  }
  const out = total && explicitCount / total >= MIN_SAMPLE ? cats : null
  catCache.set(key, out)
  return out
}

export function itemsForSlot(from: string, cls: string, onlyClass: boolean, slot?: SlotId) {
  const base = items.filter((i) => i.grp !== 'Card' && i.slots.includes(from) && (!slot || accessorySideOk(i.cat, slot)))
  if (!onlyClass) return base
  const cats = allowedCats(from, cls)
  return base.filter((i) => canEquip(i, cls) && (!cats || cats.has(i.cat)))
}
export function cardsForSlot(from: string) {
  return items.filter((i) => i.grp === 'Card' && i.slots.includes(from))
}

/** old id -> new id, for builds saved before a dump that renumbered items */
export const idAliases = aliasesJson as Record<string, number>
