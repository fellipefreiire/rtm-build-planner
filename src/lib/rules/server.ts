// Server constants. Each one carries its provenance.
import elements from '@/data/elements.json'
import emu from '@/data/emu.json'
import { Prov, StatKey } from '@/lib/types'

/** Cost of the next point of a stat. `[measured]` */
export function statCost(target: number): number {
  if (target <= 49) return 1
  if (target <= 98) return 2
  return 3
}

/** Cumulative cost to go from 1 to `v`. */
export function statCostTotal(v: number): number {
  let c = 0
  for (let i = 2; i <= v; i++) c += statCost(i)
  return c
}

/**
 * Stat point budget per base level: server table. `[emu]` db/re/statpoint.yml
 * (exp.conf: use_statpoint_table yes). Matches an in-game character: 440 at 137, all spent.
 * 148, 149 and 150 grant no points: the cap is 447.
 */
export function pointBudget(baseLv: number): { v: number; prov: Prov } {
  const t = (emu as unknown as { statPoints: Record<string, number> }).statPoints
  return { v: t[String(Math.max(1, Math.min(baseLv, 250)))] ?? 0, prov: 'emu' }
}

/** Curve of def pen -> % of DEF ignored. `[measured]` */
const PEN_CURVE: [number, number][] = [
  [0, 0], [5, 14], [15, 38], [20, 48], [25, 57], [55, 98], [60, 100],
]
export function penEffect(pen: number): number {
  if (pen <= 0) return 0
  const c = PEN_CURVE
  for (let i = 1; i < c.length; i++) {
    if (pen <= c[i][0]) {
      const [x0, y0] = c[i - 1]
      const [x1, y1] = c[i]
      return (y0 + ((pen - x0) / (x1 - x0)) * (y1 - y0)) / 100
    }
  }
  return 1
}

/**
 * Weapon size penalty, % of the weapon ATK by target size [Small, Medium, Large]. `[emu 2024]` db/size_fix.yml
 * (customized by RTM) + Knuckle from db/re. Omitted = 100. Only the weapon part (weapon ATK × (1 + STR/200)) takes it
 * (battle.cpp battle_calc_base_weapon_attack → battle_calc_sizefix); status ATK, refine and gear ATK do not.
 */
const SIZE_FIX: Record<string, [number, number, number]> = {
  Dagger: [100, 90, 75], '1hSword': [90, 100, 90], '2hSword': [90, 90, 100], '1hSpear': [90, 90, 100],
  '2hSpear': [90, 90, 100], '1hAxe': [70, 90, 100], '2hAxe': [70, 90, 100], Mace: [90, 100, 100],
  Bow: [100, 100, 90], Musical: [90, 100, 90], Whip: [90, 100, 75], Book: [100, 100, 75], Katar: [90, 100, 90],
  Knuckle: [100, 100, 90],
}
export function sizeFix(weaponType: string, size: string): number {
  const i = ['small', 'medium', 'large'].indexOf(String(size).toLowerCase())
  return i < 0 ? 100 : SIZE_FIX[weaponType]?.[i] ?? 100
}

/**
 * A monster's DEF against a player's weapon attack, renewal `[emu 2024]` battle.cpp:5665:
 * damage × (4000 + DEF) / (4000 + 10 × DEF) − soft DEF. The monster's soft DEF is level + VIT/2
 * (status.cpp status_calc_misc). Measured 2026-10-02: Thief Back Stab on Orc Lady (lv47, DEF 25, VIT 25)
 * 1000 in-game; the old player curve (K=384, no soft DEF) gave 1067.
 */
export function mobHardDef(def: number): number {
  const d = Math.max(-399, def)
  return (4000 + d) / (4000 + 10 * d)
}
export function mobSoftDef(lv: number, vit: number): number {
  return Math.floor(lv + vit / 2)
}


/**
 * Damage-taken multiplier from DEF.
 * `[derived from 1 data point]` — the only known pair: DEF 346 -> 0.526
 * (measured on the reference build). Solving def/(def+K): K = 384.
 * The real curve is not modeled yet.
 */
export const DEF_K = 384
export function defMultiplier(def: number): { v: number; prov: Prov } {
  return { v: DEF_K / (DEF_K + Math.max(0, def)), prov: 'derived' }
}

/** Real crit denominator: the status window shows 85%, the effective value is 2.25. `[measured]` */
export const CRIT_BASE = 1.4
/** crit at which every hit is critical, on any target (MVPs included) [player report 2026-09-28] */
export const CRIT_CAP = 140

/** 1 STR = 1 ATK. `[measured]` */
export const ATK_PER_STR = 1

type ElemTable = Record<string, Record<string, number[]>>

/**
 * Elemental multiplier. `[db]` — table from the dump itself.
 * Orientation confirmed against two measured cases: attr[attacker][defender
 * level][defender index].
 */
