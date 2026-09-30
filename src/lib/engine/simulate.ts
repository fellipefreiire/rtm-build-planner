// simulate: StatSheet + Mob -> Encounter. Pure.
import { Build, Mob, Prov, Qty, qty } from '@/lib/types'
import { StatSheet } from './sheet'
import { CRIT_BASE, CRIT_CAP, defMultiplier, elementMultiplier, mobDamageTaken, penEffect } from '@/lib/rules/server'

export type Layer = { label: string; mult: number; why: string }

export type Encounter = {
  /** relative engine index; becomes absolute damage only with an anchor */
  index: number
  damage: Qty | null
  layers: Layer[]
  castsToKill: number | null
  leechPerCast: Qty | null
  /** what the mob does to you */
  incoming: {
    physical: Qty
    magical: Qty
    layersPhysical: Layer[]
    reductionPhysical: number
    reductionMagical: number
  }
  ehp: Qty | null
  notes: string[]
}

const lower = (s: string) => String(s || '').toLowerCase()

export function simulate(build: Build, sheet: StatSheet, mob: Mob): Encounter {
  const notes: string[] = []
  const sc = sheet.totals.scoped

  const pools =
    (sc.dmg_vs_race?.[lower(mob.race)] ?? 0) +
    (sc.dmg_vs_size?.[lower(mob.size)] ?? 0) +
    (sc.dmg_vs_element?.[lower(mob.element)] ?? 0) +
    (mob.mvp ? (sheet.totals.pct.dmg_vs_boss ?? 0) : (sheet.totals.pct.dmg_vs_nonboss ?? 0)) +
    // "Damage +N%" without a target (Heir Boots/Pendant "vs all sizes/elements") applies against anything
    (sheet.totals.pct.dmg_pct ?? 0)

  const elemAtk = elementMultiplier(sheet.weaponElement.v, mob.element, mob.elv)
  const penEff = penEffect(sheet.defPen.v)
  const mobDefLeft = mob.def * (1 - penEff)
  const defCut = defMultiplier(mobDefLeft)
  const critMult = CRIT_BASE + sheet.critDmg.v / 100
  const skillMult = sheet.skillPct ? sheet.skillPct.v / 100 : 1
  // crit chance: RO rule, crit − target LUK ÷ 5 (battle.cpp is_attack_critical).
  // Explains the report "140 = 100% on everything": an MVP with LUK 200 removes 40. The dummy (LUK 0) always crits with crit ≥ 100
  const mobLuk = mob.stats?.[5] ?? 0
  // RTM [player report, confirmed 2026-09-28]: with crit ≥ 140 every hit is critical, on any target (MVPs included)
  const critChance = !sheet.canCrit ? 0
    : sheet.critRate.v >= CRIT_CAP ? 1
    : Math.min(1, Math.max(0, (sheet.critRate.v - mobLuk / 5) / 100))
  const critAvg = critChance * critMult + (1 - critChance)
  const boost = sheet.skillName ? (sc.skill_dmg?.[sheet.skillName] ?? 0) : 0
  const melee = sheet.totals.pct.melee_dmg ?? 0

  const layers: Layer[] = [
    { label: 'ATK', mult: sheet.atk.v, why: sheet.atk.from.join(' · ') },
    { label: 'skill %', mult: skillMult, why: sheet.skillPct ? `${sheet.skillPct.v.toFixed(0)}%` : 'no skill' },
    { label: 'skillboost', mult: 1 + boost / 100, why: `${boost}% skill damage (cards, weapon, shadow)` },
    { label: 'melee', mult: 1 + melee / 100, why: `${melee}% melee damage` },
    { label: 'critical', mult: critAvg, why: `${(critChance * 100).toFixed(0)}% chance (${sheet.critRate.v >= CRIT_CAP ? `crit ${sheet.critRate.v.toFixed(1)} ≥ ${CRIT_CAP}: always` : `crit ${sheet.critRate.v.toFixed(1)} − target LUK ${mobLuk}/5`}) × (1.4 + ${sheet.critDmg.v}% crit damage)` },
    { label: 'race/size/element pools', mult: 1 + pools / 100, why: `${pools}% vs ${mob.race} ${mob.size} ${mob.element}` },
    { label: 'target DEF after pen', mult: defCut.v, why: `DEF ${mob.def} − pen ${sheet.defPen.v} (${(penEff * 100).toFixed(0)}%) → ${mobDefLeft.toFixed(0)}` },
    { label: 'weapon element', mult: elemAtk, why: `${sheet.weaponElement.v} (${sheet.weaponElement.from}) vs ${mob.element} ${mob.elv}` },
  ]
  // last multiplier of battle_calc_damage (battle.cpp:1832): most MVPs take 50% [emu]
  const mobTaken = mobDamageTaken(mob.id)
  if (mobTaken !== 100) {
    layers.push({ label: 'target damage taken', mult: mobTaken / 100, why: `${mob.name} takes ${mobTaken}% of the damage (DamageTaken, battle.cpp:1832) [emu ~2024]` })
  }
  const index = layers.reduce((a, l) => a * l.mult, 1)

  let damage: Qty | null = null
  if (build.anchor && build.anchor.index > 0) {
    const k = build.anchor.dmg / build.anchor.index
    damage = qty(index * k, 'derived', `anchored to ${build.anchor.dmg.toLocaleString('en-US')} measured`)
  } else {
    notes.push('No calibration anchor: damage is a relative index, useful for comparing builds, not for predicting the in-game number.')
  }

  const leechPct = sheet.leechPower.v
  const leechPerCast = damage ? qty(damage.v * leechPct / 100, 'derived', `${leechPct}% leech power`) : null
  const castsToKill = damage && damage.v > 0 ? Math.ceil(mob.hp / damage.v) : null

  // ---- what the mob does to you ----
  const elemDef = elementMultiplier(mob.element, sheet.armorElement.v, 1)
  const myDef = defMultiplier(sheet.def.v)
  const pd = Math.min(100, sheet.perfectDodge.v)
  const parry = Math.min(100, sheet.totals.pct.shadow_parry ?? 0)
  // "Damage taken -5%" is dmg_taken −5; "Damage Reduction +5%" is dmg_reduction +5 (opposite sign)
  const taken = 1 + ((sheet.totals.pct.dmg_taken ?? 0) - (sheet.totals.pct.dmg_reduction ?? 0)) / 100

  // Mob HIT vs your FLEE: hit rate = HIT − FLEE, between 10% and 100% (emu: renewal with base 0,
  // battle.cpp is_attack_hitting + battle.conf min/max_hitrate). Only applies to attacks that do not ignore FLEE.
  const hitChance = Math.min(100, Math.max(10, mob.hit - sheet.flee.v)) / 100
  const layersPhysical: Layer[] = [
    { label: `FLEE ${sheet.flee.v.toFixed(0)}`, mult: hitChance, why: `hit rate = HIT ${mob.hit} − FLEE, between 10% and 100% [emu] · normal attack` },
    { label: 'element', mult: elemDef, why: `${mob.element} ${mob.elv} vs armor ${sheet.armorElement.v} (${sheet.armorElement.from})` },
    { label: `DEF ${sheet.def.v.toFixed(0)}`, mult: myDef.v, why: `curve derived from 1 data point (K=384)` },
    { label: `Perfect Dodge ${pd.toFixed(1)}`, mult: 1 - pd / 100, why: 'dodges normal attacks and physical skills [player report]' },
    { label: `Shadow Parry ${parry}%`, mult: 1 - parry / 100, why: 'reduces physical' },
    { label: 'damage taken', mult: taken, why: 'damage taken modifiers' },
  ]
  const physMult = layersPhysical.reduce((a, l) => a * l.mult, 1)
  // Mob ATK in the emu: (STR + Lv) + ATK × [0.8, 1.2]; here the average. status.cpp:3099/3195
  const mobAtk = (mob.stats?.[0] ?? 0) + mob.lv + mob.atk
  const magMult = elemDef * defMultiplier(sheet.mdef.v).v * taken

  const hp = build.hpOverride ?? sheet.maxHp?.v ?? null
  // the shield cap is MaxHP + the stat portion; without HP, only the stat portion
  const shield = sheet.shield ? sheet.shield.v + (hp ?? 0) : 0
  const ehp = hp != null && physMult > 0
    ? qty((hp + shield) / physMult, 'derived', `(HP ${hp} + shield ${shield.toFixed(0)}) ÷ ${physMult.toFixed(3)}`)
    : null
  if (hp == null) notes.push(`Unknown HP: ${sheet.cls} has no HP table in the emulator; eHP depends on you entering the HP from the status window.`)
  if (!sheet.calibrated) notes.push(`Class ${sheet.cls} has no calibrated model — numbers are marked as not validated.`)

  const provIncoming: Prov = 'derived'
  return {
    index,
    damage,
    layers,
    castsToKill,
    leechPerCast,
    incoming: {
      physical: qty(mobAtk * physMult, provIncoming, `ATK ${mobAtk} (STR ${mob.stats?.[0] ?? 0} + Lv ${mob.lv} + ATK ${mob.atk}) × ${physMult.toFixed(3)}`),
      magical: qty(mob.atk * magMult, provIncoming, `ATK ${mob.atk} × ${magMult.toFixed(3)}`),
      layersPhysical,
      reductionPhysical: 1 - physMult,
      reductionMagical: 1 - magMult,
    },
    ehp,
    notes,
  }
}
