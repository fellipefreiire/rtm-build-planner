// fight: one skill cast in a loop for N seconds, limited by cooldown and SP. Pure.
import { Skill } from '@/lib/types'
import { StatSheet } from './sheet'

export type FightInput = {
  sheet: StatSheet
  skill: Skill
  skillLv: number
  /** damage of one cast (absolute if calibrated, index otherwise) */
  perCast: number
  /** seconds between casts */
  cooldown: number
  /** fight duration, in seconds */
  duration: number
  /** learned Increase SP Recovery level */
  isrLv: number
}

export type FightResult = {
  spPerCast: number
  casts: number
  total: number
  /** damage per second over the whole time, including waits for SP */
  dps: number
  /** second at which the first cast was delayed for lack of SP; null = never */
  spOutAt: number | null
  /** SP regenerated per minute (natural + Increase SP Recovery) */
  spRegenPerMin: number
  /** cumulative damage at the end of each second */
  series: number[]
}

const STEP = 0.1

/** Cost of one cast with the character's current SP. */
export function spCost(sheet: StatSheet, skill: Skill, lv: number, currentSp: number): { flat: number; total: number; why: string } {
  // the 2026-09-28 dump already has the post-patch costs (Roaring 25–70, Reaping 5/level)
  const flatBase = Array.isArray(skill.sp) ? skill.sp[Math.min(lv, skill.sp.length) - 1] ?? 0 : skill.sp ?? 0
  // SP Cost −N% from gear. `[open question]` whether it also applies to the current-SP portion: here only the flat part
  const red = (sheet.totals.pct.sp_cost ?? 0) + (sheet.totals.flat.sp_cost ?? 0)
  const flat = Math.max(0, Math.round(flatBase * (1 + red / 100)))
  // "Requires extra N% Current SP": portion of CURRENT SP at cast time
  const cur = skill.damage?.spPct ? Math.trunc(currentSp * skill.damage.spPct / 100) : 0
  return { flat, total: flat + cur, why: skill.damage?.spPct ? `${flatBase} SP + ${skill.damage.spPct}% of current SP` : `${flatBase} SP` }
}

/** Cost at full SP: the most expensive a cast can be. */
export const spPerCast = (sheet: StatSheet, skill: Skill, lv: number) => spCost(sheet, skill, lv, sheet.maxSp?.v ?? 0).total

/**
 * SP regeneration as measured on RTM [measured 2026-09 / local server 2026-09-29]:
 * natural tick every 1.2 s of floor(1 + INT/6 + MaxSP/100) × (1 + SP Regen%) — 21 SP/1.2 s measured at
 * MaxSP 544, INT 41, +75%; and Increase SP Recovery (lv/10) × (20 + 1% MaxSP) every 4.5 s, which
 * SP Regen% does NOT multiply [measured]. The emulator's 8 s interval undercounted it by ~2×.
 */
export const SP_TICK = 1.2
export const ISR_TICK = 4.5
export function spRegen(sheet: StatSheet, isrLv: number) {
  const maxSp = sheet.maxSp?.v ?? 0
  const regenPct = (sheet.totals.pct.sp_regen ?? 0) + (sheet.totals.flat.sp_regen ?? 0)
  const natural = Math.floor((1 + Math.floor(sheet.stats.int / 6) + Math.floor(maxSp / 100)) * Math.max(0, 1 + regenPct / 100))
  const isr = isrLv > 0 ? Math.floor((Math.min(isrLv, 10) / 10) * (20 + maxSp / 100)) : 0
  return { maxSp, natural, isr, perSec: natural / SP_TICK + isr / ISR_TICK }
}

export function runFight(i: FightInput): FightResult {
  const { maxSp, natural, isr, perSec } = spRegen(i.sheet, i.isrLv)
  const spRegenPerMin = perSec * 60

  let sp = maxSp
  let t = 0
  let ready = 0
  let casts = 0
  let total = 0
  let spOutAt: number | null = null
  let nextNat = SP_TICK
  let nextIsr = ISR_TICK
  const series: number[] = []
  let nextSec = 1

  while (t <= i.duration + 1e-9) {
    while (t >= nextNat - 1e-9) { sp = Math.min(maxSp, sp + natural); nextNat += SP_TICK }
    while (isr && t >= nextIsr - 1e-9) { sp = Math.min(maxSp, sp + isr); nextIsr += ISR_TICK }
    if (t >= ready) {
      const cost = spCost(i.sheet, i.skill, i.skillLv, sp).total
      if (sp >= cost) {
        sp -= cost
        casts++
        total += i.perCast
        ready = t + i.cooldown
      } else if (spOutAt === null) {
        spOutAt = Math.round(t * 10) / 10
      }
    }
    if (t >= nextSec - 1e-9) { series.push(total); nextSec++ }
    t = Math.round((t + STEP) * 10) / 10
  }

  return { spPerCast: spPerCast(i.sheet, i.skill, i.skillLv), casts, total, dps: i.duration > 0 ? total / i.duration : 0, spOutAt, spRegenPerMin, series }
}
