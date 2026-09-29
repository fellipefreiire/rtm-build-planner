// Rules that appear in no dump text — written by hand, one per class.
// Only Revenant is calibrated.
import { Prov, StatKey } from '@/lib/types'

export type Extra = { label: string; value: number; prov: Prov; why: string }

export type RuleCtx = {
  stats: Record<StatKey, number>
  toggles: Record<string, boolean>
  /** chosen damage skill and the level used in the calculation */
  skillKey: string | null
  skillLv: number
  baseLv: number
  /** Leech Power in percentage points (21% = 21) */
  leechPower: number
  /** points allocated in the skill tree, by skill key */
  skills: Record<string, number>
}

export type Toggle = {
  id: string; label: string; default: boolean; why: string
  /** skill tree entry that must be learned for the buff to exist */
  skill?: string
}

/** Buff modifier: applied together with gear, before stats. */
export type BuffMod = { key: string; value: number; pct: boolean; label: string }

export type ClassRules = {
  name: string
  calibrated: boolean
  toggles: Toggle[]
  /** buffs only the Simulator turns on (the Planner shows unbuffed status) */
  simBuffs: Toggle[]
  /** mods from active buffs, added before stats */
  buffMods: (toggles: Record<string, boolean>) => BuffMod[]
  /** percentage points added to the skill %, beyond what the dump declares */
  skillPctExtra: (c: RuleCtx) => Extra[]
  /** absorb shield, if the class has one */
  shield: (c: RuleCtx) => Extra | null
  /** passive bonuses from learned skills, per stat. They go into the "base" half of the status window */
  passives: (c: PassiveCtx) => Partial<Record<PassiveKey, Extra[]>>
  /** bonuses the class has with no items and no skills allocated in the planner (measured) */
  innate: { hpRate: number; hit: number; pd: number; why: string } | null
}

export type PassiveKey = 'atk' | 'crit' | 'flee' | 'hit' | 'pd'
export type PassiveCtx = {
  /** points allocated in the skill tree, by skill key */
  skills: Record<string, number>
  /** weapon type in the emulator (Scythe = Mace) */
  weaponType: string
}

/** Adds an "N per level" passive if the skill is learned. */
const perLv = (c: PassiveCtx, key: string, each: number, label: string, why: string): Extra[] => {
  const lv = c.skills[key] ?? 0
  return lv > 0 ? [{ label: `${label} Lv${lv}`, value: each * lv, prov: 'db', why }] : []
}

const GENERIC = (name: string): ClassRules => ({
  name,
  calibrated: false,
  toggles: [],
  simBuffs: [],
  buffMods: () => [],
  skillPctExtra: () => [],
  shield: () => null,
  passives: () => ({}),
  innate: null,
})

