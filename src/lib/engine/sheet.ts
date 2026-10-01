// computeSheet: Build -> StatSheet. Pure, deterministic, no I/O.
import {
  Build, Item, Modifier, Prov, Qty, Skill, SlotId, SLOTS, StatKey, STATS,
  UnparsedEffect, qty, weakest,
} from '@/lib/types'
import { ClassRules, Extra } from '@/lib/rules/classes'
import {
  CRIT_BASE, aspd as aspdOf, maxHpSp, baseCrit, baseFlee, baseHit, basePerfectDodge,
  emuJob, emuWeaponType, pointBudget, softDef, softMdef, statCostTotal, statusAtk, statusMatk,
} from '@/lib/rules/server'
import { effectivePicks, optionTableFor, resolvePick } from '@/lib/rules/random-options'
import { dreamById } from '@/lib/rules/dream-enchants'
import { sealResult, TEMPLES } from '@/lib/rules/seals'

/** MaxHP ceiling before items that raise it (`max_hp: 50000`, conf/battle/player.conf:89) [emu 2024] */
export const HP_CAP = 50000

export type Totals = {
  flat: Record<string, number>
  pct: Record<string, number>
  scoped: Record<string, Record<string, number>>
}

export type EquippedPiece = {
  slot: SlotId
  item: Item
  refine: number
  cards: Item[]
}

export type StatSheet = {
  cls: string
  calibrated: boolean
  stats: Record<StatKey, number>
  statsBase: Record<StatKey, number>
  budget: { spent: number; cap: number; capProv: Prov; over: boolean }
  totals: Totals
  equipped: EquippedPiece[]
  /** derived numbers, ready for display */
  atk: Qty
  matk: Qty
  def: Qty
  mdef: Qty
  /** null when the class has no HP/SP table in the emulator */
  maxHp: Qty | null
  maxSp: Qty | null
  critRate: Qty
  critDmg: Qty
  hit: Qty
  flee: Qty
  perfectDodge: Qty
  /** ASPD from the emulator. null when the job has no penalty for the weapon */
  aspd: Qty | null
  /** internal emulator job used in class formulas (ASPD) */
  emuJob: { job: string | null; doubtful: string | null }
  defPen: Qty
  leechPower: Qty
  moveSpeed: Qty
  shield: Qty | null
  /** attack and armor element, read from gear; if none, the one set in the build (Neutral) */
  weaponElement: { v: string; from: string }
  armorElement: { v: string; from: string }
  skillPct: Qty | null
  /** lowercase skill name: the skill_dmg key */
  skillName: string | null
  canCrit: boolean
  /** the chosen skill deals magic damage (MATK, MDEF) */
  magic: boolean
  /** the chosen skill's attack range: range >= 4 cells is ranged (battle.cpp battle_range_type) [emu] */
  rangeType: 'melee' | 'ranged'
  skillParts: Extra[]
  /**
   * The same numbers as the in-game status window, split into `base + gear`.
   * `base: null` = no known server formula for that half. Do not invent one.
   */
  split: Record<'atk' | 'def' | 'matk' | 'mdef' | 'hit' | 'flee' | 'crit' | 'aspd',
    { base: number | null; gear: number; why: string }>
  /** everything the engine did NOT apply, with the reason */
  unparsed: (UnparsedEffect & { itemName: string })[]
  skipped: { raw: string; itemName: string; why: string }[]
}

const CONDITIONAL_SKIP: Record<string, string> = {
  set_pieces: 'depends on the set piece count, which the dump does not provide',
  per_set_refine: 'depends on the set total refine, and the text does not say which set',
  copies_min: 'needs more copies of this item equipped',
}

/**
 * Set bonus dedupe key: the same bonus is repeated on every piece. The scope is part of it: "Damage vs all
 * races +10%" is 10 mods with the same text, one per race, and without the scope only the first one counted.
 */
const scopeKey = (m: Modifier) => (m.scope ? JSON.stringify(m.scope) : '')
const setKey = (m: Modifier) =>
  m.cond.t === 'set_bonus' ? `${m.cond.set}|${m.key}|${m.value}|${m.pct}|${scopeKey(m)}|${m.raw}` : ''