export function elementMultiplier(attack: string, defend: string, defLv: number): number {
  const order: string[] = elements.order
  const table = elements.table as unknown as ElemTable
  const lv = String(Math.min(4, Math.max(1, defLv || 1)))
  const idx = order.findIndex((e) => e.toLowerCase() === String(defend).toLowerCase())
  const atk = order.find((e) => e.toLowerCase() === String(attack).toLowerCase())
  if (idx < 0 || !atk || !table[lv]?.[atk]) return 1
  return table[lv][atk][idx] / 100
}

export const ELEMENTS: string[] = elements.order
export const RACES: string[] = elements.races
export const SIZES: string[] = elements.sizes

/** Readable stat names, in status window order. */
export const STAT_LABEL: Record<StatKey, string> = {
  str: 'STR', agi: 'AGI', vit: 'VIT', int: 'INT', dex: 'DEX', luk: 'LUK',
}

// ---------------------------------------------------------------------------
// Base status: formulas from the old rAthena emulator, customized for RTM.
// Integer division as in C.
// Status ATK, stat cost and the soft DEF slope match what was measured;
// the rest has not been checked in-game yet.
// ---------------------------------------------------------------------------

type S = Record<StatKey, number>
const fl = Math.floor

/** Status ATK. `status.cpp:3152` (matches the codex formula) */
export function statusAtk(s: S, lv: number): number {
  return fl((s.str * 10 + fl(s.dex * 10 / 5) + fl(s.luk * 10 / 3) + fl(lv * 10 / 4)) / 10)
    + fl(s.dex / 20) + fl(s.str / 10)
}

/** HIT base = lv + 2×DEX + LUK/5 + 175. `status.cpp:3309` */
export const baseHit = (s: S, lv: number) => lv + 2 * s.dex + fl(s.luk / 5) + 175

/** FLEE base = lv + AGI + AGI/10 + LUK/5 + 100. `status.cpp:3313` */
export const baseFlee = (s: S, lv: number) => lv + s.agi + fl(s.agi / 10) + fl(s.luk / 5) + 100

/** Soft DEF = lv + VIT + 5 per 10 VIT. `status.cpp:3320` */
export const softDef = (s: S, lv: number) => lv + s.vit + 5 * fl(s.vit / 10)

/** Soft MDEF = INT + lv/4 + 5 per 10 VIT + (DEX+VIT)/5. `status.cpp:3328` */
export const softMdef = (s: S, lv: number) =>
  fl(s.int + lv / 4 + 5 * fl(s.vit / 10) + (s.dex + s.vit) / 5)

/**
 * Status MATK, the left side of the window (`pc.hpp:1149` = status_base_matk_min):
 * INT + INT/2 + DEX/5 + LUK/3 + lv/4 + INT/10 + DEX/10. `status.cpp:3243`
 */
export const statusMatk = (s: S, lv: number) =>
  s.int + fl(s.int / 2) + fl(s.dex / 5) + fl(s.luk / 3) + fl(lv / 4) + fl(s.int / 10) + fl(s.dex / 10)

/** Base crit in %: 1 + LUK/3 + 2 per 10 LUK. `status.cpp:3366` (unit 0.1) */
export const baseCrit = (s: S) => (10 + fl(s.luk * 10 / 3) + 20 * fl(s.luk / 10)) / 10

/** Base Perfect Dodge = (LUK + AGI + 10) / 10. `status.cpp:3373` (unit 0.1) */
export const basePerfectDodge = (s: S) => (s.luk + s.agi + 10) / 10

/**
 * MaxHP / MaxSP. `status.cpp:4031` (status_calc_maxhpsp_pc):
 *   base[job][lv] × (1 + stat/100)  + flat from gear
 *   + (gear %) on top of that, and finally + rate (passives) on the total.
 * stat = VIT for HP, INT for SP. Revenant = job Rebellion (not an "upper" class).
 * `[measured in-game 2026-09-27]` naked at 137: 3490 × 1.33 × 1.10 = 5105 HP · 870 × 1.20 = 1044 SP.
 */
export function maxHpSp(
  which: 'hp' | 'sp', cls: string, lv: number, stat: number,
  gear: { flat: number; pct: number }, rate: number,
): { v: number; base: number; why: string } | null {
  const { job } = emuJob(cls)
  const tab = job ? (which === 'hp' ? EMU.baseHp : EMU.baseSp)[job] : undefined
  const base = tab?.[Math.min(lv, tab.length) - 1]
  if (base == null) return null
  let d = base * (1 + Math.max(stat, 1) * 0.01)
  d += gear.flat
  d += d * gear.pct / 100
  d += Math.trunc(d * rate / 100)
  const statName = which === 'hp' ? 'VIT' : 'INT'
  return {
    v: Math.max(1, Math.trunc(d)),
    base,
    why: `${job} lv${lv}: ${base} × (1 + ${statName} ${stat}/100) + ${gear.flat} flat, +${gear.pct}% from gear${rate ? `, +${rate}% from class` : ''} [emu]`,
  }
}