const REVENANT: ClassRules = {
  name: 'Revenant',
  calibrated: true,
  // The Planner shows no buffs (2026-09-28). Buffs only come back in the Simulator.
  toggles: [],
  simBuffs: [
    { id: 'darkside', skill: 'revenant/darkside-shadow', label: 'Darkside Shadow', default: true, why: '+2% per DEX on physical skill %. Lv10, permanent uptime. [db]' },
    { id: 'comboReady', skill: 'revenant/reaping-slash', label: 'Combo Ready', default: true, why: 'Without it Roaring loses 13%/level (battle.cpp:4743). [emu]' },
    { id: 'trueSight', skill: 'trickster/true-sight', label: 'True Sight', default: false, why: 'Crit +30 (before the ×1.15 from Baphomet Jr.), All Stats +3, Hit +30. 60 s / CD 80 s = 75%. [base]' },
    { id: 'vampireMark', skill: 'revenant/vampire-mark', label: 'Vampire Mark', default: false, why: 'Leech Power +15, which does NOT count toward the shield [player report 2026-09-28]. 40 s / CD 60 s.' },
    { id: 'burningScythe', skill: 'trickster/burning-scythe', label: 'Burning Scythe', default: false, why: 'Fire endow on the weapon, only when no item already grants an element.' },
  ],
  buffMods: (t) => [
    ...(t.trueSight ? [
      { key: 'all_stats', value: 3, pct: false, label: 'True Sight' },
      { key: 'crit_rate', value: 30, pct: false, label: 'True Sight' },
      { key: 'hit', value: 30, pct: false, label: 'True Sight' },
    ] : []),
    ...(t.vampireMark ? [{ key: 'leech_power_buff', value: 15, pct: true, label: 'Vampire Mark' }] : []),
  ],
  skillPctExtra: ({ stats, toggles, skillKey, skillLv }) => {
    const out: Extra[] = []
    // Roaring's +2% per LUK comes from the dump since 2026-09-28 (it used to be patched here)
    if (toggles.darkside) {
      out.push({ label: 'Darkside Shadow', value: 2 * stats.dex, prov: 'reported', why: '+2% per DEX on physical skills' })
    }
    if (toggles.comboReady === false && skillKey === 'revenant/roaring-overslash') {
      out.push({ label: 'without Combo Ready', value: -13 * skillLv, prov: 'emu', why: '150 + 2%/lv instead of 150 + 15%/lv (battle.cpp:4743)' })
    }
    return out
  },
  // Current RTM text; the emulator confirms the FLEE (status.cpp:4856) and the in-game
  // reading of 2026-09-26 matches: FLEE 274 = base formula + 20 from Advanced Scythe Mastery Lv10.
  passives: (c) => {
    const adv = 'revenant/advanced-scythe-mastery'
    const sm = 'trickster/scythe-mastery'
    // Scythe Mastery's PD applies without a scythe: naked on 2026-09-27 the PD was formula + 5 from pet + 10
    const pd = perLv(c, sm, 1, 'Scythe Mastery', '1 Perfect Dodge per level, with or without a scythe')
    if (c.weaponType !== 'Mace') return { pd }   // Scythe in the emulator
    return {
      atk: [
        ...perLv(c, adv, 5, 'Advanced Scythe Mastery', '5 ATK per level'),
        ...perLv(c, sm, 2, 'Scythe Mastery', '2 ATK per level'),
      ],
      crit: [
        ...perLv(c, adv, 1, 'Advanced Scythe Mastery', '1 crit per level'),
        ...perLv(c, sm, 1, 'Scythe Mastery', '1 crit per level'),
      ],
      flee: perLv(c, adv, 2, 'Advanced Scythe Mastery', '2 FLEE per level'),
      pd,
    }
  },
  // No items and no skills allocated in the planner: comes from the naked reading.
  innate: {
    hpRate: 10,
    hit: 25,
    pd: 0,
    why: 'measured naked: HP = formula × 1.10 and HIT = formula + 25 (2026-09-27 and 2026-09-28, the latter with skills reset). '
      + 'The "PD +15" of 2026-09-27 was Reaper Shell 5 + Scythe Mastery 10: on 2026-09-28, with no skills, PD was 6 = 1 + 5 from pet',
  },
  // Shield cap = MaxHP + (10% × SkillLv) × (STR + 2×LUK + BaseLv) × LeechPower
  // [tooltip 2026-09-21]. Only the part without MaxHP here: the server has no
  // HP formula, and simulate is what adds the HP.
  shield: ({ stats, baseLv, leechPower, skills }) => {
    const lv = skills['revenant/ominous-presence'] ?? 0
    if (!lv) return null
    const sum = stats.str + 2 * stats.luk + baseLv
    return {
      label: `Ominous Presence Lv${lv}`,
      value: Math.floor(lv / 10 * sum * leechPower),
      prov: 'reported',
      why: `MaxHP + ${lv * 10}% × (STR ${stats.str} + 2×LUK ${stats.luk} + BaseLv ${baseLv} = ${sum}) × LP ${leechPower} [tooltip 2026-09-21]`,
    }
  },
}

const TABLE: Record<string, ClassRules> = { Revenant: REVENANT }

export const rulesFor = (cls: string): ClassRules => TABLE[cls] ?? GENERIC(cls)

/**
 * Effective toggles of a build in the Simulator: a buff whose skill is not learned stays
 * off. Combo Ready is on by default (only off if the user unchecks it).
 */
export function learnedToggles(rules: ClassRules, skills: Record<string, number>, chosen: Record<string, boolean>) {
  return Object.fromEntries(rules.simBuffs.map((t) => {
    const learned = !t.skill || (skills[t.skill] ?? 0) > 0
    const on = t.id === 'comboReady' ? chosen[t.id] !== false : !!chosen[t.id]
    return [t.id, learned && on]
  }))
}
