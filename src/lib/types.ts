// Core data contracts. Closed vocabulary, provenance carried in the type.

/**
 * Provenance of a number. Values are stable keys (kept in Portuguese for saved-data compatibility):
 * `measured` = measured in-game, `derived` = derived, `db` = from the item/mob database,
 * `emu` = formula from the old rAthena emulator customized for RTM, not checked in-game,
 * `reported` = player report, `uncalibrated` = not calibrated.
 */
export type Prov = 'measured' | 'derived' | 'db' | 'emu' | 'reported' | 'uncalibrated'

/** Every displayed number is a Qty. `from` is the human-readable trail back to its source. */
export type Qty = { v: number; prov: Prov; from: string[] }

export const qty = (v: number, prov: Prov, ...from: string[]): Qty => ({ v, prov, from })

/** Downgrades provenance to the weakest in the set (the weakest link wins). */
const ORDER: Prov[] = ['measured', 'db', 'derived', 'emu', 'reported', 'uncalibrated']
export function weakest(...ps: Prov[]): Prov {
  return ps.reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), 'measured')
}

export type StatKey = 'str' | 'agi' | 'vit' | 'int' | 'dex' | 'luk'
export const STATS: StatKey[] = ['str', 'agi', 'vit', 'int', 'dex', 'luk']

export type SlotId =
  | 'weapon' | 'offhand' | 'armor' | 'garment' | 'shoes'
  | 'upper' | 'mid' | 'lower'
  | 'accessory' | 'accessory2'
  | 'shadowArmor' | 'shadowShoes' | 'shadowGloves' | 'shadowAcc'
  | 'rune' | 'manual' | 'costume' | 'ammo' | 'pet' | 'gem'

export const SLOTS: { id: SlotId; label: string; from: string }[] = [
  { id: 'weapon', label: 'Weapon', from: 'weapon' },
  { id: 'offhand', label: 'Off-hand', from: 'offhand' },
  { id: 'armor', label: 'Armor', from: 'armor' },
  { id: 'garment', label: 'Garment', from: 'garment' },
  { id: 'shoes', label: 'Shoes', from: 'shoes' },
  { id: 'upper', label: 'Upper', from: 'upper' },
  { id: 'mid', label: 'Mid', from: 'mid' },
  { id: 'lower', label: 'Lower', from: 'lower' },
  { id: 'accessory', label: 'Accessory (L)', from: 'accessory' },
  { id: 'accessory2', label: 'Accessory (R)', from: 'accessory' },
  { id: 'shadowArmor', label: 'Shadow armor', from: 'shadowArmor' },
  { id: 'shadowShoes', label: 'Shadow shoes', from: 'shadowShoes' },
  { id: 'shadowGloves', label: 'Shadow gloves', from: 'shadowGloves' },
  { id: 'shadowAcc', label: 'Shadow acc', from: 'shadowAcc' },
  { id: 'rune', label: 'Rune / orb', from: 'rune' },
  { id: 'manual', label: 'Manual / tome', from: 'manual' },
  { id: 'gem', label: 'Class gem', from: 'gem' },
  { id: 'costume', label: 'Costume', from: 'costume' },
  { id: 'pet', label: 'Pet', from: 'pet' },
  { id: 'ammo', label: 'Ammo', from: 'ammo' },
]

/**
 * Side of an accessory: the dump category says "Left Accessory" / "Unchained Left" or "Right Accessory" /
 * "Unchained Right" (Mark of a Survivor only goes on the right, Megingjard only on the left). The rest fits either.
 * Accessory (L) = left, Accessory (R) = right, as in the in-game equipment window.
 */
export function accessorySideOk(cat: string, slot: SlotId): boolean {
  const side = slot === 'accessory' ? 'L' : slot === 'accessory2' ? 'R' : null
  if (!side) return true
  if (/\bleft\b/i.test(cat)) return side === 'L'
  if (/\bright\b/i.test(cat)) return side === 'R'
  return true
}

export type Cond =
  | { t: 'always' }
  | { t: 'refine_min'; n: number }
  | { t: 'level_min'; n: number }
  | { t: 'set_pieces'; n: number }
  /** `members`: names of all pieces; the bonus only applies with all of them equipped */
  | { t: 'set_bonus'; set: string; members: string[] }
  | { t: 'per_refine'; each: number }
  /** with `set`/`members`: only with the full set, × (sum of the pieces' refine / each) */
  | { t: 'per_set_refine'; each: number; set?: string; members?: string[] }
  /** "Set refine 9+" / "At set refine 9+ and again at 18+": full set; applies once per threshold the set's total refine reaches */
  | { t: 'set_refine'; ns: number[]; set: string; members?: string[] }
  /** "With two of these equipped": N copies of the same item (cards) */
  | { t: 'copies_min'; n: number }
  /** `base`: "per base INT" reads the allocated stat; `set`/`members`: inside a set block, once per set and only complete */
  | { t: 'per_stat'; stat: StatKey; each: number; base?: boolean; set?: string; members?: string[] }
  /** "For each base stat over 98": × how many BASE stats (allocated, no gear) are ≥ n — readparam(bStr) etc. [emu] */
  | { t: 'per_base_stat_min'; n: number }
  /** × allocated skill level; with several skills, the HIGHEST level counts (one or the other, not the sum) */
  | { t: 'per_skill_lv'; skills: string[] }

