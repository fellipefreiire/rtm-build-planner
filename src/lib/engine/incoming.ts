// incoming: what each attack of a mob does to you, per hit. Pure.
// Formulas: rAthena ~2024 emulator (RENEWAL), with the mob as the attacker and you as the target.
// Mob stats come from the RTM dump; skills and MATK (Attack2) from the emulator (mob-skills.json).
import mobSkillsJson from '@/data/mob-skills.json'
import { Build, Mob, Prov } from '@/lib/types'
import { StatSheet } from './sheet'
import { Layer } from './simulate'
import { elementMultiplier } from '@/lib/rules/server'
import { Caster, SkillCalc, Victim } from '@/lib/rules/mob-skill-calc'
import { WEAPON_A } from '@/lib/rules/mob-skill-ratios-weapon-a'
import { WEAPON_B } from '@/lib/rules/mob-skill-ratios-weapon-b'
import { MAGIC, MISC } from '@/lib/rules/mob-skill-ratios-magic'

type EmuRow = {
  skill: string; lv: number; state: string; rate: number; cast: number; delay: number
  cancelable: boolean; target: string; cond: string; condValue: string | null; vals: string[]
}
type EmuSkill = {
  id?: number; name: string; type: string | null
  element?: string | (string | null)[]; hits?: number | (number | null)[]
  range?: number | (number | null)[]; splash?: number | (number | null)[]; flags?: string[]
}
type EmuMob = { emuName: string; match: 'name' | 'level'; emuAtk: number; emuMatk: number; range: number; rows: EmuRow[] }
type MobSkillsData = {
  source: string
  conf: { mob_skill_rate?: number; mob_skill_delay?: number }
  skills: Record<string, EmuSkill>
  mobs: Record<string, EmuMob>
}
const DATA = mobSkillsJson as unknown as MobSkillsData
const SKILL_RATE = (DATA.conf.mob_skill_rate ?? 100) / 100
const SKILL_DELAY = (DATA.conf.mob_skill_delay ?? 100) / 100

export const SKILL_CALC: Record<string, SkillCalc> = { ...WEAPON_A, ...WEAPON_B, ...MAGIC, ...MISC }

/** emote bubbles: no gameplay effect */
const COSMETIC = new Set(['NPC_EMOTION', 'NPC_EMOTION_ON'])

export type Roll = 'avg' | 'min' | 'max'
export type IncomingOpts = {
  roll: Roll
  /** players inside the area, for skills that split their damage */
  targets: number
  /** within 3 cells of the mob: skills and attacks count as melee (skill.conf skillrange_by_distance) */
  near: boolean
}
export const defaultIncomingOpts: IncomingOpts = { roll: 'avg', targets: 1, near: true }

export type IncomingRow = {
  key: string
  label: string
  /** emulator skill name (RTM renamed some player skills: Baphomet's "Roaring Overslash" is LG_OVERBRAND there) */
  skill: string | null
  lv: number | null
  kind: 'physical' | 'magical' | 'misc'
  range: 'melee' | 'ranged'
  element: string
  hits: number
  /** when the mob uses it: state, chance, cooldown, condition */
  when: string
  /** per use, before your defenses */
  raw: number
  /** per use, after your defenses: min / chosen roll / max */
  min: number; final: number; max: number
  pctHp: number | null
  /** uses of this attack that kill you from full HP */
  toDie: number | null
  /** chance the attack connects (HIT vs FLEE, Perfect Dodge); null = cannot miss */
  hitChance: number | null
  layers: Layer[]
  notes: string[]
  prov: Prov
}
export type PassiveSkill = { key: string; label: string; skill: string; lv: number; when: string; what: string }

export type IncomingReport = {
  rows: IncomingRow[]
  passive: PassiveSkill[]
  /** 'emu' = skills known; 'none' = the emulator does not have this mob */
  source: 'emu' | 'none'
  emuName: string | null
  hp: number | null
  notes: string[]
}

const at = <T,>(v: T | (T | null)[] | undefined, lv: number, dflt: T): T => {
  if (Array.isArray(v)) return (v[Math.min(lv, v.length) - 1] ?? dflt) as T
  return (v ?? dflt) as T
}

