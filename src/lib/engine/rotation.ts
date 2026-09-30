// rotation: a hand-built skill sequence, simulated over time with Combo Ready,
// Finisher Ready and Overslash stacks.
import { Build, Item, Mob, Skill } from '@/lib/types'
import { ClassRules } from '@/lib/rules/classes'
import { computeSheet, StatSheet } from './sheet'
import { simulate } from './simulate'
import { spCost } from './fight'

export const ROTATION_SKILLS = [
  'trickster/scythe-reap', 'revenant/reaping-slash', 'revenant/roaring-overslash', 'trickster/sweeping-slash',
  'trickster/hellraiser', 'revenant/underworld-rainstorm', 'trickster/dark-message', 'revenant/flaming-wave',
] as const

const SCYTHE_REAP = 'trickster/scythe-reap'
const REAPING = 'revenant/reaping-slash'
const ROARING = 'revenant/roaring-overslash'
const SWEEPING = 'trickster/sweeping-slash'
const HELLRAISER = 'trickster/hellraiser'
const UNDERWORLD = 'revenant/underworld-rainstorm'
const DARK_MESSAGE = 'trickster/dark-message'

/**
 * After cast delay of each skill, in ms, from the emulator (`db/re/skill_db.yml`, names of the
 * Royal Guard skills that Revenant inherits). The actual delay is `skill_delayfix` (skill.cpp:18207):
 * ACD × (150 − AGI)/150 (delay_dependon_agi) × (1 − After Cast Delay% from gear), minimum 0.1 s.
 */
const ACD_MS: Record<string, (lv: number) => number> = {
  'revenant/roaring-overslash': () => 1000,     // LG_OVERBRAND
  'revenant/reaping-slash': () => 500,          // LG_MOONSLASHER
  'trickster/scythe-reap': (lv) => 1100 - 100 * lv, // LK_SPIRALPIERCE: 1000 at Lv1 … 100 at Lv10
  'revenant/underworld-rainstorm': () => 1000,  // WM_SEVERE_RAINSTORM
  'trickster/dark-message': () => 500,          // SL_STIN
  'trickster/sweeping-slash': () => 0,          // KN_PIERCE
  'trickster/hellraiser': () => 0,              // RK_IGNITIONBREAK
  'revenant/flaming-wave': () => 0,             // NC_FLAMELAUNCHER
}
const MIN_DELAY = 0.1 // min_skill_delay_limit: 100 ms
// conf/battle/skill.conf: delay_rate 90 and casting_rate 90 (the server cuts 10% of ACD and cast time);
// skill_amotion_leniency 100: every skill is also locked by the attack motion time (amotion = 2000 − 10 × ASPD, ms)
const DELAY_RATE = 0.9
const CAST_RATE = 0.9

const MAX_STACKS = 5
const STACK_TIME = 6

export type RotationInput = {
  build: Build
  byId: Map<number, Item>
  steps: string[]
  skills: Map<string, Skill>
  rules: ClassRules
  toggles: Record<string, boolean>
  food: { stat: 'str' | 'agi' | 'vit' | 'int' | 'dex' | 'luk'; value: number } | null
  mob: Mob
  /** multiplies the engine index; null = relative index */
  k: number | null
}

export type RotationEvent = {
  skill: string
  name: string
  start: number
  end: number
  comboReady: boolean
  finisherReady: boolean
  stacksBefore: number
  stacksAfter: number
  hits: number
  damage: number
  /** time waited for SP before casting (s) */
  waitedSp: number
  notes: string[]
}

export type Span = { from: number; to: number }
export type StackSpan = Span & { stacks: number }

export type RotationResult = {
  events: RotationEvent[]
  /** state lanes over time: when each effect is active */
  lanes: { comboReady: Span[]; finisherReady: Span[]; stacks: StackSpan[] }
  total: number
  duration: number
  dps: number
  bySkill: { skill: string; name: string; casts: number; total: number; perCast: number }[]
}

