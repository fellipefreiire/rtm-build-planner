// rotation: a hand-built skill sequence, simulated over time. This file holds what every class
// shares (time, SP, cooldown, after cast delay, amotion, damage per cast); the states and the
// per-skill rules come from the class module in rules/rotation/.
import { Build, Item, Mob, Skill } from '@/lib/types'
import { ClassRules } from '@/lib/rules/classes'
import { CastCtx, CastPlan, LaneSpan, rotationRulesFor } from '@/lib/rules/rotation'
import { emuAcdMs } from '@/lib/rules/server'
import { computeSheet, StatSheet } from './sheet'
import { simulate } from './simulate'
import { spCost } from './fight'

const MIN_DELAY = 0.1 // min_skill_delay_limit: 100 ms
// conf/battle/skill.conf: delay_rate 90 and casting_rate 90 (the server cuts 10% of ACD and cast time);
// skill_amotion_leniency 100: every skill is also locked by the attack motion time (amotion = 2000 − 10 × ASPD, ms)
const DELAY_RATE = 0.9
const CAST_RATE = 0.9

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
  /** HP during the rotation, in % of MaxHP (Dark Knight Harvest); default 100 */
  hpPct?: number
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
  /** skills cast by gear together with this one: no time, no SP */
  autocasts: RotationEvent[]
  /** on an autocast: what cast it */
  by?: string
}

export type Span = LaneSpan
export type StackSpan = LaneSpan & { stacks: number }

export type RotationResult = {
  events: RotationEvent[]
  /** state lanes over time, by the class lane id: when each effect is active */
  lanes: Record<string, LaneSpan[]>
  total: number
  duration: number
  dps: number
  bySkill: { skill: string; name: string; casts: number; total: number; perCast: number }[]
}

const lvOf = (b: Build, s: Skill) => Math.min(b.skills[s.key] || s.maxLv, s.maxLv)