const STATE: Record<string, string> = {
  any: 'any time', attack: 'attacking', idle: 'idle', chase: 'chasing', walk: 'walking',
  angry: 'angry', dead: 'on death', loot: 'looting', follow: 'following', anytarget: 'any target',
}
function condText(c: string, v: string | null): string {
  const x = v ?? ''
  switch (c) {
    case 'always': return ''
    case 'myhpltmaxrate': return `HP < ${x}%`
    case 'myhpinrate': return `HP in ${x}%`
    case 'friendhpltmaxrate': return `ally HP < ${x}%`
    case 'mystatuson': return `has ${x}`
    case 'mystatusoff': return `lacks ${x}`
    case 'attackpcgt': return `> ${x} players on it`
    case 'attackpcge': return `≥ ${x} players on it`
    case 'slavelt': return `< ${x} slaves`
    case 'slavele': return `≤ ${x} slaves`
    case 'closedattacked': return 'hit in melee'
    case 'longrangeattacked': return 'hit from range'
    case 'rudeattacked': return 'hit and cannot reach'
    case 'skillused': return `after skill ${x}`
    case 'afterskill': return `after casting ${x}`
    case 'casttargeted': return 'targeted by a cast'
    case 'onspawn': case 'spawn': return 'on spawn'
    default: return `${c} ${x}`.trim()
  }
}
export function whenText(r: EmuRow): string {
  const ch = (r.rate * SKILL_RATE) / 100
  const parts = [STATE[r.state] ?? r.state, `${ch < 1 ? ch.toFixed(2) : ch.toFixed(0)}%`]
  const cd = (r.delay * SKILL_DELAY) / 1000
  if (cd > 0) parts.push(`cd ${cd % 1 ? cd.toFixed(1) : cd}s`)
  if (r.cast > 0) parts.push(`cast ${(r.cast / 1000).toFixed(1)}s`)
  const c = condText(r.cond, r.condValue)
  if (c) parts.push(c)
  return parts.join(' · ')
}

export const emuMobOf = (id: number): EmuMob | null => DATA.mobs[String(id)] ?? null
export const mobSkillSource = DATA.source

const lower = (s: string) => String(s || '').toLowerCase()
const fl = Math.floor

/** Your side of the fight: everything the target-side reductions read. */
function victimOf(build: Build, sheet: StatSheet) {
  const sc = sheet.totals.scoped
  const pct = sheet.totals.pct
  const hp = build.hpOverride ?? sheet.maxHp?.v ?? null
  return {
    hp,
    hardDef: sheet.def.v, softDef: sheet.split.def.base ?? 0,
    hardMdef: sheet.mdef.v, softMdef: sheet.split.mdef.base ?? 0,
    armor: sheet.armorElement.v,
    flee: sheet.flee.v, pd: sheet.perfectDodge.v,
    resEle: (e: string) => (sc.resist_element?.[lower(e)] ?? 0),
    resRace: (r: string) => (sc.resist_race?.[lower(r)] ?? 0),
    resSize: (s: string) => (sc.resist_size?.[lower(s)] ?? 0),
    resBoss: pct.resist_boss ?? 0,
    resNonBoss: pct.resist_nonboss ?? 0,
    resMelee: pct.resist_melee ?? 0, // "Melee Damage Received -N%": negative = less
    resLong: pct.resist_long ?? 0,
    resMatk: pct.resist_matk ?? 0,
    resMisc: pct.resist_misc ?? 0,
    taken: (pct.dmg_taken ?? 0) - (pct.dmg_reduction ?? 0),
  }
}
type V = ReturnType<typeof victimOf>

/** Mob MATK base (Attack2). RTM changed some mobs' ATK; MATK scales with it (derived). */
function mobMatkBase(mob: Mob, emu: EmuMob | null): { v: number; why: string } {
  if (!emu) return { v: 0, why: 'no emulator data: MATK unknown' }
  if (emu.emuAtk > 0 && emu.emuAtk !== mob.atk) {
    const k = mob.atk / emu.emuAtk
    return { v: fl(emu.emuMatk * k), why: `Attack2 ${emu.emuMatk} × ${k.toFixed(2)} (RTM ATK ${mob.atk} ÷ emu ${emu.emuAtk}) [derived]` }
  }
  return { v: emu.emuMatk, why: `Attack2 ${emu.emuMatk} [emu]` }
}

