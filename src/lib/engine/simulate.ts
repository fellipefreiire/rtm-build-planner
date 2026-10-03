// simulate: StatSheet + Mob -> Encounter. Pure.
import { Build, Mob, Prov, Qty, qty } from '@/lib/types'
import { StatSheet, skillBonus } from './sheet'
import { CRIT_BASE, CRIT_CAP, defMultiplier, elementMultiplier, mobDamageTaken, mobHardDef, mobSoftDef, penEffect, sizeFix } from '@/lib/rules/server'

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

  // 2026-10-02: each category multiplies on its own (battle.cpp battle_calc_cardfix: race, then element, then size,
  // then class); within a category bonuses add. Measured on the local server: vs Large 13% and vs non-boss 13% gave
  // ×1.277, not ×1.26 [emu, rig 2026-10-02]
  const poolRace = sc.dmg_vs_race?.[lower(mob.race)] ?? 0
  const poolSize = sc.dmg_vs_size?.[lower(mob.size)] ?? 0
  const poolEle = sc.dmg_vs_element?.[lower(mob.element)] ?? 0
  const poolClass = mob.mvp ? (sheet.totals.pct.dmg_vs_boss ?? 0) : (sheet.totals.pct.dmg_vs_nonboss ?? 0)
  // "Damage +N%" without a target (Heir Boots/Pendant "vs all sizes/elements") applies against anything
  const poolAny = sheet.totals.pct.dmg_pct ?? 0
  const poolMult = [poolRace, poolSize, poolEle, poolClass, poolAny].reduce((a, v) => a * (1 + v / 100), 1)
  const pools = (poolMult - 1) * 100

  // Seven Winds / Enchant Poison: the best endow vs this target (Venom Mark boosts Poison)
  let elem = { v: sheet.weaponElement.v, from: sheet.weaponElement.from }
  const elMult = (el: string) => elementMultiplier(el, mob.element, mob.elv) * (1 + (sheet.elementBonus[el] ?? 0) / 100)
  const forced = sheet.endowChoices.find((c) => c.forced)
  if (forced) elem = { v: forced.el, from: forced.label }
  else for (const c of sheet.endowChoices) if (elMult(c.el) > elMult(elem.v)) elem = { v: c.el, from: c.label }
  const elemAtk = elMult(elem.v)
  const penEff = penEffect(sheet.defPen.v)
  const mobDefLeft = mob.def * (1 - penEff)
  const defCut = mobHardDef(mobDefLeft)
  // soft DEF (level + VIT/2) is subtracted per hit; penetration read as also cutting it [estimated]
  const mobVit = mob.stats?.[2] ?? 0
  const softDef = mobSoftDef(mob.lv, mobVit) * (1 - penEff)
  // size penalty on the weapon part of the ATK only [emu]
  const sizePct = sizeFix(sheet.weaponType, mob.size)
  const sizeMult = sheet.atk.v > 0 ? 1 - sheet.weaponSizePart * (1 - sizePct / 100) / sheet.atk.v : 1
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
  const boost = skillBonus(sc.skill_dmg, sheet.skillName)
  // Melee% only on short-range attacks; a skill with range >= 4 is ranged and takes Ranged% instead
  const ranged = sheet.rangeType === 'ranged'
  const melee = ranged ? (sheet.totals.pct.ranged_dmg ?? 0) : (sheet.totals.pct.melee_dmg ?? 0)

  // magic skills (Conflagration): MATK × skill % × skill boost × skill element × MDEF, no crit, no physical pools
  // or penetration. Hard MDEF as in renewal: (1000 + MDEF) / (1000 + 10 × MDEF); soft MDEF is ignored [emu, simplified]
  const mdefCut = (1000 + mob.mdef) / (1000 + 10 * mob.mdef)
  // "Magic Damage +7%" (Arch Brooch) and "Dark Magic DMG +10%": overall + the skill's element (weapon element for Dark Messenger)
  const magicAll = sheet.totals.pct.magic_dmg ?? 0
  const magicEl = sc.magic_dmg?.[lower(sheet.weaponElement.v)] ?? 0
  const layers: Layer[] = sheet.magic ? [
    { label: 'MATK', mult: sheet.matk.v, why: sheet.matk.from.join(' · ') },
    { label: 'skill %', mult: skillMult, why: sheet.skillPct ? `${sheet.skillPct.v.toFixed(0)}%` : 'no skill' },
    { label: 'skillboost', mult: 1 + boost / 100, why: `${boost}% skill damage (cards, weapon, shadow)` },
    { label: 'magic damage', mult: 1 + (magicAll + magicEl) / 100, why: `${magicAll}% magic damage + ${magicEl}% ${sheet.weaponElement.v} magic damage` },
    { label: 'target MDEF', mult: mdefCut, why: `MDEF ${mob.mdef}: (1000 + MDEF) / (1000 + 10 × MDEF), soft MDEF ignored [emu, simplified]` },
    { label: 'skill element', mult: elemAtk, why: `${elem.v} (${elem.from}) vs ${mob.element} ${mob.elv}${sheet.elementBonus[elem.v] ? ` · +${sheet.elementBonus[elem.v]}% Venom Mark` : ''}` },
  ] : [
    { label: 'ATK', mult: sheet.atk.v, why: sheet.atk.from.join(' · ') },
    ...(sizePct !== 100 ? [{ label: 'weapon size penalty', mult: sizeMult, why: `${sheet.weaponType} vs ${mob.size}: ${sizePct}% of the weapon ATK (${sheet.weaponSizePart.toFixed(0)}) [emu size_fix.yml]` }] : []),
    { label: 'skill %', mult: skillMult, why: sheet.skillPct ? `${sheet.skillPct.v.toFixed(0)}%` : 'no skill' },
    { label: 'skillboost', mult: 1 + boost / 100, why: `${boost}% skill damage (cards, weapon, shadow)` },
    { label: ranged ? 'ranged' : 'melee', mult: 1 + melee / 100, why: ranged ? `${melee}% ranged damage (skill range ≥ 4: melee bonuses do not apply)` : `${melee}% melee damage` },
    { label: 'critical', mult: critAvg, why: `${(critChance * 100).toFixed(0)}% chance (${sheet.critRate.v >= CRIT_CAP ? `crit ${sheet.critRate.v.toFixed(1)} ≥ ${CRIT_CAP}: always` : `crit ${sheet.critRate.v.toFixed(1)} − target LUK ${mobLuk}/5`}) × (1.4 + ${sheet.critDmg.v}% crit damage)` },
    { label: 'race/size/element pools', mult: poolMult, why: `race ${poolRace}% × size ${poolSize}% × element ${poolEle}% × ${mob.mvp ? 'boss' : 'non-boss'} ${poolClass}% × any ${poolAny}% vs ${mob.race} ${mob.size} ${mob.element} (each category multiplies)` },
    { label: 'target DEF after pen', mult: defCut, why: `DEF ${mob.def} − pen ${sheet.defPen.v} (${(penEff * 100).toFixed(0)}%) → ${mobDefLeft.toFixed(0)}: (4000 + DEF) / (4000 + 10 × DEF) [emu]` },
    { label: 'target soft DEF', mult: 1, why: '' },
    { label: 'weapon element', mult: elemAtk, why: `${elem.v} (${elem.from}) vs ${mob.element} ${mob.elv}${sheet.elementBonus[elem.v] ? ` · +${sheet.elementBonus[elem.v]}% Venom Mark` : ''}` },
  ]
  // soft DEF: a flat cut per hit, shown as the multiplier it is on this hit
  const softIdx = layers.findIndex((l) => l.label === 'target soft DEF')
  if (softIdx >= 0) {
    const before = layers.slice(0, softIdx).reduce((a, l) => a * l.mult, 1)
    if (softDef > 0 && before > 0) {
      layers[softIdx] = { label: 'target soft DEF', mult: Math.max(0, before - softDef) / before, why: `−${softDef.toFixed(0)} per hit: Lv ${mob.lv} + VIT ${mobVit}/2${penEff ? ` × (1 − pen ${(penEff * 100).toFixed(0)}%)` : ''} [emu]` }
    } else layers.splice(softIdx, 1)
  }
  // last multiplier of battle_calc_damage (battle.cpp:1832): most MVPs take 50% [emu]
  const mobTaken = mobDamageTaken(mob.id)
  if (mobTaken !== 100) {
    layers.push({ label: 'target damage taken', mult: mobTaken / 100, why: `${mob.name} takes ${mobTaken}% of the damage (DamageTaken, battle.cpp:1832) [emu ~2024]` })
  }
  // Soul Destroyer's second part: added at the end, no element, no DEF
  const index = layers.reduce((a, l) => a * l.mult, 1) + sheet.skillFlat
  if (sheet.skillFlat) notes.push(`+${Math.round(sheet.skillFlat)} flat from the skill's second damage part (ignores element and DEF) [emu]`)
  if (sheet.weaponWarning) notes.push(`${sheet.weaponWarning}: the equipped weapon cannot cast it`)

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
