// rotation: a hand-built skill sequence, simulated over time. This file holds what every class
// shares (time, SP, cooldown, after cast delay, amotion, damage per cast); the states and the
// per-skill rules come from the class module in rules/rotation/.
import { Build, Item, Mob, Skill } from '@/lib/types'
import { ClassRules } from '@/lib/rules/classes'
import { CastCtx, CastPlan, LaneSpan, rotationRulesFor } from '@/lib/rules/rotation'
import { emuAcdMs } from '@/lib/rules/server'
import { computeSheet, StatSheet } from './sheet'
import { simulate } from './simulate'
import { ISR_TICK, SP_TICK, spCost, spRegen } from './fight'

const MIN_DELAY = 0.1 // min_skill_delay_limit: 100 ms
// conf/battle/skill.conf: delay_rate 90 and casting_rate 90 (the server cuts 10% of ACD and cast time);
// skill_amotion_leniency 100: every skill is also locked by the attack motion time (amotion = 2000 − 10 × ASPD, ms)
const DELAY_RATE = 0.9
const CAST_RATE = 0.9

export type RotationInput = {
  build: Build
  byId: Map<number, Item>
  steps: string[]
  /** level per skill key for the whole rotation (Simulator's skill palette); capped to the learned level */
  levels?: Record<string, number>
  skills: Map<string, Skill>
  rules: ClassRules
  toggles: Record<string, boolean>
  food: { stat: 'str' | 'agi' | 'vit' | 'int' | 'dex' | 'luk'; value: number } | null
  mob: Mob
  /** multiplies the engine index; null = relative index */
  k: number | null
  /** HP at the start of the rotation, in % of MaxHP; default 100 */
  hpPct?: number
}

export type RotationEvent = {
  skill: string
  name: string
  /** level used in this cast */
  lv: number
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
  /** HP (absolute): at the cast after regen, when it hits (after its own cost), and after the leech */
  hp: { before: number; hit: number; after: number; cost: number; leech: number }
  /** SP at the cast (after regen), what it cost (flat part + % of current SP part) and what was left */
  sp: { before: number; cost: number; flat: number; pctPart: number; after: number }
  /** absorb shield after this cast (leech beyond MaxHP); 0 when the class has none */
  shield: number
}

export type HpPoint = { t: number; pct: number }
export type SpPoint = { t: number; v: number }

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
  /** HP over time, in % of MaxHP; `leech` and `regen` per second used [emu / db] */
  hp: { max: number; series: HpPoint[]; regenPerSec: number; leechPower: number; leechChance: number }
  /** SP over time (absolute, step-shaped at each regen tick and cast) */
  sp: { max: number; series: SpPoint[]; perSec: number; natural: number; isr: number }
  /** absorb shield over time (absolute); null when the class has no shield */
  shield: { max: number; series: SpPoint[] } | null
}

/** Level learned in the Skill Tree (max level when the tree has none). */
export const learnedLv = (b: Build, s: Skill) => Math.min(b.skills[s.key] || s.maxLv, s.maxLv)

/** A rotation step: "key" (learned level) or "key@lv" (chosen level, capped to the learned one). */
export function parseStep(step: string): { key: string; lv: number | null } {
  const at = step.lastIndexOf('@')
  if (at < 0) return { key: step, lv: null }
  const lv = Number(step.slice(at + 1))
  return { key: step.slice(0, at), lv: Number.isInteger(lv) && lv > 0 ? lv : null }
}

