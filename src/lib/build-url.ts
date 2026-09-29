// Build serialization. Since 2026-09-28 the state lives in localStorage as JSON;
// the base64 URL format is still read, only to import old links.
import { Build, SlotId, STATS, StatKey } from '@/lib/types'
import { idAliases } from '@/lib/data'

export const SCHEMA = 1

export function emptyBuild(cls = 'Revenant'): Build {
  return {
    v: 1,
    cls,
    baseLv: 150,
    jobLv: 70,
    points: null,
    stats: Object.fromEntries(STATS.map((s) => [s, 1])) as Record<StatKey, number>,
    slots: {},
    skillKey: null,
    skillLv: 10,
    skills: {},
    skillPoints: null,
    anchor: null,
    hpOverride: null,
    manual: {},
    weaponElement: 'Neutral',
    armorElement: 'Neutral',
  }
}

const b64url = {
  enc: (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))),
}

export const encodeBuild = (b: Build): string => b64url.enc(JSON.stringify(b))

export type DecodeError = { error: 'BadVersion' | 'BadPayload'; detail: string }

export function decodeBuild(s: string): Build | DecodeError {
  try {
    return fromObject(JSON.parse(b64url.dec(s)))
  } catch (e) {
    return { error: 'BadPayload', detail: String(e) }
  }
}

/** Build from an already-parsed object (saved or pasted JSON). */
export function fromObject(o: unknown): Build | DecodeError {
  const b = o as Partial<Build> | null
  if (!b || typeof b !== 'object') return { error: 'BadPayload', detail: 'not an object' }
  if (b.v !== SCHEMA) return { error: 'BadVersion', detail: `unknown schema ${b.v}` }
  return migrateIds({ ...emptyBuild(b.cls), ...b } as Build)
}

/** Replaces ids the dump renumbered with the current ones (e.g. Caelum of the Sun 900395 -> 31213). */
export function migrateIds(b: Build): Build {
  const fix = (id: number) => idAliases[String(id)] ?? id
  for (const e of [...Object.values(b.slots), ...Object.values(b.swaps ?? {})]) {
    if (!e) continue
    e.id = fix(e.id)
    e.cards = e.cards.map((c) => (c == null ? c : fix(c)))
  }
  return b
}

/** Build as readable JSON, for saving in the browser or exporting. */
export const buildToJson = (b: Build): string => JSON.stringify(b, null, 1)

export function buildFromJson(s: string): Build | DecodeError {
  try {
    return fromObject(JSON.parse(s))
  } catch (e) {
    return { error: 'BadPayload', detail: String(e) }
  }
}

export const isDecodeError = (x: Build | DecodeError): x is DecodeError => 'error' in x

/** Swaps a slot's active item with the spare (switch). Both spare and active empty = the switch is removed. */
export function toggleSwitch(b: Build, slot: SlotId): Build {
  const cur = b.slots[slot] ?? null
  const alt = b.swaps?.[slot] ?? null
  b.swaps = { ...(b.swaps ?? {}) }
  b.swapSide = { ...(b.swapSide ?? {}) }
  if (alt) b.slots[slot] = alt
  else delete b.slots[slot]
  b.swaps[slot] = cur
  b.swapSide[slot] = (b.swapSide[slot] ?? 'A') === 'A' ? 'B' : 'A'
  if (!b.slots[slot] && !b.swaps[slot]) { delete b.swaps[slot]; delete b.swapSide[slot] }
  return b
}