const pick = (min: number, max: number, roll: Roll) => roll === 'min' ? min : roll === 'max' ? max : (min + max) / 2

/**
 * Target-side card fix (battle.cpp:652, target = player). Each group multiplies (base 1000);
 * inside a group the terms add. Weapon: element, race, size, boss, melee/ranged. Magic: element,
 * race, size, boss, magic received — no melee/ranged in renewal. Misc: element, race, size, boss,
 * misc received and melee/ranged. Resistances are "less damage" when positive; the *_received
 * keys are negative for less.
 */
function cardfix(v: V, mob: Mob, kind: IncomingRow['kind'], range: IncomingRow['range'], element: string, ignoreLong: boolean): { mult: number; parts: string[] } {
  const parts: string[] = []
  let m = 1
  const mul = (pctLess: number, label: string) => {
    if (!pctLess) return
    m *= (100 - pctLess) / 100
    parts.push(`${label} ${pctLess > 0 ? '−' : '+'}${Math.abs(pctLess)}%`)
  }
  mul(v.resEle(element), `resist ${element}`)
  mul(v.resRace(mob.race), `resist ${mob.race}`)
  mul(v.resSize(mob.size), `resist ${mob.size}`)
  mul(mob.mvp ? v.resBoss : v.resNonBoss, mob.mvp ? 'resist boss' : 'resist non-boss')
  if (kind === 'magical') mul(-v.resMatk, 'magic received')
  if (kind === 'misc') mul(-v.resMisc, 'misc received')
  if (kind !== 'magical' && !(ignoreLong && range === 'ranged')) {
    mul(-(range === 'melee' ? v.resMelee : v.resLong), range === 'melee' ? 'melee received' : 'ranged received')
  }
  // item bonus "Damage taken −N%" / "Damage Reduction +N%": RTM text, placement in the formula unknown
  mul(-v.taken, 'damage taken')
  return { mult: m, parts }
}

type Hit = { min: number; max: number; layers: Layer[] }

/** DEF: × (4000 + DEF)/(4000 + 10·DEF) − soft DEF, minimum 1. battle.cpp:5610, 5669 [emu] */
const defCut = (d: number, v: V) => Math.max(1, d * (4000 + v.hardDef) / (4000 + 10 * v.hardDef) - v.softDef)
/** MDEF: × (1000 + MDEF)/(1000 + 10·MDEF) − soft MDEF, minimum 1. battle.cpp:7263, 7271 [emu] */
const mdefCut = (d: number, v: V) => Math.max(1, d * (1000 + v.hardMdef) / (1000 + 10 * v.hardMdef) - v.softMdef)

type Step = { flags: Set<string>; crit: boolean }

/**
 * One attack, in the emulator's order (battle.cpp, RENEWAL):
 *  physical: roll × ratio → DEF → element → (crit ×1.2) → cards → × hits   (6214, 5610, 3277, 6317, 6401, 6413)
 *  magical:  roll × ratio → cards → MDEF → element → × hits                 (7178, 7187, 7263, 7299, 7332)
 *  misc:     fixed → cards → element → × hits                               (7657, 7666, 7676)
 * A negative skill_db HitCount keeps the total (only shown split), so it does not multiply.
 */