function addMod(t: Totals, m: Modifier, mult: number) {
  const v = m.value * mult
  if (m.scope && (m.scope.race || m.scope.size || m.scope.element || m.scope.status || m.scope.skill)) {
    const k = m.scope.race ?? m.scope.size ?? m.scope.element ?? m.scope.status ?? m.scope.skill!
    const bucket = (t.scoped[m.key] ??= {})
    bucket[k] = (bucket[k] ?? 0) + v
    return
  }
  const target = m.pct ? t.pct : t.flat
  target[m.key] = (target[m.key] ?? 0) + v
}

/** Multiplier of a Cond. `null` = not applicable (becomes `skipped`). */
function condMultiplier(
  m: Modifier, refine: number, baseLv: number, stats: Record<StatKey, number> | null,
  skills: Record<string, number> = {}, baseStats: Record<StatKey, number> | null = null,
): number | null {
  const c = m.cond
  switch (c.t) {
    case 'always': return 1
    case 'refine_min': return refine >= c.n ? 1 : 0
    case 'level_min': return baseLv >= c.n ? 1 : 0
    case 'per_refine': return Math.floor(refine / Math.max(1, c.each))
    case 'per_stat': return stats ? Math.floor(stats[c.stat] / Math.max(1, c.each)) : null  // `stats` is base or total, per c.base
    // "Every level of X or Y": SUMS the levels of both. Measured on 2026-09-28 (Ominous Lament): Roaring +89% and
    // Reaping +40% in @battlestats, crit 117 in the window — they only add up with 2% × (10 + 10)
    case 'per_skill_lv': return c.skills.reduce((a, k) => a + (skills[k] ?? 0), 0)
    // Angel of Genesis: one `if (readparam(bX) > 98)` per stat, and readparam is the allocated stat (pc.cpp:8026) [emu]
    case 'per_base_stat_min': return baseStats ? Object.values(baseStats).filter((v) => v >= c.n).length : null
    default: return null
  }
}

