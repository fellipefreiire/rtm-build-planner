// Dark Knight rotation: Combo Ready, Harvest (damage from missing HP), Black Metal and gear autocasts.
// Rules from the skill texts in the db; what the text does not say is marked [estimated].
import { emuHits } from '@/lib/rules/server'
import { equippedNames, learned, RotationRules } from './types'

const DEVIL_RAID = 'dark-knight/devil-raid'
const VENGEANCE = 'dark-knight/vengeance'
const FATAL_MENACE = 'dark-knight/fatal-menace'
const NIGHT_MENACE = 'dark-knight/night-menace'
const CONFLAGRATION = 'dark-knight/conflagration'
const SHATTER_CROSS = 'dark-knight/shatter-cross'
const CHILLING_FROST = 'dark-knight/chilling-frost'

/**
 * Combo Ready duration, in s. The text only says "enables Combo Ready for follow-up"; the emulator has it:
 * Devil Raid = TK_JUMPKICK Duration2 2000 ms (skill.cpp:1762), Vengeance = SM_BASH 3000 ms (skill.cpp:1442),
 * Conflagration = WL_HELLINFERNO Duration2 1750…4000 ms, which matches its text (1.5 + 0.25 s per level). [emu]
 */
const CR_TIME: Record<string, (lv: number) => number> = {
  [DEVIL_RAID]: () => 2,
  [VENGEANCE]: () => 3,
  [CONFLAGRATION]: (lv) => 1.5 + 0.25 * lv,
}

/**
 * HP each skill takes from CURRENT HP, from the skill text. Harvest reads the HP AFTER the skill pays it:
 * measured in-game 2026-09-30 (lv47), Night Menace at full HP in Harvest hit 3250 — the formula at 80% HP
 * gives ~3350, at 100% ~2390. The engine pays it before the damage and passes the HP left as `hpPct`.
 */
const HP_COST: Record<string, (lv: number) => number> = {
  [NIGHT_MENACE]: () => 20,           // "Costs 20% of current HP to cast"
  [FATAL_MENACE]: () => 10,           // "Requires extra 10% Current HP to cast"
  [CONFLAGRATION]: (lv) => 3 * lv,    // "Requires 3% Current HP per level"
  [VENGEANCE]: () => 5,               // "Requires 5% Current HP" (emulator: HpRateCost 5)
  [CHILLING_FROST]: () => 25,         // "Requires 25% Current HP"
  // Devil Raid: "Requires 15% Current HP"; the emulator charged 10% of MaxHP. Measured at full HP in Harvest
  // 2026-09-30: 1350, which the formula reaches with ~10% [estimated]
  [DEVIL_RAID]: () => 10,
}

export const DARK_KNIGHT_ROTATION: RotationRules<null> = {
  palette: (build, lineageSkills) => learned(build, lineageSkills),
  lanes: [{ id: 'comboReady', label: 'Combo Ready', cls: 'cr', short: () => 'CR' }],
  hpCost: (key, lv) => HP_COST[key]?.(lv) ?? 0,
  init: () => null,

  cast: (c) => {
    const cr = c.active('comboReady')
    const harvest = !!c.toggles.harvest
    // c.hpPct is already the HP after the skill paid its own cost
    const missing = Math.max(0, Math.round((100 - c.hpPct) * 10) / 10)
    const str = c.sheet.stats.str
    const maxHp = c.sheet.maxHp?.v ?? 0
    const notes: string[] = []
    // Night Menace, Devil Raid and Vengeance hit twice (HitCount 2 in the emulator); Night Menace measured
    // in-game 2026-09-30: 2240 without Combo Ready and 5200 with it, against 2270 and 5276 with 2 hits
    let hits = emuHits(c.skill.icon)
    let mult = 1
    let pctAdd = 0
    const add = (v: number, why: string) => { pctAdd += v; notes.push(`+${Math.round(v)}% ${why}`) }
    const times = (v: number, why: string) => { mult *= v; notes.push(`×${v.toFixed(2)} ${why}`) }

    if (c.key === FATAL_MENACE) {
      if (cr) add(3 * str, `Combo Ready (3% × STR ${str})`)
      if (harvest && missing) times(1 + missing / 100, `Harvest (1% × ${missing}% HP missing)`)
    } else if (c.key === NIGHT_MENACE) {
      if (cr) add(50 * c.lv + 3 * str, `Combo Ready (50% × Lv${c.lv} + 3% × STR ${str})`)
      if (harvest && missing) times(1 + 2 * missing / 100, `Harvest (2% × ${missing}% HP missing)`)
    } else if (c.key === VENGEANCE) {
      if (harvest && missing) times(1 + missing / 100, `Harvest (1% × ${missing}% HP missing)`)
    } else if (c.key === DEVIL_RAID) {
      // "Increase Base Damage by 1% per missing HP %": read as percentage points on the skill % [estimated]
      if (harvest && missing) add(missing, `Harvest (base +1% × ${missing}% HP missing) [estimated]`)
      if (c.toggles.blackMetal) times(2, 'Black Metal')
    } else if (c.key === CONFLAGRATION) {
      hits = 2 // "Damage is dealt twice in separate hits"
      const lost = Math.floor(maxHp * missing / 100)
      if (lost >= 50) add(Math.floor(lost / 50), `${lost} HP missing (1% per 50)`)
      // "Increases Scaling by 1% per 200 Max HP per level": the emulator has exactly that, on MATK
      // (WL_HELLINFERNO: skillratio += MaxHP / 200 × skill_lv under SC_NEN, battle.cpp:6973) [emu]
      if (harvest) add(Math.floor(maxHp / 200) * c.lv, `Harvest (1% per 200 MaxHP × Lv${c.lv}) [emu]`)
    } else if (c.key === CHILLING_FROST) {
      if (harvest && missing) add(missing, `Harvest (base +1% × ${missing}% HP missing) [estimated]`)
    }
    // Conflagration is Dark magic (emulator: WL_HELLINFERNO, Element DARK, battle_calc_magic_attack)
    return { hits, mult, pctAdd, notes, ...(c.key === CONFLAGRATION ? { element: 'Dark' } : {}) }
  },

  after: (c) => {
    const cr = CR_TIME[c.key]
    if (cr) c.grant('comboReady', cr(c.lv))
  },

  // no cast time, no SP, outside the cooldown, with the Combo Ready of the moment [estimated]
  autocasts: (c) => {
    const eq = equippedNames(c.build, c.byId)
    const lvOf = (k: string) => Math.max(1, c.build.skills[k] ?? 0)
    const out = []
    if (c.key === DEVIL_RAID && eq.has('Forgotten Egnigem Card')) out.push({ key: VENGEANCE, lv: 1, times: 2, why: 'Forgotten Egnigem Card' })
    if (c.key === DEVIL_RAID && eq.has('Darkness Metal Sword')) out.push({ key: SHATTER_CROSS, lv: lvOf(SHATTER_CROSS), times: 1, why: 'Darkness Metal Sword' })
    // "Night Menace Autocasts Fatal Menace": level not stated, the learned one [estimated]
    if (c.key === NIGHT_MENACE && eq.has('Devil Gem of Bidding')) out.push({ key: FATAL_MENACE, lv: lvOf(FATAL_MENACE), times: 1, why: 'Devil Gem of Bidding' })
    return out
  },
}

