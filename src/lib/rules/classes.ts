// Rules that appear in no dump text — written by hand, one per class.
// Only Revenant is calibrated. Trickster reuses the Revenant pieces that come from Trickster skills.
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
  /** weapon type in the emulator (Scythe = Mace) */
  weaponType?: string
  /** a weapon in the off-hand */
  dualWield?: boolean
}

export type Toggle = {
  id: string; label: string; default: boolean; why: string
  /** skill tree entry that must be learned for the buff to exist */
  skill?: string
  /** buff with a level choice in the Simulator (Seven Winds: 0 = best vs the target, 1..7 = that element) */
  levels?: { lv: number; label: string }[]
  /** the choices are a count (coins), not skill levels: do not cap them at the learned level */
  levelsAreCount?: boolean
}

/** Buff modifier: applied together with gear, before stats. */
export type BuffMod = { key: string; value: number; pct: boolean; label: string }

export type ClassRules = {
  name: string
  calibrated: boolean
  toggles: Toggle[]
  /** buffs only the Simulator turns on (the Planner shows unbuffed status) */
  simBuffs: Toggle[]
  /** mods from active buffs, added before stats (skills and BASE stats for buffs that scale) */
  buffMods: (toggles: Record<string, boolean>, c?: { skills: Record<string, number>; stats: Record<StatKey, number>; baseLv?: number }) => BuffMod[]
  /** percentage points added to the skill %, beyond what the dump declares */
  skillPctExtra: (c: RuleCtx) => Extra[]
  /** absorb shield, if the class has one */
  shield: (c: RuleCtx) => Extra | null
  /** passive bonuses from learned skills, per stat. They go into the "base" half of the status window */
  passives: (c: PassiveCtx) => Partial<Record<PassiveKey, Extra[]>>
  /** bonuses the class has with no items and no skills allocated in the planner (measured) */
  innate: { hpRate: number; hit: number; pd: number; why: string } | null
  /** weapon endows the class can cast (Seven Winds, Enchant Poison); the Simulator picks the best vs the target */
  endows?: (toggles: Record<string, boolean>, skills: Record<string, number>) => { el: string; label: string; forced?: boolean }[]
  /** % extra damage of an attack element on the target (Venom Mark: Poison) */
  elementBonus?: (toggles: Record<string, boolean>, skills: Record<string, number>) => Record<string, number>
  /** class rules for Shadow gear: extra refine per piece and sets that activate with a single piece */
  shadow?: { refineBonus: number; singlePieceSets: boolean; why: string }
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

// Hallucination Walk (Unchained Thief and Assassin trees, same text): "Flee bonus is 10 per lv"; Fan of Knives gains
// AGI per Improve Dodge level and Shadow Slash +5% per Improve Dodge level while it is up [db]. 50 s / CD 120 s at Lv5
const HW_KEYS = ['unchained-thief/hallucination-walk', 'assassin/hallucination-walk']
const HW_BUFFS: Toggle[] = HW_KEYS.map((skill) => ({
  id: 'hallucinationWalk', skill, label: 'Hallucination Walk', default: true,
  why: 'FLEE +10/level; Fan of Knives + AGI × Improve Dodge level (after its level multiplier, battle.cpp:3632); Shadow Slash +5% per Improve Dodge level. 50 s / CD 120 s at Lv5 (41.7% uptime) [db; uptime measured 2026-09-18]. Needs a Shadow Orb.',
}))
const hwLv = (skills: Record<string, number>) => Math.max(...HW_KEYS.map((k) => skills[k] ?? 0))
const hwMods = (t: Record<string, boolean>, c?: { skills: Record<string, number> }): BuffMod[] => {
  const lv = c ? hwLv(c.skills) : 0
  return t.hallucinationWalk && lv ? [{ key: 'flee', value: 10 * lv, pct: false, label: 'Hallucination Walk' }] : []
}
/** Shadow Slash: "Damage increases by 5% per Improve Dodge level while under Hallucination Walk" [db] */
const hwShadowSlash = ({ toggles, skillKey, skills }: RuleCtx): Extra[] => {
  if (!toggles.hallucinationWalk || !/\/shadow-slash$/.test(skillKey ?? '') || !hwLv(skills)) return []
  const id = skills['thief/improve-dodge'] ?? 0
  return id ? [{ label: `Hallucination Walk: Improve Dodge Lv${id}`, value: 5 * id, prov: 'db', why: '+5% per Improve Dodge level while under Hallucination Walk' }] : []
}

/**
 * Fan of Knives ATK. Shape from the emulator (battle.cpp:3632, KO_HAPPOKUNAI) [emu 2024]:
 *   k × (status ATK + right weapon ATK + ammo ATK) × (level + 1) / 5
 *   + AGI × Improve Dodge level, only under Hallucination Walk — added AFTER the level multiplier
 * The 2024 code has k = 3 with status ATK twice. Patch of 2026-09-02: "no longer counts Status ATK twice. Its base
 * coefficient was adjusted alongside it; on a normal build this is around a 20% damage reduction" [db]. Status ATK
 * once matches the reading of 2026-09-18 (+1 status ATK = +12 damage); "−20%" with status ATK 150–180 and that reading
 * give ~9 at Lv10, so k = 4.2 (×9.24 at Lv10) [estimated]. The per-level scaling after the patch and the
 * Hallucination Walk term are not measured. Flat ATK from gear is not in the pool [measured]. No size penalty; skill
 * ratio 100%; DEF, FLEE and element ignored [emu 2024]. See base/servidor/fan-of-knives.md
 */
const FOK_K = 4.2
export function fanOfKnivesAtk(c: RuleCtx & { statusAtk: number; weaponAtk: number; ammoAtk: number }): { pool: number; parts: string[] } | null {
  if (!/\/fan-of-knives$/.test(c.skillKey ?? '')) return null
  const lv = c.skillLv || 10
  const raw = c.statusAtk + c.weaponAtk + c.ammoAtk
  const base = Math.floor(FOK_K * raw * (lv + 1) / 5)
  const id = c.skills['thief/improve-dodge'] ?? 0
  const hw = c.toggles.hallucinationWalk && hwLv(c.skills) ? c.stats.agi * id : 0
  return {
    pool: base + hw,
    parts: [
      `Fan of Knives Lv${lv}: ${FOK_K} × (status ATK ${c.statusAtk} + right weapon ${c.weaponAtk} + ammo ${c.ammoAtk}) × ${lv + 1} / 5 = ${base} [estimated after the 02/09 patch]`,
      hw ? `Hallucination Walk: + AGI ${c.stats.agi} × Improve Dodge ${id} = ${hw} (after the level multiplier) [emu 2024, not measured]` : '',
      'flat ATK from gear not counted [measured 2026-09-18]',
    ],
  }
}

const GENERIC = (name: string): ClassRules => ({
  name,
  calibrated: false,
  toggles: [],
  // only shows when the skill is learned (Assassin, Night Raven)
  simBuffs: HW_BUFFS,
  buffMods: hwMods,
  skillPctExtra: hwShadowSlash,
  shield: () => null,
  passives: () => ({}),
  innate: null,
})

/** Scythe Mastery (Trickster skill, so Revenant inherits it): ATK and crit with a scythe, PD with or without. */
const scytheMastery = (c: PassiveCtx) => {
  const sm = 'trickster/scythe-mastery'
  // Scythe Mastery's PD applies without a scythe: naked on 2026-09-27 the PD was formula + 5 from pet + 10
  const pd = perLv(c, sm, 1, 'Scythe Mastery', '1 Perfect Dodge per level, with or without a scythe')
  const scythe = c.weaponType === 'Mace'   // Scythe in the emulator
  return {
    pd,
    atk: scythe ? perLv(c, sm, 2, 'Scythe Mastery', '2 ATK per level') : [],
    crit: scythe ? perLv(c, sm, 1, 'Scythe Mastery', '1 crit per level') : [],
  }
}

/** Trickster buffs, shared by Revenant. */
const TRICKSTER_BUFFS: Toggle[] = [
  { id: 'trueSight', skill: 'trickster/true-sight', label: 'True Sight', default: false, why: 'All Stats +3; Hit and Crit +3 per level (crit before the ×1.15 from Baphomet Jr.). 60 s / CD 80 s = 75%. [db]' },
  { id: 'burningScythe', skill: 'trickster/burning-scythe', label: 'Burning Scythe', default: false, why: 'Fire endow on the weapon, only when no item already grants an element.' },
]

/** "Increases all stats by 3 for duration. Increases hit by 3 and crit by 3 per level." [db] */
const trueSightMods = (t: Record<string, boolean>, skills?: Record<string, number>): BuffMod[] => {
  if (!t.trueSight) return []
  const lv = skills?.['trickster/true-sight'] ?? 10
  return [
    { key: 'all_stats', value: 3, pct: false, label: 'True Sight' },
    { key: 'crit_rate', value: 3 * lv, pct: false, label: 'True Sight' },
    { key: 'hit', value: 3 * lv, pct: false, label: 'True Sight' },
  ]
}

/** HP ×1.10 and HIT +25 with nothing equipped: same on Revenant and Dark Knight. */
const INNATE = { hpRate: 10, hit: 25, pd: 0 }

/** Skills Darkside Shadow currently skips on RTM (server bug, 2026-10-01). */
const DARKSIDE_BUGGED = new Set(['trickster/scythe-reap', 'revenant/reaping-slash'])

const REVENANT: ClassRules = {
  name: 'Revenant',
  calibrated: true,
  // The Planner shows no buffs (2026-09-28). Buffs only come back in the Simulator.
  toggles: [],
  simBuffs: [
    { id: 'darkside', skill: 'revenant/darkside-shadow', label: 'Darkside Shadow', default: true, why: '+2% per DEX on physical skill %. Lv10, permanent uptime. [db]' },
    { id: 'comboReady', skill: 'revenant/reaping-slash', label: 'Combo Ready', default: true, why: 'Without it Roaring loses 13%/level (battle.cpp:4743). [emu]' },
    TRICKSTER_BUFFS[0],
    { id: 'vampireMark', skill: 'revenant/vampire-mark', label: 'Vampire Mark', default: false, why: 'Leech Power +15, which does NOT count toward the shield [player report 2026-09-28]. 40 s / CD 60 s.' },
    TRICKSTER_BUFFS[1],
  ],
  buffMods: (t, c) => [
    ...trueSightMods(t, c?.skills),
    ...(t.vampireMark ? [{ key: 'leech_power_buff', value: 15, pct: true, label: 'Vampire Mark' }] : []),
  ],
  skillPctExtra: ({ stats, toggles, skillKey, skillLv }) => {
    const out: Extra[] = []
    // Roaring's +2% per LUK comes from the dump since 2026-09-28 (it used to be patched here)
    // Server bug [player report 2026-10-01]: Darkside does not apply to Scythe Reap nor Reaping Slash.
    // Remove the skills from this list when RTM fixes it.
    if (toggles.darkside && !DARKSIDE_BUGGED.has(skillKey ?? '')) {
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
    const sm = scytheMastery(c)
    if (c.weaponType !== 'Mace') return { pd: sm.pd }   // Scythe in the emulator
    return {
      atk: [...perLv(c, adv, 5, 'Advanced Scythe Mastery', '5 ATK per level'), ...sm.atk],
      crit: [...perLv(c, adv, 1, 'Advanced Scythe Mastery', '1 crit per level'), ...sm.crit],
      flee: perLv(c, adv, 2, 'Advanced Scythe Mastery', '2 FLEE per level'),
      pd: sm.pd,
    }
  },
  // No items and no skills allocated in the planner: comes from the naked reading.
  innate: {
    ...INNATE,
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

// Trickster: not calibrated. Same pieces as Revenant minus what comes from Revenant skills
// (Darkside, Advanced Scythe Mastery, Vampire Mark, Ominous Presence shield).
const TRICKSTER: ClassRules = {
  ...GENERIC('Trickster'),
  simBuffs: TRICKSTER_BUFFS,
  buffMods: (t, c) => trueSightMods(t, c?.skills),
  passives: (c) => {
    const sm = scytheMastery(c)
    return c.weaponType === 'Mace' ? sm : { pd: sm.pd }
  },
  innate: { ...INNATE, why: '[estimated] same as Revenant and Dark Knight (HP = formula × 1.10, HIT = formula + 25); confirm naked on the Trickster' },
}

// Dark Knight: not calibrated. The buffs come from the skill texts; the rotation rules
// (Combo Ready, Harvest by missing HP, autocasts) live in rules/rotation/dark-knight.ts.
const DARK_KNIGHT: ClassRules = {
  ...GENERIC('Dark Knight'),
  // same as Revenant: in-game 2026-09-30 (lv47) HP 1437 against 1307 from the formula (×1.10) and HIT 344 against 319 (+25)
  innate: { hpRate: 10, hit: 25, pd: 0, why: 'measured in-game 2026-09-30 at lv47: HP = formula × 1.10 and HIT = formula + 25, as on Revenant' },
  simBuffs: [
    { id: 'harvest', skill: 'dark-knight/harvest', label: 'Harvest', default: true, why: 'STR and INT +1 per level; skills scale with missing HP (set the HP of the rotation). Blocks healing from skills. [db]' },
    { id: 'blackMetal', skill: 'dark-knight/black-metal', label: 'Black Metal', default: true, why: 'Party ATK/MATK +10; Devil Raid damage is doubled. [db]' },
    { id: 'knightRitual', skill: 'dark-knight/knight-ritual', label: 'Knight Ritual', default: true, why: 'STR and VIT +(2 + level)%, of the base stat [estimated]. Removes Harvest when cast. [db]' },
  ],
  buffMods: (t, c) => {
    const lv = (k: string) => c?.skills[k] ?? 0
    const out: BuffMod[] = []
    const h = lv('dark-knight/harvest')
    if (t.harvest && h) out.push({ key: 'str', value: h, pct: false, label: 'Harvest' }, { key: 'int', value: h, pct: false, label: 'Harvest' })
    if (t.blackMetal) out.push({ key: 'atk', value: 10, pct: false, label: 'Black Metal' })
    const kr = lv('dark-knight/knight-ritual')
    if (t.knightRitual && kr && c) {
      const pct = 2 + kr
      out.push(
        { key: 'str', value: Math.floor(c.stats.str * pct / 100), pct: false, label: 'Knight Ritual' },
        { key: 'vit', value: Math.floor(c.stats.vit * pct / 100), pct: false, label: 'Knight Ritual' },
      )
    }
    return out
  },
}

// Thief line (Thief, Unchained Thief, Phantom Thief): not calibrated. Passives from the skill texts [db].
const thiefPassives = (c: PassiveCtx) => {
  const blade = c.weaponType === 'Dagger' || c.weaponType === '1hSword'
  return {
    atk: blade ? perLv(c, 'unchained-thief/blade-mastery', 3, 'Blade Mastery', '3 ATK per level with a sword or dagger') : [],
    flee: [
      ...perLv(c, 'thief/improve-dodge', 4, 'Improve Dodge', '4 FLEE per level'),
      ...perLv(c, 'unchained-thief/shadow-mastery', 3, 'Shadow Mastery', '3 FLEE per level'),
    ],
  }
}
// "Bonus is 1 HP per skill level, per Base Level" and "2 SP per skill level, per 3 Base Levels" [db]; ASPD +1%/level from
// Shadow Mastery (any weapon). Blade Mastery's ASPD +1%/level needs the weapon type, which buffMods does not see: not modeled
const thiefBuffMods: ClassRules['buffMods'] = (_t, c) => {
  if (!c) return []
  const lv = (k: string) => c.skills[k] ?? 0
  const base = c.baseLv ?? 0
  const out: BuffMod[] = []
  if (lv('thief/improve-defense')) out.push({ key: 'hp', value: lv('thief/improve-defense') * base, pct: false, label: 'Improve Defense' })
  if (lv('thief/improve-wisdom')) out.push({ key: 'sp', value: 2 * lv('thief/improve-wisdom') * Math.floor(base / 3), pct: false, label: 'Improve Wisdom' })
  if (lv('unchained-thief/shadow-mastery')) out.push({ key: 'aspd', value: lv('unchained-thief/shadow-mastery'), pct: true, label: 'Shadow Mastery' })
  return out
}
// Thief line buffs (texts of today) [db]
const SEVEN_WINDS = ['Earth', 'Wind', 'Water', 'Fire', 'Ghost', 'Dark', 'Holy']   // Lv1..Lv7
const THIEF_LINE_BUFFS: Toggle[] = [
  { id: 'enchantPoison', skill: 'thief/enchant-poison', label: 'Enchant Poison', default: false, why: 'Endow Poison ("all physical attacks become poison element"). The Simulator only uses it when Poison is the best element vs the target. [db]' },
  { id: 'fury', skill: 'unchained-thief/fury', label: 'Fury', default: false, why: 'CRIT +1/level (doubled with Katars); Sonic Blow and Impact Tooth base damage +50%. Needs a Shadow Orb. [db]' },
  { id: 'cloaking', skill: 'unchained-thief/cloaking', label: 'Cloaking', default: false, why: 'CRIT +3/level while cloaked. [db]' },
  { id: 'morrocsMark', skill: 'orphan/morroc-s-mark', label: "Morroc's Mark", default: false, why: 'All Stats +10% for 10 s (read as 10% of the base stats) [estimated]; 60 min cooldown (Unbound Gem cuts it). [db]' },
  HW_BUFFS[0],
]
const thiefLineMods = (t: Record<string, boolean>, c?: { skills: Record<string, number>; stats: Record<StatKey, number> }): BuffMod[] => {
  if (!c) return []
  const lv = (k: string) => c.skills[k] ?? 0
  const out: BuffMod[] = []
  if (t.fury && lv('unchained-thief/fury')) {
    out.push({ key: 'crit_rate', value: lv('unchained-thief/fury'), pct: false, label: 'Fury' })
    for (const sk of ['sonic blow', 'impact tooth']) out.push({ key: 'skill_dmg:' + sk, value: 50, pct: true, label: 'Fury' })
  }
  if (t.cloaking && lv('unchained-thief/cloaking')) out.push({ key: 'crit_rate', value: 3 * lv('unchained-thief/cloaking'), pct: false, label: 'Cloaking' })
  if (t.morrocsMark && lv('orphan/morroc-s-mark')) {
    for (const st of ['str', 'agi', 'vit', 'int', 'dex', 'luk'] as StatKey[]) out.push({ key: st, value: Math.floor(c.stats[st] * 0.1), pct: false, label: "Morroc's Mark" })
  }
  return out
}
const thiefEndows: NonNullable<ClassRules['endows']> = (t, skills) => {
  const out: { el: string; label: string; forced?: boolean }[] = []
  const sw = skills['phantom-thief/seven-winds'] ?? 0
  // level picked in the Simulator ("sevenWinds:lv3"): that element, even if another would hit harder
  const picked = SEVEN_WINDS.findIndex((_, i) => t[`sevenWinds:lv${i + 1}`]) + 1
  if (t.sevenWinds && sw && picked && picked <= sw) return [{ el: SEVEN_WINDS[picked - 1], label: `Seven Winds Lv${picked}`, forced: true }]
  if (t.sevenWinds && sw) SEVEN_WINDS.slice(0, sw).forEach((el, i) => out.push({ el, label: `Seven Winds Lv${i + 1}` }))
  if (t.enchantPoison && (skills['thief/enchant-poison'] ?? 0)) out.push({ el: 'Poison', label: 'Enchant Poison' })
  return out
}
// Back Stab "Single-Wielding a Dagger: AGI bonus is tripled, Bonus per skill level tripled, Extra 5% scaling per
// level of Improve Dodge" [db]. The emu 2024 has the same shape (battle.cpp:4119, with 3% per Improve Dodge then)
const backStabDagger = ({ stats, skillKey, skillLv, skills, weaponType, dualWield }: RuleCtx): Extra[] => {
  if (skillKey !== 'thief/back-stab' || weaponType !== 'Dagger' || dualWield) return []
  const id = skills['thief/improve-dodge'] ?? 0
  const out: Extra[] = [
    { label: 'Dagger: per level ×3', value: 2 * 5 * skillLv, prov: 'db', why: '5% per level tripled (+10% per level)' },
    { label: 'Dagger: AGI ×3', value: 2 * stats.agi, prov: 'db', why: '1% per AGI tripled (+2% per AGI)' },
  ]
  if (id) out.push({ label: `Dagger: Improve Dodge Lv${id}`, value: 5 * id, prov: 'db', why: '5% per level of Improve Dodge' })
  return out
}
const THIEF: ClassRules = {
  ...GENERIC('Thief'), passives: thiefPassives,
  simBuffs: THIEF_LINE_BUFFS,
  buffMods: (t, c) => [...thiefBuffMods(t, c), ...thiefLineMods(t, c), ...hwMods(t, c)],
  skillPctExtra: (c) => [...backStabDagger(c), ...hwShadowSlash(c)],
  endows: thiefEndows,
  // HIT: status window 2026-10-02 (lv36, DEX 27, LUK 5, +14 HIT from a random option) showed 305 against 280 from the formula
  innate: { ...INNATE, why: 'HIT +25 measured in-game 2026-10-02 (305 against 280), as on Revenant; HP ×1.10 [estimated] not measured yet' },
}
const UNCHAINED_THIEF: ClassRules = { ...THIEF, name: 'Unchained Thief' }
const PHANTOM_THIEF: ClassRules = {
  ...UNCHAINED_THIEF,
  name: 'Phantom Thief',
  simBuffs: [
    { id: 'readyToRip', skill: 'phantom-thief/ready-to-rip', label: 'Ready to Rip', default: true, why: 'Lv N: HIT +10×N, ATK +(1+N)%, DEF −(5+5N)%. 50 s / CD 2 min. ATK fixed in Patch 15. [db]' },
    { id: 'sevenWinds', skill: 'phantom-thief/seven-winds', label: 'Seven Winds', default: true, why: 'Weapon endow: Lv1 Earth, 2 Wind, 3 Water, 4 Fire, 5 Ghost, 6 Dark, 7 Holy. "Auto" uses the best element vs the target (up to the learned level); a level uses that element. Only when no item grants an element. [db]',
      levels: [{ lv: 0, label: 'Auto (best vs target)' }, ...SEVEN_WINDS.map((el, i) => ({ lv: i + 1, label: `Lv${i + 1} ${el}` }))] },
    { id: 'duelCounters', skill: 'phantom-thief/coin-flip', label: 'Coins (Duel Counters)', default: false, levelsAreCount: true,
      why: 'Coin Flip coins count as Duel Counters [dev on Discord 2026-09-23]. Delta Skyfall: +1% per VIT for every 2 counters; Riposte: +1% per VIT per counter (Patch 11/12/15). Up to 10 coins. [db + report]',
      levels: Array.from({ length: 11 }, (_, n) => ({ lv: n, label: `${n} coin${n === 1 ? '' : 's'}` })) },
    { id: 'venomMark', skill: 'phantom-thief/venom-mark', label: 'Venom Mark', default: false, why: 'Target takes +5%/level from Poison attacks (with Enchant Poison). [db]' },
    ...THIEF_LINE_BUFFS,
  ],
  endows: thiefEndows,
  // Duel Counters (coins): read as added skill %, like the other "+N% per stat" lines [estimated: the text does not say]
  skillPctExtra: (c) => {
    const { stats, toggles, skillKey } = c
    if (skillKey === 'thief/back-stab') return backStabDagger(c)
    if (/\/shadow-slash$/.test(skillKey ?? '')) return hwShadowSlash(c)
    const n = Array.from({ length: 10 }, (_, i) => i + 1).find((k) => toggles[`duelCounters:lv${k}`]) ?? 0
    if (!toggles.duelCounters || !n) return []
    if (skillKey === 'phantom-thief/delta-skyfall') {
      const pts = Math.floor(n / 2)
      return pts ? [{ label: `Duel Counters ×${n}`, value: pts * stats.vit, prov: 'reported', why: `+1% per VIT for every 2 counters: ${pts} × VIT ${stats.vit}` }] : []
    }
    if (skillKey === 'phantom-thief/riposte') {
      return [{ label: `Duel Counters ×${n}`, value: n * stats.vit, prov: 'reported', why: `+1% per VIT per counter: ${n} × VIT ${stats.vit}` }]
    }
    return []
  },
  elementBonus: (t, skills): Record<string, number> => (t.venomMark && skills['phantom-thief/venom-mark'] ? { Poison: 5 * skills['phantom-thief/venom-mark'] } : {}),
  buffMods: (t, c) => {
    const out = [...thiefBuffMods(t, c), ...thiefLineMods(t, c), ...hwMods(t, c)]
    const lv = c?.skills['phantom-thief/ready-to-rip'] ?? 0
    if (t.readyToRip && lv) {
      out.push(
        { key: 'atk', value: 1 + lv, pct: true, label: 'Ready to Rip' },
        { key: 'hit', value: 10 * lv, pct: false, label: 'Ready to Rip' },
        { key: 'def', value: -(5 + 5 * lv), pct: true, label: 'Ready to Rip' },
      )
    }
    return out
  },
  // Master Thief Arts: "Shadow Set pieces count as +3 refine for their bonuses. Shadow Set bonuses activate with a
  // single piece equipped (the Touch sets still need all 4 pieces)." [db] — +3 read as added to the piece's refine [estimated]
  shadow: { refineBonus: 3, singlePieceSets: true, why: 'Master Thief Arts: Shadow pieces +3 refine; a set bonus activates with 1 piece, except Touch sets [db]' },
}

const TABLE: Record<string, ClassRules> = {
  Revenant: REVENANT, Trickster: TRICKSTER, 'Dark Knight': DARK_KNIGHT, Thief: THIEF,
  'Unchained Thief': UNCHAINED_THIEF, 'Phantom Thief': PHANTOM_THIEF,
}

export const rulesFor = (cls: string): ClassRules => TABLE[cls] ?? GENERIC(cls)

/**
 * Job changes that grant every skill of the lineage at max level, with no skill points involved:
 * the changer NPC runs `@allskill` (npc/re/r3/unchainedjobs.txt:175, 254, 339, 418) [emu 2024];
 * confirmed in-game on Unchained Thief 2026-10-02 (both trees full, 0 skill points left).
 */
export const ALL_SKILLS_CLASSES = new Set(['Unchained Thief', 'Phantom Thief', 'Unchained Assassin', 'Unchained Rogue'])

/**
 * Effective toggles of a build in the Simulator: a buff whose skill is not learned stays
 * off. Combo Ready is on by default (only off if the user unchecks it).
 */
export function learnedToggles(rules: ClassRules, skills: Record<string, number>, chosen: Record<string, boolean>, levels: Record<string, number> = {}) {
  const out: Record<string, boolean> = Object.fromEntries(rules.simBuffs.map((t) => {
    const learned = !t.skill || (skills[t.skill] ?? 0) > 0
    const on = t.id === 'comboReady' ? chosen[t.id] !== false : !!chosen[t.id]
    return [t.id, learned && on]
  }))
  // buff level picked in the Simulator travels as "<id>:lv<n>" (0 = auto, no key)
  for (const t of rules.simBuffs) if (t.levels && out[t.id] && levels[t.id]) out[`${t.id}:lv${levels[t.id]}`] = true
  return out
}