export type Scope = {
  race?: string; size?: string; element?: string; skill?: string; status?: string
}

export type Modifier = {
  key: string
  value: number
  pct: boolean
  scope?: Scope
  cond: Cond
  src: { itemId: number; line: number }
  raw: string
  /** BASE stat requirement (without gear): "Base VIT 90:" */
  req?: { stat: StatKey; min?: number; max?: number }
}

export type UnparsedEffect = {
  itemId: number; line: number; raw: string
  /** stable keys: no number / unknown key / unknown shape / conditional */
  reason: 'sem_numero' | 'chave_desconhecida' | 'forma_desconhecida' | 'condicional'
    /** understood, but outside the planner: zeny, drops, Kafra, rental, revival… [2026-10-01] */
    | 'nao_modelado'
}

export type Item = {
  id: number; name: string; grp: string; cat: string
  slots: string[]; cardSlots: number; lv: number
  atk: number; matk: number; def: number; mdef: number; weight: number
  refinable: boolean; twoHanded: boolean
  /** headgear positions taken at once, whichever slot holds it (Crown of Deceit: upper + mid) */
  occupies?: string[]
  /** weapon level (1–4); 0 = not a weapon */
  wlv?: number
  /** dropped by a mob or from a coffer: only these roll random options */
  dropped: boolean
  /** accepts a Dream Enchant ("Dream Enchants available") */
  dreamEnchant: boolean
  /** Shadow piece of a "Touch of …" set: Phantom Thief's single-piece rule does not apply */
  touchSet?: boolean
  /** element the item gives to attacks (card/shadow endow, or the weapon's own) */
  endow?: string | null
  /** element the item gives to the armor */
  armorEl?: string | null
  jobs: string[] | null
  mods: Modifier[]
  unparsed: UnparsedEffect[]
}

export type Mob = {
  id: number; name: string; lv: number; hp: number
  atk: number; def: number; mdef: number
  race: string; size: string; element: string; elv: number
  hit: number; flee: number; adelay: number; mvp: boolean
  stats: number[]
}

export type SkillFormula = {
  base: number; coefPerLevel: number
  perStat: { stat: StatKey; pct: number }[]
  cooldown: number | null; spPct: number | null; hpPct: number | null
  canCrit: boolean; magic: boolean; formulaRaw: string
  /** cast time in seconds (dump text); 0 = instant */
  castVar?: number; castFixed?: number
  /** second damage part added after everything, ignoring element and DEF: base + perLvInt × level × INT
   *  (Soul Destroyer: battle.cpp ASC_BREAKER md.damage = 50 + rnd()%50 + 5 × lv × INT) [emu] */
  miscPart?: { base: number; perLvInt: number }
}

export type Skill = {
  key: string; name: string; cls: string; maxLv: number
  icon: string | null
  tipo: string | null
  /** job marker: granted by the class change, costs no skill point */
  classNote: boolean
  sp: number[] | number | null
  needs: { name: string; lv: number }[]
  prose: string
  /** range in cells per level (range >= 4 = ranged attack) */
  range?: number[] | null
  /** weapons the skill requires (dump `wep`, e.g. ['katar']); null = any */
  weapons?: string[] | null
  damage: SkillFormula | null
}

export type ClassInfo = {
  name: string
  damageSkills: string[]
  calibrated: boolean
  lineage: string[]
  /** job level at which each lineage tier ends; the last is null (uses the current job level) */
  tierCaps: (number | null)[]
}

export type SlotEntry = {
  id: number; refine: number; cards: number[]
  /** random options, one entry per row of the item's table (rules/random-options.ts). `null` = empty row */
  opts?: ({ key: string; v: number } | null)[]
  /** chosen Dream Enchant (rules/dream-enchants.ts). Only valid on items with dreamEnchant */
  dream?: string | null
}

export type Build = {
  v: 1
  cls: string
  baseLv: number
  /** recorded so the build is complete; no formula uses job level yet */
  jobLv: number
  points: number | null            // null = computed from the formula
  stats: Record<StatKey, number>
  slots: Partial<Record<SlotId, SlotEntry>>
  skillKey: string | null
  skillLv: number
  /** points allocated in the skill tree, by skill key */
  skills: Record<string, number>
  /** skill point budget — there is no known formula, so it is typed in */
  skillPoints: number | null
  /**
   * Calibration anchor. The damage model is proportional, not absolute:
   * it stores the damage measured in-game and the engine's index at that moment.
   * Without an anchor, the UI shows a relative index — never an invented absolute.
   */
  anchor: { dmg: number; index: number } | null
  /** HP read from the in-game status window. Without it there is no base HP formula. */
  hpOverride: number | null
  armorElement: string
  /** manual additions, for what the parser did not understand */
  manual: Record<string, number>
  weaponElement: string
  /**
   * Switch: the spare item for each slot (the one NOT currently equipped). `null` = empty spare.
   * `slots` always holds the active item, so the engine is unaffected. Switching = swapping the two.
   */
  swaps?: Partial<Record<SlotId, SlotEntry | null>>
  /** which side is active in each switch slot: A (the original) or B */
  swapSide?: Partial<Record<SlotId, 'A' | 'B'>>
  /** engraved seals: Valhalla (odin) on the rune, Amatsu (ama) on the Manual/Tome; mark ids, up to 4 */
  seals?: { odin?: string[]; ama?: string[] }
}