export function computeSheet(
  build: Build,
  byId: Map<number, Item>,
  skill: Skill | null,
  rules: ClassRules,
  toggles: Record<string, boolean>,
  /** only the Simulator passes this: food that adds to a stat */
  food?: { stat: StatKey; value: number } | null,
): StatSheet {
  const equipped: EquippedPiece[] = []
  const skippedSlots: StatSheet['skipped'] = []
  // a two-handed weapon occupies both hands: the off-hand does not count
  const weaponItem = build.slots.weapon ? byId.get(build.slots.weapon.id) : undefined
  const blocksOffhand = !!weaponItem?.twoHanded

  for (const s of SLOTS) {
    const e = build.slots[s.id]
    if (!e) continue
    const item = byId.get(e.id)
    if (!item) continue
    if (s.id === 'offhand' && blocksOffhand) {
      skippedSlots.push({
        raw: item.name,
        itemName: item.name,
        why: `off-hand ignored: ${weaponItem!.name} is a two-handed weapon`,
      })
      continue
    }
    equipped.push({
      slot: s.id,
      item,
      refine: e.refine ?? 0,
      cards: (e.cards ?? []).map((c) => byId.get(c)).filter(Boolean) as Item[],
    })
  }

  const totals: Totals = { flat: {}, pct: {}, scoped: {} }
  const skipped: StatSheet['skipped'] = [...skippedSlots]
  const pending: { m: Modifier; refine: number; itemName: string }[] = []
  const seenSetBonus = new Set<string>()

  // names of everything equipped (items and cards), to check for complete sets
  const wearing = new Set(equipped.flatMap((p) => [p.item.name, ...p.cards.map((c) => c.name)]))

  // ---- pass 1: everything that does not depend on stats ----
  for (const p of equipped) {
    const sources: { it: Item; refine: number }[] = [
      { it: p.item, refine: p.refine },
      ...p.cards.map((c) => ({ it: c, refine: p.refine })),
    ]
    for (const { it, refine } of sources) {
      for (const m of it.mods) {
        if (m.req) {
          const v = build.stats[m.req.stat]
          if ((m.req.min != null && v < m.req.min) || (m.req.max != null && v > m.req.max)) {
            const lim = m.req.min != null ? `≥ ${m.req.min}` : `≤ ${m.req.max}`
            skipped.push({ raw: m.raw, itemName: it.name, why: `requires base ${m.req.stat.toUpperCase()} ${lim} (has ${v})` })
            continue
          }
        }
        if (m.cond.t === 'set_bonus') {
          // the dump repeats the set bonus on every piece — count it only once
          const k = setKey(m)
          if (seenSetBonus.has(k)) continue
          seenSetBonus.add(k)
          const missing = m.cond.members.filter((n) => !wearing.has(n))
          if (missing.length) {
            skipped.push({ raw: m.raw, itemName: it.name, why: `set ${m.cond.set} incomplete: missing ${missing.join(', ')}` })
            continue
          }
          addMod(totals, m, 1)
          continue
        }
        if (m.cond.t === 'per_set_refine' && m.cond.members) {
          // same dedupe as the set bonus: every piece repeats the line
          const k = `${m.cond.set}|refine|${m.key}|${m.value}|${m.pct}|${scopeKey(m)}|${m.raw}`
          if (seenSetBonus.has(k)) continue
          seenSetBonus.add(k)
          const members = m.cond.members
          const missing = members.filter((n) => !wearing.has(n))
          if (missing.length) {
            skipped.push({ raw: m.raw, itemName: it.name, why: `set ${m.cond.set} incomplete: missing ${missing.join(', ')}` })
            continue
          }
          const total = equipped.filter((e) => members.includes(e.item.name)).reduce((a, e) => a + e.refine, 0)
          const mult = Math.floor(total / Math.max(1, m.cond.each))
          if (mult) addMod(totals, m, mult)
          continue
        }
        if (m.cond.t === 'set_refine' && m.cond.members) {
          // once per set; counts how many thresholds the set's total refine reaches ("9+ and again at 18+")
          const k = `${m.cond.set}|setref|${m.cond.ns.join(',')}|${m.key}|${m.value}|${m.pct}|${scopeKey(m)}|${m.raw}`
          if (seenSetBonus.has(k)) continue
          seenSetBonus.add(k)
          const members = m.cond.members
          const missing = members.filter((n) => !wearing.has(n))
          if (missing.length) {
            skipped.push({ raw: m.raw, itemName: it.name, why: `set ${m.cond.set} incomplete: missing ${missing.join(', ')}` })
            continue
          }
          const total = equipped.filter((e) => members.includes(e.item.name)).reduce((a, e) => a + e.refine, 0)
          const mult = m.cond.ns.filter((n) => total >= n).length
          if (mult) addMod(totals, m, mult)
          else skipped.push({ raw: m.raw, itemName: it.name, why: `set refine ${total} below ${m.cond.ns[0]}` })
          continue
        }
        if (m.cond.t === 'copies_min') {
          // "With two of these equipped": counts once, and only with N copies of the same item
          const k = `copies|${it.id}|${m.key}|${scopeKey(m)}|${m.raw}`
          if (seenSetBonus.has(k)) continue
          seenSetBonus.add(k)
          const copies = equipped.reduce((a, e) => a + (e.item.id === it.id ? 1 : 0) + e.cards.filter((c) => c.id === it.id).length, 0)
          if (copies < m.cond.n) {
            skipped.push({ raw: m.raw, itemName: it.name, why: `needs ${m.cond.n} copies equipped (has ${copies})` })
            continue
          }
          addMod(totals, m, 1)
          continue
        }
        if (m.cond.t === 'per_stat') { pending.push({ m, refine, itemName: it.name }); continue }
        const mult = condMultiplier(m, refine, build.baseLv, null, build.skills, build.stats)
        if (mult === null) {
          skipped.push({ raw: m.raw, itemName: it.name, why: CONDITIONAL_SKIP[m.cond.t] ?? 'condition not modeled' })
          continue
        }
        if (mult !== 0) addMod(totals, m, mult)
      }
    }
  }

  // ---- random options: applied together with gear, before stats ----
  for (const p of equipped) {
    const table = optionTableFor(p.item, p.slot)
    const picks = table ? effectivePicks(table, build.slots[p.slot]?.opts) : build.slots[p.slot]?.opts
    if (!picks?.length) continue
    if (!table) {
      skipped.push({ raw: 'random options', itemName: p.item.name, why: 'this item type has no random option table' })
      continue
    }
    picks.forEach((pick, line) => {
      const r = resolvePick(table, line, pick)
      if (!r) return
      if ('error' in r) { skipped.push({ raw: `line ${line + 1}`, itemName: p.item.name, why: r.error }); return }
      const sign = r.opt.sign ?? 1
      const raw = `${r.opt.label} ${r.v} [random option, line ${line + 1}]`
      if (!r.opt.mods) { skipped.push({ raw, itemName: p.item.name, why: r.opt.why ?? 'not modeled' }); return }
      const src = { itemId: p.item.id, line: -1 - line }
      const scope = r.opt.scope ? { skill: r.opt.scope } : undefined
      for (const k of r.opt.mods) addMod(totals, { key: k.key, value: sign * r.v, pct: k.pct, scope, cond: { t: 'always' }, src, raw }, 1)
      for (const e of r.opt.extra ?? []) addMod(totals, { key: e.key, value: e.value, pct: e.pct, cond: { t: 'always' }, src, raw }, 1)
    })
  }

  // ---- Seals: Valhalla on the rune, Amatsu on the Manual/Tome; only apply with the item equipped ----
  for (const sys of ['odin', 'ama'] as const) {
    const ids = build.seals?.[sys]
    if (!ids?.length) continue
    const t = TEMPLES[sys]
    const host = equipped.find((p) => p.slot === t.slot)
    if (!host) { skipped.push({ raw: t.label, itemName: t.label, why: `engraved on slot ${t.slot}, which is empty` }); continue }
    const r = sealResult(sys, ids)
    const src = { itemId: host.item.id, line: -300 }
    for (const x of r.mods) addMod(totals, { key: x.key, value: x.value, pct: x.pct, cond: { t: 'always' }, src, raw: t.label }, 1)
    for (const l of r.lines) if (!l.applied) skipped.push({ raw: `${l.word ?? ''} ${l.text}`.trim(), itemName: t.label, why: 'not modeled by the engine' })
  }

  // ---- Dream Enchant: 1 per item; the "+10" stacks with the base; "Base X 99" checks the base stat ----
  for (const p of equipped) {
    const id = build.slots[p.slot]?.dream
    if (!id) continue
    const d = dreamById.get(id)
    const raw = `Dream Enchant: ${d?.name ?? id}`
    if (!d) { skipped.push({ raw, itemName: p.item.name, why: 'unknown enchant' }); continue }
    if (!p.item.dreamEnchant) { skipped.push({ raw, itemName: p.item.name, why: 'the item does not accept Dream Enchant' }); continue }
    const src = { itemId: p.item.id, line: -100 }
    const add = (x: { key: string; value: number; pct: boolean }) => addMod(totals, { key: x.key, value: x.value, pct: x.pct, cond: { t: 'always' }, src, raw }, 1)
    d.base.forEach(add)
    if (p.refine >= 10) d.at10.forEach(add)
    if (d.base99 && build.stats[d.base99.stat] >= 99) d.base99.mods.forEach(add)
  }

  // ---- Simulator buffs (the Planner passes empty toggles) ----
  for (const bm of rules.buffMods(toggles, { skills: build.skills, stats: build.stats })) {
    addMod(totals, { key: bm.key, value: bm.value, pct: bm.pct, cond: { t: 'always' }, src: { itemId: 0, line: -200 }, raw: bm.label }, 1)
  }
  if (food?.value) {
    addMod(totals, { key: food.stat, value: food.value, pct: false, cond: { t: 'always' }, src: { itemId: 0, line: -201 }, raw: 'food' }, 1)
  }

  // ---- element: weapon card > the weapon itself > shadow gloves > off-hand; armor: card > item > off-hand ----
  const pickEl = (order: SlotId[], field: 'endow' | 'armorEl', fallback: string) => {
    for (const slot of order) {
      const p = equipped.find((e) => e.slot === slot)
      if (!p) continue
      for (const it of [...p.cards, p.item]) {
        const e = it[field]
        if (e) return { v: e, from: it.name }
      }
    }
    return { v: fallback, from: 'no item grants an element' }
  }
  const weaponElement = (() => {
    const e = pickEl(['weapon', 'shadowGloves', 'offhand', 'ammo'], 'endow', build.weaponElement)
    // Burning Scythe only applies when no item already grants an element
    return e.from === 'no item grants an element' && toggles.burningScythe ? { v: 'Fire', from: 'Burning Scythe' } : e
  })()
  const armorElement = pickEl(['armor', 'offhand'], 'armorEl', build.armorElement)

  // ---- pass 2: what depends on stats ----
  const statsBase = { ...build.stats }
  const applyPending = ({ m, refine, itemName }: (typeof pending)[number], st: Record<StatKey, number>) => {
    if (m.cond.t === 'per_stat' && m.cond.members) {
      // set bonus "Max HP +20 per base INT": once per set, and only with every piece
      const k = `${m.cond.set}|perstat|${m.key}|${m.value}|${m.pct}|${scopeKey(m)}|${m.raw}`
      if (seenSetBonus.has(k)) return
      seenSetBonus.add(k)
      const missing = m.cond.members.filter((n) => !wearing.has(n))
      if (missing.length) {
        skipped.push({ raw: m.raw, itemName, why: `set ${m.cond.set} incomplete: missing ${missing.join(', ')}` })
        return
      }
    }
    const mult = condMultiplier(m, refine, build.baseLv, st)
    if (mult) addMod(totals, m, mult)
  }
  // "per base STAT" only reads the allocated stats, so it resolves BEFORE the totals: a stat it grants
  // (Unknown Tech: LUK +1 per 5 base DEX) has to reach the stat window and everything derived from it
  const byBase = (x: (typeof pending)[number]) => x.m.cond.t === 'per_stat' && !!x.m.cond.base
  for (const x of pending) if (byBase(x)) applyPending(x, statsBase)

  // ---- stats: base + gear ----
  const all = totals.flat.all_stats ?? 0
  // the game does not let a total stat go negative: AGI 1 with −2 from gear becomes 0 (window shows "1 −1") [measured in-game 2026-09-28]
  const stats = Object.fromEntries(
    STATS.map((s) => [s, Math.max(0, statsBase[s] + all + (totals.flat[s] ?? 0))]),
  ) as Record<StatKey, number>

  for (const x of pending) if (!byBase(x)) applyPending(x, stats)

  // manual additions: whatever the parser did not understand, the user credits here.
  // They go into the flat bucket; the derived values below add flat + pct, so this works
  // for both absolute values and percentage points.
  for (const [k, v] of Object.entries(build.manual)) {
    if (v) totals.flat[k] = (totals.flat[k] ?? 0) + v
  }

  const flat = (k: string) => totals.flat[k] ?? 0
  const pct = (k: string) => totals.pct[k] ?? 0

  const weaponAtk = equipped.find((e) => e.slot === 'weapon')?.item.atk ?? 0
  const weaponMatk = equipped.find((e) => e.slot === 'weapon')?.item.matk ?? 0
  // armor refine: db/re/refine.yml group Armor = 50 per refine, in hundredths → +0.5 DEF per refine
  const ARMOR_SLOTS = new Set(['armor', 'garment', 'shoes', 'upper', 'mid', 'lower', 'offhand'])
  // rounds like the emulator: base_status->def += (refinedef + 50) / 100 (status.cpp:4489)
  const refineDef = Math.floor((equipped.reduce((a, e) => a + (ARMOR_SLOTS.has(e.slot) && e.item.refinable ? e.refine * 50 : 0), 0) + 50) / 100)
  const gearDef = equipped.reduce((a, e) => a + e.item.def, 0) + refineDef
  const gearMdef = equipped.reduce((a, e) => a + e.item.mdef, 0)
  const defTotal = gearDef + flat('def') + gearDef * (pct('def') / 100)
  const mdefTotal = gearMdef + flat('mdef')
  // End of Kings: "Adds ATK equal to 10% of your total DEF" — read as the equipment DEF shown here, added as
  // flat gear ATK before ATK% [db, estimated reading]
  const atkFromDef = Math.floor(defTotal * (pct('atk_from_def') + flat('atk_from_def')) / 100)
  const matkFromMdef = Math.floor(mdefTotal * (pct('matk_from_mdef') + flat('matk_from_mdef')) / 100)

  const lv = build.baseLv
  const sAtk = statusAtk(stats, lv)
  const sMatk = statusMatk(stats, lv)

  // ---- emulator base status ----
  const bHit = baseHit(stats, lv)
  const bFlee = baseFlee(stats, lv)
  const bCrit = baseCrit(stats)
  const bPd = basePerfectDodge(stats)
  // "Soft DEF +1%" (End of Kings, per total set refine) scales the VIT-based soft DEF
  const sDef = Math.floor(softDef(stats, lv) * (1 + (pct('soft_def') + flat('soft_def')) / 100))
  const sMdef = softMdef(stats, lv)
  const gearCrit = flat('crit_rate') + pct('crit_rate')
  // "Total Critical Rate +N%" is bCriticalRate: multiplies base + gear, before
  // passives. All in the emulator's 0.1 unit (`status.cpp:4790`)
  const critMult = 100 + flat('crit_rate_mult') + pct('crit_rate_mult')
  const critBeforePassives = Math.floor((bCrit + gearCrit) * 10 * critMult / 100) / 10
  const gearPd = flat('perfect_dodge') + pct('perfect_dodge')

  const weaponEq = equipped.find((e) => e.slot === 'weapon')
  const offEq = equipped.find((e) => e.slot === 'offhand')
  const wType = emuWeaponType(weaponEq?.item)
  const pas = rules.passives({ skills: build.skills, weaponType: wType })
  const pSum = (k: 'atk' | 'crit' | 'flee' | 'hit' | 'pd') => (pas[k] ?? []).reduce((a, e) => a + e.value, 0)
  const pWhy = (k: 'atk' | 'crit' | 'flee' | 'hit' | 'pd') => (pas[k] ?? []).map((e) => `+${e.value} ${e.label}`).join(' · ')
  const job = emuJob(build.cls)
  const asp = aspdOf(build.cls, stats, wType, {
    shield: offEq?.item.grp === 'Shield',
    offhandType: offEq && offEq.item.grp === 'Weapon' ? emuWeaponType(offEq.item) : null,
    pct: pct('aspd'),
    flat: flat('aspd'),
    limit: flat('aspd_limit'),
  })
  const mastery = pSum('atk')
  // ---- renewal ATK (emu battle.cpp:2228–2300, 3463) ----
  // refine: db/re/refine.yml gives 50 × weapon level per refine, in hundredths → 0.5 × wlv per refine
  const wEq = equipped.find((e) => e.slot === 'weapon')
  const refineAtk = Math.floor((wEq?.item.wlv ?? 0) * 50 * (wEq?.refine ?? 0) / 100)
  // in-game window: left = status ATK; right = weapon + refine + gear ATK (without mastery)
  const shownGear = weaponAtk + refineAtk + flat('atk') + atkFromDef
  // damage: status ATK counts 2× (battle_calc_status_attack); the weapon gains ATK × STR/200
  // (base_stat_bonus, without the variance, which is symmetric); mastery adds without element
  const weaponPart = weaponAtk * (1 + stats.str / 200) + refineAtk
  const atkRaw = (2 * sAtk + weaponPart + mastery + flat('atk') + atkFromDef) * (1 + pct('atk') / 100)
  const inn = rules.innate
  const bHitT = bHit + pSum('hit') + (inn?.hit ?? 0)
  const bFleeT = bFlee + pSum('flee')
  const critTotal = critBeforePassives + pSum('crit')
  const bPdT = bPd + pSum('pd') + (inn?.pd ?? 0)
  const ctxSkillLv = skill ? Math.min(build.skills[skill.key] || build.skillLv || skill.maxLv, skill.maxLv) : 0
  const ctx = {
    stats, toggles, skillKey: skill?.key ?? null, skillLv: ctxSkillLv,
    baseLv: build.baseLv, leechPower: pct('leech_power') + flat('leech_power'), skills: build.skills,
  }

  // ---- skill % ----
  let skillPct: Qty | null = null
  const skillParts: Extra[] = []
  if (skill?.damage) {
    const d = skill.damage
    const allocated = build.skills[skill.key]
    const lv = Math.min(allocated || build.skillLv || skill.maxLv, skill.maxLv)
    const base = d.base + d.coefPerLevel * lv
    skillParts.push({ label: `${skill.name} Lv${lv}`, value: base, prov: 'db', why: d.formulaRaw })
    for (const ps of d.perStat) {
      skillParts.push({
        label: `${ps.pct}% per ${ps.stat.toUpperCase()}`,
        value: ps.pct * stats[ps.stat],
        prov: 'db',
        why: d.formulaRaw,
      })
    }
    for (const e of rules.skillPctExtra(ctx)) skillParts.push(e)
    const total = skillParts.reduce((a, p) => a + p.value, 0)
    skillPct = qty(total, weakest(...skillParts.map((p) => p.prov)), ...skillParts.map((p) => p.label))
  }

  const shieldExtra = rules.shield(ctx)
  const hpRaw = maxHpSp('hp', build.cls, lv, stats.vit, { flat: flat('hp'), pct: pct('hp') }, inn?.hpRate ?? 0)
  // MaxHP ceiling: max_hp 50000 in the emulator (conf/battle/player.conf:89); Valhalla Knight Card ×2 and
  // Heimdall's Legacy raise it, which confirms the server has one [emu 2024]
  const hpCap = HP_CAP + flat('hp_limit')
  const hp = hpRaw && hpRaw.v > hpCap
    ? { ...hpRaw, v: hpCap, why: `${hpRaw.why} → ${Math.trunc(hpRaw.v)} capped at ${hpCap} (MaxHP limit ${HP_CAP}${flat('hp_limit') ? ` + ${flat('hp_limit')}` : ''}) [emu]` }
    : hpRaw
  const sp = maxHpSp('sp', build.cls, lv, stats.int, { flat: flat('sp'), pct: pct('sp') }, 0)

  const spentStats = STATS.reduce((a, s) => a + statCostTotal(statsBase[s]), 0)
  const cap = build.points ?? pointBudget(build.baseLv).v

  const unparsed: StatSheet['unparsed'] = []
  for (const p of equipped) {
    for (const it of [p.item, ...p.cards]) {
      for (const u of it.unparsed) unparsed.push({ ...u, itemName: it.name })
    }
  }

  const prov: Prov = rules.calibrated ? 'derived' : 'uncalibrated'

  return {
    cls: build.cls,
    calibrated: rules.calibrated,
    stats,
    statsBase,
    budget: {
      spent: spentStats,
      cap,
      capProv: build.points != null ? 'reported' : pointBudget(build.baseLv).prov,
      over: spentStats > cap,
    },
    totals,
    equipped,
    atk: qty(atkRaw, 'emu', `status ATK ${sAtk} × 2`, `weapon ${weaponAtk} × (1 + STR/200) + refine ${refineAtk}`, `mastery ${mastery}`, `gear ${flat('atk')}`, atkFromDef ? `${atkFromDef} from DEF (End of Kings)` : '', `${pct('atk')}%`),
    matk: qty((sMatk + weaponMatk + refineAtk + flat('matk') + matkFromMdef) * (1 + pct('matk') / 100), 'emu', `status MATK ${sMatk}`, `weapon ${weaponMatk} + refine ${refineAtk}`, `gear ${flat('matk')}`, matkFromMdef ? `${matkFromMdef} from MDEF` : '', `${pct('matk')}%`),
    def: qty(defTotal, 'derived', 'gear DEF + mods'),
    mdef: qty(mdefTotal, 'derived', 'gear MDEF + mods'),
    maxHp: hp ? qty(hp.v, 'emu', hp.why) : null,
    maxSp: sp ? qty(sp.v, 'emu', sp.why) : null,
    critRate: qty(critTotal, 'emu', `base ${bCrit} (LUK) [emu]`, `gear ${gearCrit}`, critMult !== 100 ? `× ${critMult}% (Total Critical Rate)` : '', pWhy('crit')),
    hit: qty(bHitT + flat('hit') + pct('hit'), 'emu', `base ${bHit} [emu]`, pWhy('hit'), `gear ${flat('hit') + pct('hit')}`),
    flee: qty(bFleeT + flat('flee') + pct('flee'), 'emu', `base ${bFlee} [emu]`, pWhy('flee'), `gear ${flat('flee') + pct('flee')}`),
    critDmg: qty(pct('crit_dmg') + flat('crit_dmg'), 'db', 'Critical Damage'),
    perfectDodge: qty(bPdT + gearPd, 'emu', `base ${bPd} (LUK+AGI) [emu]`, pWhy('pd'), `gear ${gearPd}`),
    aspd: asp.v != null ? qty(asp.v, 'emu', asp.why) : null,
    emuJob: job,
    defPen: qty(flat('def_pen') + pct('def_pen'), 'db', 'Defense Penetration'),
    // Vampire Mark adds to per-hit leech, but not to the shield (ctx.leechPower) [player report 2026-09-28]
    leechPower: qty(pct('leech_power') + flat('leech_power') + pct('leech_power_buff'), 'db', 'Leech Power', pct('leech_power_buff') ? `+${pct('leech_power_buff')} Vampire Mark (not in shield)` : ''),
    moveSpeed: qty(pct('move_speed'), 'db', 'Move Speed'),
    shield: shieldExtra ? qty(shieldExtra.value, shieldExtra.prov, shieldExtra.why) : null,
    weaponElement,
    armorElement,
    skillPct: skillPct ? { ...skillPct, prov: rules.calibrated ? skillPct.prov : prov } : null,
    skillParts,
    skillName: skill ? skill.name.toLowerCase() : null,
    canCrit: skill?.damage?.canCrit ?? true,
    magic: !!skill?.damage?.magic,
    // skillrange_by_distance does not include players (conf/battle/skill.conf: 14), so the skill's range decides;
    // Devil Raid (range 9) measured in-game 2026-09-30 without the build's Melee +15%
    rangeType: (skill?.range?.[Math.min(ctxSkillLv || 1, skill.range.length) - 1] ?? 1) >= 4 ? 'ranged' : 'melee',
    unparsed,
    skipped,
    split: {
      atk: {
        base: sAtk,
        gear: shownGear,
        why: `status ATK = STR + STR/10 + DEX/5 + DEX/20 + LUK/3 + lv/4 [emu, matches the codex] · right: weapon ${weaponAtk} + refine ${refineAtk} + ${flat('atk')} from gear (mastery ${mastery} is not shown in the window)${pct('atk') ? ` · ${pct('atk')}% applied to the total` : ''}`,
      },
      def: {
        base: sDef,
        gear: gearDef + flat('def'),
        why: 'soft DEF = lv + VIT + 5 per 10 VIT [emu; ~1.5/VIT matches measurements]. Damage taken reduction uses only hard DEF (curve K=384)',
      },
      matk: {
        base: sMatk,
        gear: weaponMatk + refineAtk + flat('matk') + matkFromMdef,
        why: `status MATK = INT + INT/2 + DEX/5 + LUK/3 + lv/4 + INT/10 + DEX/10 [emu, pc.hpp:1149] · weapon ${weaponMatk} + refine ${refineAtk} (@battlestats shows "MATK 10" on Ominous +7) + ${flat('matk')} from mods`,
      },
      mdef: { base: sMdef, gear: gearMdef + flat('mdef'), why: 'soft MDEF = INT + lv/4 + 5 per 10 VIT + (DEX+VIT)/5 [emu]' },
      // the in-game window shows HIT and crit as a single number, and FLEE as flee + perfect dodge
      hit: {
        base: bHitT + flat('hit') + pct('hit'),
        gear: 0,
        why: `HIT = lv + 2×DEX + LUK/5 + 175 [emu] ${pWhy('hit')} · gear ${flat('hit') + pct('hit')} ${inn?.hit ? `· +${inn.hit} from class [measured naked 2026-09-27]` : ''}`,
      },
      flee: {
        base: bFleeT + flat('flee') + pct('flee'),
        gear: Math.floor(bPdT + gearPd), // the window truncates: flee2/10 (clif.cpp:3517)
        why: `FLEE = lv + AGI + AGI/10 + LUK/5 + 100 [emu] ${pWhy('flee')} · gear ${flat('flee') + pct('flee')} · on the right, perfect dodge (LUK+AGI+10)/10 + ${gearPd} from gear`,
      },
      crit: {
        base: Math.floor(critTotal), // the window truncates: cri/10
        gear: 0,
        why: `crit = 1 + LUK/3 + 2 per 10 LUK [emu] + ${gearCrit} from gear${critMult !== 100 ? ` × ${critMult}%` : ''} ${pWhy('crit')}`,
      },
      // the game shows a single number; gear is already inside the formula
      aspd: { base: asp.v, gear: 0, why: asp.v != null ? `${asp.why} [emu]` : asp.why },
    },
  }
}

export { CRIT_BASE }