type EmuData = {
  /** internal skill name (the dump's `icon`) -> after cast delay in ms, flat or per level */
  skillAcd: Record<string, number | number[]>
  /** internal skill name -> hit count of multi-hit skills (damage × hits) */
  skillHits: Record<string, number>
  classJob: Record<string, string>
  classJobUncertain: Record<string, string>
  baseAspd: Record<string, Record<string, number>>
  weaponType: Record<string, string>
  catType: Record<string, string>
  baseHp: Record<string, number[]>
  baseSp: Record<string, number[]>
  mobDamageTaken: Record<string, number>
}
const EMU = emu as unknown as EmuData

/**
 * % of the damage the mob takes (emulator `DamageTaken`, 100 when absent). Most MVPs take 50.
 * battle.cpp:1832 applies it last, to any damage: max(damage × rate / 100, 1). [emu]
 */
export const mobDamageTaken = (id: number): number => EMU.mobDamageTaken[String(id)] ?? 100

/** Hits of the emulator skill that carries this icon; rAthena multiplies the damage by it. [emu] */
export const emuHits = (icon: string | null | undefined): number => (icon ? EMU.skillHits?.[icon] : undefined) ?? 1

/** After cast delay (ms) of the emulator skill that carries this icon; null when the emulator has none. [emu] */
export function emuAcdMs(icon: string | null | undefined, lv: number): number | null {
  const d = icon ? EMU.skillAcd?.[icon] : undefined
  if (d == null) return null
  return Array.isArray(d) ? d[Math.min(Math.max(lv, 1), d.length) - 1] ?? null : d
}

/** Internal emulator job for the RTM class. */
export const emuJob = (cls: string): { job: string | null; doubtful: string | null } => ({
  job: EMU.classJob[cls] ?? null,
  doubtful: EMU.classJobUncertain[cls] ?? null,
})

/** Weapon type in the emulator. A weapon missing there falls back to the most common type of its category. */
export function emuWeaponType(item: { id: number; cat: string } | undefined): string {
  if (!item) return 'Fist'
  return EMU.weaponType[String(item.id)] ?? EMU.catType[item.cat] ?? 'Fist'
}

/**
 * Divisor of ASPD % by AGI. The emulator uses 190 (`status.cpp:3072`).
 * `[conflict]` RTM's /different says "20% with 50 AGI is worth 10%", which gives 100.
 */
export const ASPD_PCT_AGI_DIV = 190

/**
 * ASPD. `status.cpp:3023` (RENEWAL_ASPD):
 *   196 + √(DEX²/9 + 0.7·AGI²)/4 + (ASPD% × AGI / 190) − (weapon penalty − AGI/10)
 * A shield adds the `Shield` penalty. Dual wield adds 1/4 of the 2nd weapon's penalty − AGI/20.
 * "ASPD +N" from gear is added directly. Cap: 180 + AGI/40 + ASPD Limit, max 190.
 */
export function aspd(
  cls: string, s: S, weaponType: string,
  opts: { shield: boolean; offhandType: string | null; pct: number; flat: number; limit: number },
): { v: number | null; cap: number; why: string } {
  const { job } = emuJob(cls)
  const table = job ? EMU.baseAspd[job] : undefined
  const cap = Math.min(190, 180 + fl(s.agi / 40) + opts.limit)
  if (!table || table[weaponType] == null) {
    return { v: null, cap, why: `no ${weaponType} penalty for ${job ?? cls} in the emulator` }
  }
  let pen = table[weaponType] - fl(s.agi / 10)
  if (opts.shield) pen += table.Shield ?? 0
  else if (opts.offhandType && opts.offhandType !== 'Fist' && table[opts.offhandType] != null) {
    pen += fl(table[opts.offhandType] / 4) - fl(s.agi / 20)
  }
  const temp = Math.sqrt(s.dex * s.dex / 9 + s.agi * s.agi * 0.7) * 0.25 + 196
  const raw = fl(temp + opts.pct * s.agi / ASPD_PCT_AGI_DIV) - Math.min(pen, 200) + opts.flat
  return {
    v: Math.min(cap, raw),
    cap,
    why: `${job} · ${weaponType} penalty ${table[weaponType]}${opts.shield ? ` + shield ${table.Shield ?? 0}` : ''} · ASPD% ${opts.pct} × AGI/${ASPD_PCT_AGI_DIV} · cap ${cap}`,
  }
}