export function runRotation(i: RotationInput): RotationResult {
  const { build, skills, rules } = i
  const rr = rotationRulesFor(build.cls)
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
  // ---- SP: RTM regen ticks (natural every 1.2 s, Increase SP Recovery every 4.5 s) ----
  const isrLv = build.skills['trickster/increase-sp-recovery'] ?? 0
  const { maxSp, natural: spNat, isr: spIsr, perSec: spPerSec } = spRegen(base, isrLv)
  let sp = maxSp
  let nextNat = SP_TICK
  let nextIsr = ISR_TICK
  const spSeries: SpPoint[] = [{ t: 0, v: sp }]
  const spPush = (t: number) => { spSeries.push({ t, v: sp }) }
  // applies every regen tick up to `at`
  const spTo = (at: number) => {
    for (;;) {
      const next = Math.min(nextNat, spIsr > 0 ? nextIsr : Infinity)
      if (next > at + 1e-9) break
      spPush(next)
      if (next === nextNat) { sp = Math.min(maxSp, sp + spNat); nextNat += SP_TICK }
      else { sp = Math.min(maxSp, sp + spIsr); nextIsr += ISR_TICK }
      spPush(next)
    }
  }
  // time of the next regen tick (to wait for SP)
  const nextTick = () => Math.min(nextNat, spIsr > 0 ? nextIsr : Infinity)

  // ---- HP: costs, leech and natural regen; Harvest reads it ----
  const maxHp = base.maxHp?.v ?? 0
  let hp = maxHp * Math.min(100, Math.max(1, i.hpPct ?? 100)) / 100
  // natural regen [emu]: every 2 s, (1 + VIT/5 + MaxHP/200) × HP Regen% (status.cpp:5416, player.conf natural_healhp_interval)
  const hpRegenPct = (base.totals.pct.hp_regen ?? 0) + (base.totals.flat.hp_regen ?? 0)
  const regenPerSec = (1 + Math.floor(base.stats.vit / 5) + Math.floor(maxHp / 200)) * Math.max(0, 1 + hpRegenPct / 100) / 2
  // leech: heal = damage × Leech Power, on a Leech Rate chance (expected value; rate above 100% changes nothing)
  const leechPower = base.leechPower.v
  const leechRate = (base.totals.pct.leech_rate ?? 0) + (base.totals.flat.leech_rate ?? 0)
  const leechChance = Math.min(1, Math.max(0, leechRate / 100))
  const pctOf = (x: number) => (maxHp > 0 ? (x / maxHp) * 100 : 100)
  const series: { t: number; pct: number }[] = [{ t: 0, pct: pctOf(hp) }]
  let hpT = 0
  const regenTo = (at: number) => {
    if (at > hpT) {
      hp = Math.min(maxHp, hp + (at - hpT) * regenPerSec)
      series.push({ t: at, pct: pctOf(hp) })
      hpT = at
    }
  }
  // absorb shield: leech beyond MaxHP becomes shield, up to MaxHP + the class extra (Revenant: Ominous Presence)
  const shieldMax = base.shield ? maxHp + base.shield.v : 0
  let shield = 0
  const shieldSeries: SpPoint[] = [{ t: 0, v: 0 }]
  const heal = (dmg: number) => {
    const v = dmg * leechPower / 100 * leechChance
    const over = Math.max(0, hp + v - maxHp)
    hp = Math.min(maxHp, hp + v)
    if (shieldMax > 0 && over > 0) shield = Math.min(shieldMax, shield + over)
    return v
  }

  let t = 0
  const state = rr.init()
  const until: Record<string, number> = {}
  const lanes: Record<string, LaneSpan[]> = Object.fromEntries(rr.lanes.map((l) => [l.id, []]))
  const ready = new Map<string, number>()
  const events: RotationEvent[] = []

  const ctxAt = (key: string, skill: Skill, lv: number, start: number): CastCtx => ({
    key, skill, lv, start, build, byId: i.byId, toggles: i.toggles, hpPct: pctOf(hp), sheet: base, lanes,
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
    if (!d) { notes.push('no damage formula'); return 0 }
    if (d.magic) notes.push('magic damage: MATK × % × skill element × MDEF [simplified]')
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
        const before = hp
        const plan = rr.cast(ax, state)
        const notes = [`autocast by ${by} (${ac.why}): no HP cost`, ...plan.notes]
        const damage = damageOf(as, ac.lv, plan, notes)
        const leech = heal(damage)
        rr.after(ax, state)
        const stacks = rr.stacks?.(state) ?? 0
        out.push({
          skill: ac.key, name: as.name, lv: ac.lv, start: c.start, end: c.start, comboReady: cr, finisherReady: fr,
          stacksBefore: plan.stacksBefore ?? stacks, stacksAfter: stacks, hits: plan.hits, damage, waitedSp: 0,
          notes, autocasts: [], by, hp: { before, hit: before, after: hp, cost: 0, leech },
          sp: { before: sp, cost: 0, flat: 0, pctPart: 0, after: sp }, shield,
        })
      }
    }
    return out
  }

  for (const step of i.steps) {
    const { key, lv: chosen } = parseStep(step)
    const s = skills.get(key)
    if (!s) continue
    const learned = learnedLv(build, s)
    const pick = chosen ?? i.levels?.[key] ?? null
    const lv = pick == null ? learned : Math.max(1, Math.min(pick, learned))
    const d = s.damage
    const notes: string[] = []
    let start = Math.max(t, ready.get(key) ?? 0)
    // SP: regen ticks up to the cast; if short, wait for the next ticks
    const sheetNow = hitOf(s, lv).sheet
    spTo(start)
    let c0 = spCost(sheetNow, s, lv, sp)
    let waited = 0
    const want = start
    while (sp < c0.total && spPerSec > 0) {
      start = nextTick()
      spTo(start)
      c0 = spCost(sheetNow, s, lv, sp)
    }
    if (start > want) {
      waited = start - want
      notes.push(`waited ${waited.toFixed(1)} s for SP`)
    }
    const spBefore = sp
    sp -= c0.total
    spPush(start)
    const spEv = { before: spBefore, cost: c0.total, flat: c0.flat, pctPart: c0.total - c0.flat, after: sp }

    // HP: regen up to the cast, then the skill pays its cost (never below 1), then the damage
    regenTo(start)
    const hpBefore = hp
    const costPct = rr.hpCost?.(key, lv) ?? 0
    let hpCost = 0
    if (costPct > 0) {
      hpCost = Math.min(Math.trunc(hp * costPct / 100), Math.max(0, hp - 1))
      hp -= hpCost
      if (hp <= 1) notes.push('not enough HP: stays at 1')
      series.push({ t: start, pct: pctOf(hp) })
    }
    const hpHit = hp
    const c = ctxAt(key, s, lv, start)
    const cr = c.active('comboReady')
    const fr = c.active('finisherReady')
    const plan = rr.cast(c, state)
    const stacksBefore = plan.stacksBefore ?? rr.stacks?.(state) ?? 0
    notes.push(...plan.notes)
    const damage = damageOf(s, lv, plan, notes)
    const leech = heal(damage)
    rr.after(c, state)
    const autocasts = autocastEvents(c, s.name)
    series.push({ t: start, pct: pctOf(hp) })
    if (shieldMax > 0) shieldSeries.push({ t: start, v: shield })
    if (costPct > 0 || leech > 0) {
      notes.push(`HP ${Math.round(pctOf(hpBefore))}%${hpCost ? ` − ${hpCost} (${costPct}% of current) → ${Math.round(pctOf(hpHit))}% when it hits` : ''}${leech > 0 ? `, leech +${Math.round(leech)}` : ''} → ${Math.round(pctOf(hp))}%`)
    }

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
      skill: key, name: s.name, lv, start, end, comboReady: cr, finisherReady: fr,
      stacksBefore, stacksAfter: rr.stacks?.(state) ?? 0, hits: plan.hits, damage, waitedSp: waited, notes, autocasts,
      hp: { before: hpBefore, hit: hpHit, after: hp, cost: hpCost, leech: leech + autocasts.reduce((a, x) => a + x.hp.leech, 0) },
      sp: spEv, shield,
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
  regenTo(duration)
  spTo(duration)
  spPush(duration)
  if (shieldMax > 0) shieldSeries.push({ t: duration, v: shield })
  return {
    events, total, duration, dps: duration > 0 ? total / duration : 0, bySkill: [...agg.values()], lanes,
    hp: { max: maxHp, series, regenPerSec, leechPower, leechChance },
    sp: { max: maxSp, series: spSeries, perSec: spPerSec, natural: spNat, isr: spIsr },
    shield: shieldMax > 0 ? { max: shieldMax, series: shieldSeries } : null,
  }
}