function compute(
  mob: Mob, v: V, kind: IncomingRow['kind'], range: IncomingRow['range'], element: string,
  base: { min: number; max: number; why: string }, ratio: number, hitCount: number, split: number,
  roll: Roll, st: Step,
): Hit & { raw: number } {
  const layers: Layer[] = []
  const r = ratio / 100
  let lo = base.min * r
  let hi = base.max * r
  const hits = hitCount > 0 ? hitCount : 1
  const ignoreDef = st.flags.has('IgnoreDefense')
  layers.push({ label: kind === 'misc' ? 'fixed damage' : `${kind === 'magical' ? 'MATK' : 'ATK'}${st.crit ? ' (critical: max × 1.4)' : ''} × ${ratio}%`, mult: pick(lo, hi, roll), why: base.why })
  if (split > 1) {
    lo /= split; hi /= split
    layers.push({ label: `split among ${split}`, mult: 1 / split, why: 'area damage divided by the targets hit' })
  }
  const raw = pick(lo, hi, roll) * hits
  const step = (label: string, why: string, f: (d: number) => number) => {
    const a = pick(lo, hi, roll)
    lo = f(lo); hi = f(hi)
    layers.push({ label, mult: a ? pick(lo, hi, roll) / a : 1, why })
  }
  const elem = () => {
    if (st.flags.has('IgnoreElement')) { layers.push({ label: 'ignores element', mult: 1, why: 'skill_db IgnoreElement' }); return }
    const el = elementMultiplier(element, v.armor, 1)
    step(`${element} → armor ${v.armor}`, 'element table [db]', (d) => d * el)
  }
  const cards = () => {
    if (kind === 'physical' && st.flags.has('IgnoreDefCard')) { layers.push({ label: 'ignores resistances', mult: 1, why: 'skill_db IgnoreDefCard' }); return }
    const cf = cardfix(v, mob, kind, range, element, st.flags.has('IgnoreLongCard'))
    step('resistances', cf.parts.join(' · ') || 'none on your gear', (d) => d * cf.mult)
  }
  if (kind === 'physical') {
    if (ignoreDef) layers.push({ label: 'ignores DEF', mult: 1, why: 'skill_db IgnoreDefense' })
    else step(`DEF ${fmt0(v.hardDef)} + ${fmt0(v.softDef)}`, '× (4000+DEF)/(4000+10·DEF) − soft DEF, min 1 [emu battle.cpp:5610]', (d) => defCut(d, v))
    elem()
    if (st.crit) step('critical', '× 1.2 [emu battle.cpp:6317]', (d) => d * 1.2)
    cards()
  } else if (kind === 'magical') {
    cards()
    if (ignoreDef) layers.push({ label: 'ignores MDEF', mult: 1, why: 'skill_db IgnoreDefense' })
    else step(`MDEF ${fmt0(v.hardMdef)} + ${fmt0(v.softMdef)}`, '× (1000+MDEF)/(1000+10·MDEF) − soft MDEF, min 1 [emu battle.cpp:7263]', (d) => mdefCut(d, v))
    elem()
  } else {
    cards()
    elem()
  }
  if (hits > 1) layers.push({ label: `× ${hits} hits`, mult: hits, why: 'skill_db HitCount' })
  else if (hitCount < -1) layers.push({ label: `shown as ${-hitCount} hits`, mult: 1, why: 'negative HitCount: same total, only displayed split [emu battle.cpp:3717]' })
  // integer math in the emulator: a hit that is not fully nullified (element 0%) deals at least 1
  const floor1 = (d: number) => (d > 0 ? Math.max(1, d) : 0)
  return { min: floor1(lo) * hits, max: floor1(hi) * hits, layers, raw }
}

const fmt0 = (n: number) => Math.round(n).toString()

/** hit-rate bonuses of some NPC skills (battle.cpp:2984-2998) */
function hitBonus(skill: string): number {
  if (/^NPC_(FIRE|WATER|WIND|GROUND|POISON|HOLY|DARKNESS|TELEKINESIS|UNDEAD)ATTACK$/.test(skill) || skill === 'NPC_BLEEDING') return 1.2
  if (/^NPC_\w+BREATH$/.test(skill)) return 2
  return 1
}

