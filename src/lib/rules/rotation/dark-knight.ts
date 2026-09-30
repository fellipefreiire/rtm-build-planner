// Dark Knight rotation: Combo Ready, Harvest (damage from missing HP), Black Metal and gear autocasts.
// Rules from the skill texts in the db; what the text does not say is marked [estimated].
import { equippedNames, learned, RotationRules } from './types'

const DEVIL_RAID = 'dark-knight/devil-raid'
const VENGEANCE = 'dark-knight/vengeance'
const FATAL_MENACE = 'dark-knight/fatal-menace'
const NIGHT_MENACE = 'dark-knight/night-menace'
const CONFLAGRATION = 'dark-knight/conflagration'
const SHATTER_CROSS = 'dark-knight/shatter-cross'
const CHILLING_FROST = 'dark-knight/chilling-frost'

/** Combo Ready from Devil Raid and Vengeance: the text says "enables Combo Ready for follow-up" with no duration [estimated] */
const CR_TIME = 4

/** HP cost or requirement, from the skill text: shown as a note (HP is the Simulator input, it does not move) */
const HP_NOTE: Record<string, (lv: number) => string> = {
  [NIGHT_MENACE]: () => 'costs 20% of current HP',
  [FATAL_MENACE]: () => 'requires extra 10% of current HP',
  [CONFLAGRATION]: (lv) => `requires ${3 * lv}% of current HP`,
  [DEVIL_RAID]: () => 'requires 15% of current HP',
  [VENGEANCE]: () => 'requires 5% of current HP',
  [CHILLING_FROST]: () => 'requires 25% of current HP',
}

export const DARK_KNIGHT_ROTATION: RotationRules<null> = {
  palette: (build, lineageSkills) => learned(build, lineageSkills),
  lanes: [{ id: 'comboReady', label: 'Combo Ready', cls: 'cr', short: () => 'CR' }],
  init: () => null,

  cast: (c) => {
    const cr = c.active('comboReady')
    const harvest = !!c.toggles.harvest
    const missing = Math.max(0, 100 - c.hpPct)
    const str = c.sheet.stats.str
    const maxHp = c.sheet.maxHp?.v ?? 0
    const notes: string[] = []
    let hits = 1
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
      // "Increases Scaling by 1% per 200 Max HP per level" [db, literal reading]
      if (harvest) add(Math.floor(maxHp / 200) * c.lv, `Harvest (1% per 200 MaxHP × Lv${c.lv}) [literal reading]`)
    } else if (c.key === CHILLING_FROST) {
      if (harvest && missing) add(missing, `Harvest (base +1% × ${missing}% HP missing) [estimated]`)
    }
    const hp = HP_NOTE[c.key]
    if (hp) notes.push(hp(c.lv))
    return { hits, mult, pctAdd, notes }
  },

  after: (c) => {
    if (c.key === DEVIL_RAID || c.key === VENGEANCE) c.grant('comboReady', CR_TIME)
    if (c.key === CONFLAGRATION) c.grant('comboReady', 1.5 + 0.25 * c.lv)
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