const lvOf = (b: Build, s: Skill) => Math.min(b.skills[s.key] || s.maxLv, s.maxLv)

export function runRotation(i: RotationInput): RotationResult {
  const { build, skills, rules } = i
  const cache = new Map<string, { sheet: StatSheet; index: number }>()
  // damage of 1 skill hit with the current state (Combo Ready changes Roaring's %)
  const hitOf = (s: Skill, comboReady: boolean) => {
    const key = `${s.key}|${comboReady}`
    let c = cache.get(key)
    if (!c) {
      const b = { ...build, skillKey: s.key, anchor: null }
      const toggles = { ...i.toggles, comboReady }
      const sheet = computeSheet(b, i.byId, s, rules, toggles, i.food)
      // Hellraiser is always Fire
      const sh = s.key === HELLRAISER ? { ...sheet, weaponElement: { v: 'Fire', from: 'Hellraiser' } } : sheet
      c = { sheet: sh, index: simulate(b, sh, i.mob).index }
      cache.set(key, c)
    }
    return c
  }

  const base = hitOf(skills.get(ROARING) ?? [...skills.values()][0], true).sheet
  const maxSp = base.maxSp?.v ?? 0
  const regenPct = (base.totals.pct.sp_regen ?? 0) + (base.totals.flat.sp_regen ?? 0)
  const isrLv = build.skills['trickster/increase-sp-recovery'] ?? 0
  const spPerSec = (Math.floor(1 + base.stats.int / 6 + maxSp / 100) * (1 + regenPct / 100)) / 8
    + (isrLv > 0 ? (isrLv / 10) * (20 + maxSp / 100) / 4.5 : 0)

  let t = 0
  let sp = maxSp
  let crUntil = -1
  let frUntil = -1
  let stacks = 0
  let stacksUntil = -1
  const ready = new Map<string, number>()
  const events: RotationEvent[] = []
  const crSpans: Span[] = []
  const frSpans: Span[] = []
  const stackSpans: StackSpan[] = []
  // renewing extends the open interval; otherwise opens a new one
  const grant = (list: Span[], from: number, to: number) => {
    const last = list[list.length - 1]
    if (last && from <= last.to) last.to = Math.max(last.to, to)
    else list.push({ from, to })
  }

  for (const key of i.steps) {
    const s = skills.get(key)
    if (!s) continue
    const lv = lvOf(build, s)
    const d = s.damage
    const notes: string[] = []
    let start = Math.max(t, ready.get(key) ?? 0)
    // SP: wait for regen if short
    const sheetNow = hitOf(s, true).sheet
    let cost = spCost(sheetNow, s, lv, sp + (start - t) * spPerSec).total
    let waited = 0
    sp = Math.min(maxSp, sp + (start - t) * spPerSec)
    if (sp < cost && spPerSec > 0) {
      waited = (cost - sp) / spPerSec
      start += waited
      sp = cost
      cost = spCost(sheetNow, s, lv, sp).total
      notes.push(`waited ${waited.toFixed(1)} s for SP`)
    }
    sp -= cost

    if (start > stacksUntil) stacks = 0
    const cr = start <= crUntil
    const fr = start <= frUntil
    const stacksBefore = stacks
    let hits = 1
    let mult = 1
    let modeled = !!d && !d.magic

    if (key === ROARING) {
      // +1 hit per stack; Roaring does not consume the stacks [player report 2026-09-28]
      hits = 1 + stacks
      if (!cr) notes.push('without Combo Ready: reduced damage')
      // Roaring consumes Finisher Ready [player report 2026-09-30]
      if (fr) {
        frUntil = start
        const last = frSpans[frSpans.length - 1]
        if (last && last.to > start) last.to = start
      }
    } else if (key === REAPING) {
      mult = 1 + 0.05 * stacksBefore
      // Finisher Ready (Hellraiser): Reaping goes straight to 5 [player report 2026-09-28]
      if (fr) stacks = MAX_STACKS
      else stacks = stacks === 0 ? 1 : cr ? Math.min(MAX_STACKS, stacks + 1) : stacks
      stacksUntil = start + STACK_TIME
      // stack lane: the previous segment ends here; the new value holds until it expires (or the next Reaping)
      const prev = stackSpans[stackSpans.length - 1]
      if (prev && prev.to > start) prev.to = start
      stackSpans.push({ from: start, to: stacksUntil, stacks })
      if (!cr && stacksBefore >= 1) notes.push('without Combo Ready: stays at 1 stack')
    } else if (key === SWEEPING) {
      hits = fr ? 3 : 2
      if (!cr) { mult = 0.5; notes.push('outside combo: ×0.5 [estimated]') }
    } else if (key === UNDERWORLD) {
      hits = 15
      mult = 1 + 0.04 * stacksBefore
    }

    let damage = 0
    if (modeled && d) {
      const { index } = hitOf(s, key === ROARING ? cr : true)
      damage = index * (i.k ?? 1) * hits * mult
    } else {
      notes.push(d?.magic ? 'magic damage: not modeled' : 'no damage formula')
      modeled = false
    }

    // states granted by the skill
    const giveCr = key === SCYTHE_REAP ? 4
      : key === SWEEPING && (build.skills['revenant/advanced-scythe-mastery'] ?? 0) > 0 ? 3
      : key === DARK_MESSAGE ? lv : 0
    if (giveCr) { crUntil = Math.max(crUntil, start + giveCr); grant(crSpans, start, start + giveCr) }
    if (key === HELLRAISER) { frUntil = Math.max(frUntil, start + 5); grant(frSpans, start, start + 5) }

    const vct = (sheetNow.totals.pct.cast_time ?? 0) + (sheetNow.totals.flat.cast_time ?? 0)
    const cast = ((d?.castVar ?? 0) * Math.max(0, 1 + vct / 100) + (d?.castFixed ?? 0)) * CAST_RATE
    const acdPct = (sheetNow.totals.pct.after_cast_delay ?? 0) + (sheetNow.totals.flat.after_cast_delay ?? 0)
    const acd = (ACD_MS[key]?.(lv) ?? 0) / 1000 * Math.max(0, 150 - sheetNow.stats.agi) / 150 * Math.max(0, 1 + acdPct / 100) * DELAY_RATE
    const amotion = sheetNow.aspd ? Math.max(0, 2000 - 10 * sheetNow.aspd.v) / 1000 : 0
    const delay = Math.max(MIN_DELAY, acd, amotion)
    const end = start + cast + delay
    const cdMods = sheetNow.totals.scoped.skill_cooldown?.[s.name.toLowerCase()] ?? 0
    ready.set(key, start + Math.max(0, (d?.cooldown ?? 0) + cdMods))

    events.push({
      skill: key, name: s.name, start, end, comboReady: cr, finisherReady: fr,
      stacksBefore, stacksAfter: stacks, hits, damage, waitedSp: waited, notes,
    })
    t = end
  }

  const total = events.reduce((a, e) => a + e.damage, 0)
  const duration = events.length ? events[events.length - 1].end : 0
  const agg = new Map<string, { skill: string; name: string; casts: number; total: number; perCast: number }>()
  for (const e of events) {
    const a = agg.get(e.skill) ?? { skill: e.skill, name: e.name, casts: 0, total: 0, perCast: 0 }
    a.casts++; a.total += e.damage; a.perCast = a.total / a.casts
    agg.set(e.skill, a)
  }
  return {
    events, total, duration, dps: duration > 0 ? total / duration : 0, bySkill: [...agg.values()],
    lanes: { comboReady: crSpans, finisherReady: frSpans, stacks: stackSpans },
  }
}