export function incoming(build: Build, sheet: StatSheet, mob: Mob, opts: IncomingOpts = defaultIncomingOpts): IncomingReport {
  const v = victimOf(build, sheet)
  const emu = emuMobOf(mob.id)
  const notes: string[] = []
  const caster: Caster = {
    lv: mob.lv, str: mob.stats?.[0] ?? 0, agi: mob.stats?.[1] ?? 0, vit: mob.stats?.[2] ?? 0,
    int: mob.stats?.[3] ?? 0, dex: mob.stats?.[4] ?? 0, luk: mob.stats?.[5] ?? 0, hp: mob.hp,
  }
  const victim: Victim = { lv: build.baseLv, maxHp: v.hp ?? 0 }
  const range = opts.near ? 'melee' : 'ranged'

  // mob ATK: (STR + Lv) + ATK × [0.8, 1.2] — status.cpp:3099/3195/3214 [emu]
  const batk = caster.str + caster.lv
  const atk = { min: batk + fl(mob.atk * 0.8), max: batk + fl(mob.atk * 1.2), why: `(STR ${caster.str} + Lv ${caster.lv}) + ATK ${mob.atk} × 0.8–1.2 [emu status.cpp:3195]` }
  // mob MATK: INT + Lv + Attack2 × [0.7, 1.3] — status.cpp:3232/3251 [emu]
  const m2 = mobMatkBase(mob, emu)
  const matk = { min: caster.int + caster.lv + fl(m2.v * 0.7), max: caster.int + caster.lv + fl(m2.v * 1.3), why: `(INT ${caster.int} + Lv ${caster.lv}) + ${m2.why} × 0.7–1.3 [emu status.cpp:3232]` }

  // chance to connect: HIT − FLEE between 10% and 100% (battle.conf min/max_hitrate)
  const fleeChance = Math.min(100, Math.max(10, mob.hit - v.flee)) / 100
  const rows: IncomingRow[] = []
  const hpOf = (d: number) => (v.hp && d > 0 ? { pctHp: d / v.hp * 100, toDie: Math.ceil(v.hp / d) } : { pctHp: null, toDie: null })

  // ---- normal attack: Neutral (mobs have no attack element), physical ----
  {
    const autoRange: IncomingRow['range'] = (emu?.range ?? 1) > 3 && !opts.near ? 'ranged' : 'melee'
    const h = compute(mob, v, 'physical', autoRange, 'Neutral', atk, 100, 1, 1, opts.roll, { flags: new Set(), crit: false })
    const pd = Math.min(100, v.pd) / 100
    rows.push({
      key: 'auto', label: 'Normal attack', skill: null, lv: null, kind: 'physical', range: autoRange, element: 'Neutral', hits: 1,
      when: `every ${(mob.adelay / 1000).toFixed(2)}s`,
      raw: h.raw, min: h.min, final: pick(h.min, h.max, opts.roll), max: h.max,
      ...hpOf(pick(h.min, h.max, opts.roll)),
      hitChance: fleeChance * (1 - pd),
      layers: h.layers,
      notes: [
        `hit ${(fleeChance * 100).toFixed(0)}% (HIT ${mob.hit} − FLEE ${v.flee.toFixed(0)}) × (1 − Perfect Dodge ${v.pd.toFixed(1)}%)`,
        // mob crit: (10 + LUK×10/3) × mob_critical_rate 5% − your LUK × 3, in 0.1% (battle.cpp:2785)
        sheet.stats.luk >= 6 ? `no critical hits: your LUK ${sheet.stats.luk} ≥ 6 cancels mob crit` : 'can crit (your LUK < 6): ×1.4 × 1.2 on a crit, not shown',
      ],
      prov: 'derived',
    })
  }

  const passive: PassiveSkill[] = []
  if (!emu) {
    notes.push(`The ${mobSkillSource.split(' ')[0]} emulator has no ${mob.name} (content newer than 2024, or its id belongs to another mob there): only the normal attack is known.`)
  } else {
    if (emu.match === 'level') notes.push(`In the emulator this id is "${emu.emuName}" (same level): skills assumed to be the same mob.`)
    const seen = new Set<string>()
    for (const r of emu.rows) {
      if (COSMETIC.has(r.skill)) continue
      const key = `${r.skill}@${r.lv}@${r.state}@${r.cond}`
      if (seen.has(key)) continue
      seen.add(key)
      const s = DATA.skills[r.skill] ?? { name: r.skill, type: null }
      const calc = SKILL_CALC[r.skill]
      const flags = new Set(s.flags ?? [])
      const damaging = !!s.type && ['Weapon', 'Magic', 'Misc'].includes(s.type) && !flags.has('NoDamage') && !!calc && (!!calc.ratio || !!calc.fixed)
      const when = whenText(r)
      if (!damaging) {
        passive.push({ key, label: s.name, skill: r.skill, lv: r.lv, when, what: calc?.note && !/NoDamage/.test(calc.note) ? calc.note : 'no damage: status, buff, heal or summon' })
        continue
      }
      const path = calc!.path ?? (s.type === 'Weapon' ? 'weapon' : s.type === 'Magic' ? 'magic' : 'misc')
      const kind: IncomingRow['kind'] = path === 'weapon' ? 'physical' : path === 'magic' ? 'magical' : 'misc'
      let element = calc!.element ? calc!.element(r.lv) : at(s.element, r.lv, 'Neutral')
      // "Weapon" element = the caster's attack element, Neutral for mobs (battle.cpp:6495)
      if (element === 'Weapon' || element === 'Endowed' || element === 'Random') element = 'Neutral'
      const hitCount = calc!.hits ? calc!.hits(r.lv) : at(s.hits, r.lv, 1) ?? 1
      const hits = Math.max(1, Math.abs(hitCount))
      const ratio = calc!.ratio ? calc!.ratio(r.lv, caster, victim) : 100
      const split = calc!.splitAmongTargets || flags.has('SplashSplit') ? Math.max(1, opts.targets) : 1
      // NPC_CRITICALSLASH always crits: max roll × 1.4, later × 1.2 (battle.cpp:2750, 2426, 6317)
      const crit = r.skill === 'NPC_CRITICALSLASH'
      const physBase = crit ? { min: fl((batk + fl(mob.atk * 1.2)) * 1.4), max: fl((batk + fl(mob.atk * 1.2)) * 1.4), why: `critical: (${atk.why}) at max × 1.4` } : atk
      const base = calc!.fixed
        ? (() => { const f = calc!.fixed!(r.lv, caster, victim); return { min: f, max: f, why: `fixed ${fl(f)} [emu ${calc!.src}]` } })()
        : kind === 'physical' || calc!.base === 'atk' ? physBase
        : calc!.base === 'atk+matk' ? { min: atk.min + matk.min, max: atk.max + matk.max, why: `ATK + MATK: ${atk.why} · ${matk.why}` }
        : matk
      const h = compute(mob, v, kind, range, element, base, calc!.fixed ? 100 : ratio, hitCount, split, opts.roll, { flags, crit })
      const final = pick(h.min, h.max, opts.roll)
      const rowNotes = [`ratio ${ratio}% — ${calc!.src}`]
      if (calc!.note) rowNotes.push(calc!.note)
      // magic never misses; physical and misc roll HIT vs FLEE unless IgnoreFlee (or a guaranteed crit)
      const rolls = kind !== 'magical' && !flags.has('IgnoreFlee') && !crit
      const hb = kind === 'physical' ? hitBonus(r.skill) : 1
      const chance = Math.min(100, Math.max(10, (mob.hit - v.flee) * hb)) / 100
      if (rolls) rowNotes.push(`hit ${(chance * 100).toFixed(0)}% (HIT ${mob.hit} − FLEE ${v.flee.toFixed(0)}${hb !== 1 ? `, × ${hb} for this skill` : ''})`)
      rows.push({
        key, label: s.name, skill: r.skill, lv: r.lv, kind, range, element, hits, when,
        raw: h.raw, min: h.min, final, max: h.max, ...hpOf(final),
        hitChance: rolls ? chance : null,
        layers: h.layers, notes: rowNotes, prov: 'derived',
      })
    }
    notes.push(`Skills, chance and cooldown come from the emulator (${mobSkillSource}), not from RTM; chance × mob_skill_rate ${SKILL_RATE * 100}% and cooldown × mob_skill_delay ${SKILL_DELAY * 100}%.`)
  }
  if (v.hp == null) notes.push('Unknown HP: enter the HP from the status window in the Build Planner to see % of HP.')
  notes.push('Not calibrated: no in-game measurement of damage taken yet.')
  rows.sort((a, b) => (a.key === 'auto' ? -1 : b.key === 'auto' ? 1 : b.final - a.final))
  return { rows, passive, source: emu ? 'emu' : 'none', emuName: emu?.emuName ?? null, hp: v.hp, notes }
}
