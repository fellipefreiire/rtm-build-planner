// Types and helpers shared by the per-class rotation rules (see index.ts).
import { Build, Item, Skill } from '@/lib/types'
import type { StatSheet } from '@/lib/engine/sheet'

/** A span of a state lane; `stacks` only on counted lanes (Overslash). */
export type LaneSpan = { from: number; to: number; stacks?: number }

export type LaneDef = { id: string; label: string; cls: string; short: (s: LaneSpan) => string }

export type CastCtx = {
  key: string
  skill: Skill
  lv: number
  start: number
  build: Build
  byId: Map<number, Item>
  toggles: Record<string, boolean>
  /** HP during the rotation, in % of MaxHP (Simulator input) */
  hpPct: number
  /** sheet without a chosen skill: stats and MaxHP */
  sheet: StatSheet
  /** state active at the start of this cast */
  active: (lane: string) => boolean
  /** turns a state on for `seconds` from the start of this cast (renewing extends the open span) */
  grant: (lane: string, seconds: number) => void
  /** ends a state at the start of this cast */
  consume: (lane: string) => void
  /** raw lanes, for counted states */
  lanes: Record<string, LaneSpan[]>
}

export type CastPlan = {
  hits: number
  /** multiplier on the damage of the cast */
  mult: number
  /** percentage points added to the skill %; the engine turns them into (% + add) / % */
  pctAdd: number
  /** toggles for this cast's damage sheet (Revenant: Combo Ready changes Roaring's formula) */
  sheetToggles?: Record<string, boolean>
  /** element forced by the skill (Hellraiser is always Fire) */
  element?: string
  notes: string[]
  /** counter before the cast, when the cast itself changes it (Overslash stacks expire first) */
  stacksBefore?: number
}

export type Autocast = { key: string; lv: number; times: number; why: string }

export type RotationRules<S = unknown> = {
  /** skill keys shown in the palette, in order */
  palette: (build: Build, lineageSkills: string[]) => string[]
  lanes: LaneDef[]
  /** after cast delay in ms; undefined = the emulator's, by icon */
  acdMs?: (key: string, lv: number) => number | undefined
  init: () => S
  /** runs before the damage: may change the class state; returns how the cast hits */
  cast: (c: CastCtx, s: S) => CastPlan
  /** states the cast grants, after the damage */
  after: (c: CastCtx, s: S) => void
  /** skills cast automatically by gear when this one is cast */
  autocasts?: (c: CastCtx) => Autocast[]
  /** counter shown on the event (Overslash stacks); 0 when the class has none */
  stacks?: (s: S) => number
}

/** Names of everything equipped, items and cards. */
export const equippedNames = (build: Build, byId: Map<number, Item>): Set<string> => {
  const out = new Set<string>()
  for (const e of Object.values(build.slots)) {
    if (!e) continue
    const it = byId.get(e.id)
    if (it) out.add(it.name)
    for (const c of e.cards ?? []) { const ci = c != null ? byId.get(c) : undefined; if (ci) out.add(ci.name) }
  }
  return out
}

/** Learned skills from a list, in its order. */
export const learned = (build: Build, keys: readonly string[]) => keys.filter((k) => (build.skills[k] ?? 0) > 0)