export function runRotation(i: RotationInput): RotationResult {
  const { build, skills, rules } = i
  const rr = rotationRulesFor(build.cls)
  const hpPct = i.hpPct ?? 100
  const cache = new Map<string, { sheet: StatSheet; index: number }>()
  // damage of 1 hit of a skill at a level, with the cast's sheet toggles and forced element
  const hitOf = (s: Skill, lv: number, sheetToggles: Record<string, boolean> = {}, element?: string) => {
    const key = `${s.key}|${lv}|${JSON.stringify(sheetToggles)}|${element ?? ''}`
    let c = cache.get(key)
    if (!c) {
      const b = { ...build, skills: { ...build.skills, [s.key]: lv }, skillKey: s.key, anchor: null }
      const sheet = computeSheet(b, i.byId, s, rules, { ...i.toggles, ...sheetToggles }, i.food)
      const sh = element ? { ...sheet, weaponElement: { v: element, from: s.name } } : sheet
      c = { sheet: sh, index: simulate(b, sh, i.mob).index }
      cache.set(key, c)
    }
    return c
  }

  const base = computeSheet({ ...build, skillKey: null, anchor: null }, i.byId, null, rules, i.toggles, i.food)
  const maxSp = base.maxSp?.v ?? 0
  const regenPct = (base.totals.pct.sp_regen ?? 0) + (base.totals.flat.sp_regen ?? 0)
  const isrLv = build.skills['trickster/increase-sp-recovery'] ?? 0
  const spPerSec = (Math.floor(1 + base.stats.int / 6 + maxSp / 100) * (1 + regenPct / 100)) / 8
    + (isrLv > 0 ? (isrLv / 10) * (20 + maxSp / 100) / 4.5 : 0)

  let t = 0
  let sp = maxSp
  const state = rr.init()
  const until: Record<string, number> = {}
  const lanes: Record<string, LaneSpan[]> = Object.fromEntries(rr.lanes.map((l) => [l.id, []]))
  const ready = new Map<string, number>()
  const events: RotationEvent[] = []

  const ctxAt = (key: string, skill: Skill, lv: number, start: number): CastCtx => ({
    key, skill, lv, start, build, byId: i.byId, toggles: i.toggles, hpPct, sheet: base, lanes,
    active: (lane) => start <= (until[lane] ?? -1),
    // renewing extends the open interval; otherwise opens a new one
    grant: (lane, seconds) => {
      const to = start + seconds
      until[lane] = Math.max(until[lane] ?? -1, to)
      const list = (lanes[lane] ??= [])
      const last = list[list.length - 1]
      if (last && start <= last.to) last.to = Math.max(last.to, to)
      else list.push({ from: start, to })
    },
    consume: (lane) => {
      until[lane] = start - 1e-9
      const list = lanes[lane] ?? []
      const last = list[list.length - 1]
      if (last && last.to > start) last.to = start
    },
  })

  // damage of a cast from its plan; notes explain what could not be modeled
  const damageOf = (s: Skill, lv: number, plan: CastPlan, notes: string[]) => {
    const d = s.damage
    if (!d || d.magic) { notes.push(d?.magic ? 'magic damage: not modeled' : 'no damage formula'); return 0 }
    const { sheet, index } = hitOf(s, lv, plan.sheetToggles, plan.element)
    const pct = sheet.skillPct?.v ?? 0
    const pctFactor = plan.pctAdd && pct > 0 ? (pct + plan.pctAdd) / pct : 1
    return index * (i.k ?? 1) * plan.hits * plan.mult * pctFactor
  }

  const autocastEvents = (c: CastCtx, by: string): RotationEvent[] => {
    const out: RotationEvent[] = []
    for (const ac of rr.autocasts?.(c) ?? []) {
      const as = skills.get(ac.key)
      if (!as) continue
      for (let n = 0; n < ac.times; n++) {
        const ax = ctxAt(ac.key, as, ac.lv, c.start)
        const cr = ax.active('comboReady')
        const fr = ax.active('finisherReady')
        const plan = rr.cast(ax, state)
        const notes = [`autocast by ${by} (${ac.why})`, ...plan.notes]
        const damage = damageOf(as, ac.lv, plan, notes)
        rr.after(ax, state)
        const stacks = rr.stacks?.(state) ?? 0
        out.push({
          skill: ac.key, name: as.name, start: c.start, end: c.start, comboReady: cr, finisherReady: fr,
          stacksBefore: plan.stacksBefore ?? stacks, stacksAfter: stacks, hits: plan.hits, damage, waitedSp: 0,
          notes, autocasts: [], by,
        })
      }
    }
    return out
  }

  for (const key of i.steps) {
    const s = skills.get(key)
    if (!s) continue
    const lv = lvOf(build, s)
    const d = s.damage
    const notes: string[] = []
    let start = Math.max(t, ready.get(key) ?? 0)
    // SP: wait for regen if short
    const sheetNow = hitOf(s, lv).sheet
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

    const c = ctxAt(key, s, lv, start)
    const cr = c.active('comboReady')
    const fr = c.active('finisherReady')
    const plan = rr.cast(c, state)
    const stacksBefore = plan.stacksBefore ?? rr.stacks?.(state) ?? 0
    notes.push(...plan.notes)
    const damage = damageOf(s, lv, plan, notes)
    rr.after(c, state)
    const autocasts = autocastEvents(c, s.name)

    const vct = (sheetNow.totals.pct.cast_time ?? 0) + (sheetNow.totals.flat.cast_time ?? 0)
    const cast = ((d?.castVar ?? 0) * Math.max(0, 1 + vct / 100) + (d?.castFixed ?? 0)) * CAST_RATE
    const acdPct = (sheetNow.totals.pct.after_cast_delay ?? 0) + (sheetNow.totals.flat.after_cast_delay ?? 0)
    const acdMs = rr.acdMs?.(key, lv) ?? emuAcdMs(s.icon, lv) ?? 0
    const acd = acdMs / 1000 * Math.max(0, 150 - sheetNow.stats.agi) / 150 * Math.max(0, 1 + acdPct / 100) * DELAY_RATE
    const amotion = sheetNow.aspd ? Math.max(0, 2000 - 10 * sheetNow.aspd.v) / 1000 : 0
    const delay = Math.max(MIN_DELAY, acd, amotion)
    const end = start + cast + delay
    const cdMods = sheetNow.totals.scoped.skill_cooldown?.[s.name.toLowerCase()] ?? 0
    ready.set(key, start + Math.max(0, (d?.cooldown ?? 0) + cdMods))

    events.push({
      skill: key, name: s.name, start, end, comboReady: cr, finisherReady: fr,
      stacksBefore, stacksAfter: rr.stacks?.(state) ?? 0, hits: plan.hits, damage, waitedSp: waited, notes, autocasts,
    })
    t = end
  }

  const all = events.flatMap((e) => [e, ...e.autocasts])
  const total = all.reduce((a, e) => a + e.damage, 0)
  const duration = events.length ? events[events.length - 1].end : 0
  const agg = new Map<string, { skill: string; name: string; casts: number; total: number; perCast: number }>()
  for (const e of all) {
    const a = agg.get(e.skill) ?? { skill: e.skill, name: e.name, casts: 0, total: 0, perCast: 0 }
    a.casts++; a.total += e.damage; a.perCast = a.total / a.casts
    agg.set(e.skill, a)
  }
  return { events, total, duration, dps: duration > 0 ? total / duration : 0, bySkill: [...agg.values()], lanes }
}
