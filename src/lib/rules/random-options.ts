// Random options by item type. Source: rtmrefuge.pages.dev/gear [official].
// The dump does not include these tables.
// "An item rolls one option from each line it has." There is no reroll on the server.
import { Item, Prov, SlotId, StatKey } from '@/lib/types'

/** One option of a line. The chosen `v` ranges from `min` to `max`; `sign` −1 = reduction. */
export type RandomOption = {
  id: string
  label: string
  min: number
  max: number
  sign?: 1 | -1
  /** engine keys the option feeds. `null` = the engine does not model it (shown as "not applied") */
  mods: { key: string; pct: boolean }[] | null
  /** flat bonus that comes with the option, regardless of the rolled value */
  extra?: { key: string; pct: boolean; value: number }[]
  /** why it is not counted, when `mods` is null */
  why?: string
  /** target skill, for `skill_dmg` */
  scope?: string
}

export type OptionTable = {
  group: string; prov: Prov; lines: RandomOption[][]
  /** special item: the lines are always the same, applied without choice */
  fixed?: boolean
}

const STAT_LABEL: Record<StatKey, string> = { str: 'STR', agi: 'AGI', vit: 'VIT', int: 'INT', dex: 'DEX', luk: 'LUK' }
const STATS: StatKey[] = ['str', 'agi', 'vit', 'int', 'dex', 'luk']

const o = (id: string, label: string, min: number, max: number, mods: RandomOption['mods'], rest: Partial<RandomOption> = {}): RandomOption =>
  ({ id, label, min, max, mods, ...rest })
const flat = (key: string) => [{ key, pct: false }]
const pct = (key: string) => [{ key, pct: true }]
const off = (id: string, label: string, min: number, max: number, why: string) => o(id, label, min, max, null, { why })

const stats = (min: number, max: number) => STATS.map((s) => o(s, `${STAT_LABEL[s]} +`, min, max, flat(s)))

// ---- recurring options ----
const hpP = (a: number, b: number) => o('hp_pct', 'Max HP +%', a, b, pct('hp'))
const spP = (a: number, b: number) => o('sp_pct', 'Max SP +%', a, b, pct('sp'))
const atkP = o('atk_pct', 'ATK +%', 1, 3, pct('atk'))
const matkP = o('matk_pct', 'MATK +%', 1, 3, pct('matk'))
const atkF = (a = 1, b = 5) => o('atk', 'ATK +', a, b, flat('atk'))
const matkF = (a = 1, b = 5) => o('matk', 'MATK +', a, b, flat('matk'))
const crit = (a = 1, b = 10) => o('crit', 'Critical Rate +', a, b, flat('crit_rate'))
const aspdF = o('aspd', 'ASPD +', 1, 2, flat('aspd'))
const hit = o('hit', 'Hit +', 10, 20, flat('hit'))
const spCost = o('sp_cost', 'SP Cost −%', 1, 10, pct('sp_cost'), { sign: -1 })
const acd = (a = 1, b = 10) => o('acd', 'After-cast Delay −%', a, b, pct('after_cast_delay'), { sign: -1 })
const magicDmg = (a = 1, b = 10) => off('magic_dmg', 'Magic DMG +%', a, b, 'the engine has no magic damage pool')
const melee = (a = 1, b = 10) => o('melee', 'Melee DMG +%', a, b, pct('melee_dmg'))
const ranged = (a = 1, b = 10) => o('ranged', 'Ranged DMG +%', a, b, pct('ranged_dmg'))
const critDmg = (a = 1, b = 10) => o('crit_dmg', 'Critical DMG +%', a, b, pct('crit_dmg'))
const perfectSize = off('perfect_size', 'Perfect Weapon Size', 1, 1, 'the engine does not model weapon size')
const reflectTaken = off('reflect_taken', 'Reflect Taken −100%', 1, 1, 'the engine does not model reflection')
const exp10 = o('exp', 'EXP +10% (all enemies)', 10, 10, pct('exp'))
const fixedPct = o('fixed_cast_pct', 'Fixed Cast −10%', 10, 10, pct('fixed_cast'), { sign: -1 })
const fixedMs = o('fixed_cast_ms', 'Fixed Cast −200 ms', 200, 200, flat('fixed_cast'), { sign: -1 })
const doubleAtk = o('double_attack', 'Double Attack Rate +10%', 10, 10, pct('double_attack_rate'))
const critDmg10 = o('crit_dmg_10', 'Critical DMG +10%', 10, 10, pct('crit_dmg'))
const perfectHit = o('perfect_hit', 'Perfect Hit +10%', 10, 10, pct('perfect_hit'))
const drain = (n: number) => off(`hp_drain_${n}`, `HP Drain +${n} per hit`, n, n, 'the engine does not model flat drain per hit')
const splash = (n: number) => o(`splash_${n}`, `Splash Radius +${n}`, n, n, flat('splash_range'))
const range1 = o('range', 'Attack Range +1', 1, 1, flat('attack_range'))
const pen10 = o('pen', 'Penetration +10', 10, 10, flat('def_pen'))
const mpen10 = o('mpen', 'Magic Penetration +10', 10, 10, flat('mdef_pen'))
// "Weapon DMG Taken" on the site = "Physical Damage Received" in-game [player report 2026-09-28]
const physTaken = o('phys_taken', 'Physical DMG Taken −%', 1, 3, [{ key: 'resist_melee', pct: true }, { key: 'resist_long', pct: true }], { sign: -1 })
const magTaken = o('mag_taken', 'Magic DMG Taken −%', 1, 3, pct('resist_matk'), { sign: -1 })
const healRecv = o('heal_recv', 'Heal Received +%', 5, 10, pct('healing_received'))

/** Shadow line 2: "<Skill> DMG +5%". Only Revenant damage skills are counted. */
const REVENANT_DMG_SKILLS = [
  'Roaring Overslash', 'Reaping Slash', 'Haunting Slice', 'Phantom Slice', 'Mirror Break', 'Final Orchestra',
  'Flaming Wave', 'Underworld Rainstorm', 'High Jump', 'Hellraiser', 'Scythe Reap', 'Sweeping Slash',
]
const SHADOW_SKILL: RandomOption[] = [
  ...REVENANT_DMG_SKILLS.map((n) =>
    o(`skill:${n.toLowerCase()}`, `${n} DMG +5%`, 5, 5, [{ key: 'skill_dmg', pct: true }], { scope: n.toLowerCase() })),
  off('skill:other', 'Other class skill DMG +5%', 5, 5, 'skill Revenant does not use (e.g. Phantom Spear, GodHand Arrow)'),
]

const L1 = [hpP(1, 3), spP(1, 3), atkP, matkP]
const L2crit = [atkF(), matkF(), crit(), aspdF, hit, spCost]
const L4 = (extra: RandomOption[]) => [exp10, fixedPct, fixedMs, ...extra]

const T = (group: string, ...lines: RandomOption[][]): OptionTable => ({ group, prov: 'db', lines })

export const TABLES: Record<string, OptionTable> = {
  armor: T('armor', stats(1, 2), [hpP(1, 5), spP(1, 5)], [physTaken, magTaken, healRecv]),
  shield: T('shield', stats(1, 2),
    [o('def', 'DEF +', 1, 5, flat('def')), o('mdef', 'MDEF +', 1, 3, flat('mdef')), o('pd', 'Perfect Dodge +', 1, 2, flat('perfect_dodge'))],
    [physTaken, magTaken, healRecv]),
  garment: T('garment', stats(1, 2),
    [o('flee', 'Flee +', 5, 10, flat('flee')), o('pd', 'Perfect Dodge +', 1, 3, flat('perfect_dodge'))],
    [o('hp_regen', 'HP Regen +%', 10, 20, pct('hp_regen')), o('sp_regen', 'SP Regen +%', 5, 10, pct('sp_regen')),
      o('leech', 'Leech Rate +% (Leech Power 2%)', 10, 20, pct('leech_rate'), { extra: [{ key: 'leech_power', pct: true, value: 2 }] }),
      fixedMs]),
  shoes: T('shoes', stats(1, 2),
    [o('ms', 'Move Speed +%', 5, 10, pct('move_speed')), o('aspd_pct', 'ASPD +%', 5, 10, pct('aspd'))],
    [o('vct', 'Variable Cast −%', 5, 10, pct('cast_time'), { sign: -1 }), acd(5, 10), o('aspd_limit', 'ASPD Limit +1', 1, 1, flat('aspd_limit'))]),
  accessory: T('accessory', [...stats(1, 1), o('atk_pct', 'ATK +1%', 1, 1, pct('atk')), o('matk_pct', 'MATK +1%', 1, 1, pct('matk')), o('aspd', 'ASPD +1', 1, 1, flat('aspd'))]),
  manual: T('manual', stats(1, 1)),
  codex: T('codex', stats(1, 10)),
  dagger: T('dagger', L1, L2crit, [magicDmg(), melee(), perfectSize, reflectTaken], L4([doubleAtk, critDmg10, perfectHit, drain(2), splash(1)])),
  sword: T('sword', L1, L2crit, [magicDmg(), melee(), ranged(), perfectSize, reflectTaken], L4([pen10, mpen10, perfectHit, drain(3), splash(1)])),
  axe: T('axe', L1, [atkF(), matkF(), acd(), aspdF, hit, spCost], [magicDmg(), melee(), perfectSize, reflectTaken],
    L4([o('phys_taken_axe', 'Weapon DMG Taken −%', 1, 3, physTaken.mods, { sign: -1 }), o('mag_taken_axe', 'Magic DMG Taken −%', 1, 3, magTaken.mods, { sign: -1 }), perfectHit, drain(4), splash(2)])),
  katar: T('katar', L1, L2crit, [critDmg(), melee(), perfectSize, reflectTaken], L4([pen10, critDmg10, perfectHit, drain(2), splash(1)])),
  scythe: T('scythe', L1, L2crit, [critDmg(), melee(), ranged(), reflectTaken], L4([perfectHit, drain(7), splash(1), range1])),
  bow: T('bow', L1, L2crit, [magicDmg(), ranged(), spP(1, 5), o('range_12', 'Attack Range +', 1, 2, flat('attack_range'))],
    L4([doubleAtk, critDmg10, perfectHit, drain(1), range1])),
  spear: T('spear', [atkF(), matkF()], [hpP(5, 10), spP(5, 10)], stats(1, 3)),
  deck: T('deck', [atkF(1, 7), matkF(1, 7)], [o('luk', 'LUK +', 1, 7, flat('luk'))], [o('aspd_limit', 'ASPD Limit +', 1, 7, flat('aspd_limit'))]),
  whip: T('whip', [hpP(1, 3), spP(1, 3), atkF(), matkF()],
    [melee(1, 5), ranged(1, 5), o('matk_pct5', 'MATK +%', 1, 5, pct('matk')), critDmg(1, 5)],
    [aspdF, acd(5, 5), crit(1, 5)]),
  revolver: T('revolver', L1, L2crit, [magicDmg(), ranged(), spP(1, 5), o('range_12', 'Attack Range +', 1, 2, flat('attack_range'))],
    L4([doubleAtk, critDmg10, perfectHit, drain(1), range1])),
  golf: T('golf', [hpP(1, 3), spP(1, 3), atkP, o('vit', 'VIT +', 1, 3, flat('vit'))],
    [atkF(), hit, aspdF, spCost, crit(), o('dex', 'DEX +', 1, 3, flat('dex'))],
    [ranged(), melee(), critDmg(), acd()],
    [fixedPct, fixedMs, range1, pen10, splash(1), exp10]),
  chain: T('chain', [hpP(1, 3), spP(1, 3), atkP, o('vit', 'VIT +', 1, 3, flat('vit'))],
    [atkF(), hit, aspdF, spCost, crit(), o('dex', 'DEX +', 1, 3, flat('dex'))],
    [melee(), physTaken, magTaken, reflectTaken],
    [fixedPct, fixedMs, splash(1), perfectHit, drain(7), exp10]),
  // Class gem [player report 2026-09-28]: 3 fixed lines by stat, value from −3 to +1 (0 not confirmed)
  gem: { group: 'gem', prov: 'reported', lines: [
    [o('str', 'STR +', -3, 1, flat('str')), o('int', 'INT +', -3, 1, flat('int'))],
    [o('agi', 'AGI +', -3, 1, flat('agi')), o('vit', 'VIT +', -3, 1, flat('vit'))],
    [o('dex', 'DEX +', -3, 1, flat('dex')), o('luk', 'LUK +', -3, 1, flat('luk'))],
  ] },
  // Dropped headgear (Flaming Weaver, Njord's Mark): "I believe only attributes" [player report 2026-09-28].
  // The site only says "except some headgears". The +1 range is the only one observed (Flaming Weaver AGI +1).
  headgear: { group: 'headgear', prov: 'reported', lines: [stats(1, 1)] },
  // No table on the site. From 7 observed pieces (Heir ×3, White Abyss, Dead Faith…):
  // line 1 = one stat +1, line 2 = one skill's damage +5% [player report 2026-09-28].
  // No piece came with another value; ranges not confirmed.
  shadow: { group: 'shadow', prov: 'reported', lines: [stats(1, 1), SHADOW_SKILL] },
}

const WEAPON_BY_CAT: Record<string, string> = {
  Dagger: 'dagger', Sword: 'sword', 'Long Sword': 'sword', 'Knight Sword': 'sword', 'Bone Sword': 'sword',
  'Two-Handed Sword': 'sword', Axe: 'axe', 'One-Handed Axe': 'axe', Katar: 'katar', Scythe: 'scythe',
  Bow: 'bow', 'Heavy Bow': 'bow', Spear: 'spear', 'Wyrm Spear': 'spear', 'Two-Handed Spear': 'spear',
  Deck: 'deck', Whip: 'whip', Revolver: 'revolver', 'Golf Club': 'golf', Chain: 'chain',
}

/**
 * Special items with fixed random options: always the same, they do not roll.
 * One option per line, with min = max. Source: an in-game tooltip screenshot.
 */
const fixedOpt = (id: string, label: string, v: number, mods: RandomOption['mods'], sign: 1 | -1 = 1) =>
  o(id, label, v, v, mods, { sign })
export const FIXED: Record<string, OptionTable> = {
  // [player report 2026-09-28] screenshot of +6 Prime Blooming Rose Sandals
  'Blooming Rose Sandals': {
    group: 'Blooming Rose Sandals (fixed)', prov: 'reported', fixed: true,
    lines: [
      [fixedOpt('ms', 'Movement Speed +5%', 5, pct('move_speed'))],
      [fixedOpt('aspd_pct', 'ASPD +5%', 5, pct('aspd'))],
      [fixedOpt('vct', 'Variable Cast Time −5%', 5, pct('cast_time'), -1)],
      [fixedOpt('acd', 'After Cast Delay −5%', 5, pct('after_cast_delay'), -1)],
    ],
  },
}

/** The picks that apply to the table: for fixed tables, always every line. */
export function effectivePicks(table: OptionTable, picks: ({ key: string; v: number } | null)[] | undefined) {
  return table.fixed ? table.lines.map((l) => ({ key: l[0].id, v: l[0].max })) : picks ?? []
}

/** Table that applies to the item in this slot, or null (headgear, costume, pet, rune, card…). */
export function optionTableFor(item: Item | undefined, slot: SlotId): OptionTable | null {
  if (!item || item.grp === 'Card') return null
  if (FIXED[item.name]) return FIXED[item.name]
  // NPC, quest or trade items do not roll random options (Sage Ring, Caelum, tomes…) [player report 2026-09-28]
  if (!item.dropped) return null
  switch (slot) {
    case 'armor': return TABLES.armor
    case 'garment': return TABLES.garment
    case 'shoes': return TABLES.shoes
    case 'accessory': case 'accessory2': return TABLES.accessory
    case 'offhand': return item.grp === 'Shield' ? TABLES.shield : null
    case 'manual': return /codex/i.test(item.cat) ? TABLES.codex : TABLES.manual
    case 'shadowArmor': case 'shadowShoes': case 'shadowGloves': case 'shadowAcc': return TABLES.shadow
    case 'upper': case 'mid': case 'lower': return TABLES.headgear
    case 'gem': return TABLES.gem
    case 'weapon': { const g = WEAPON_BY_CAT[item.cat]; return g ? TABLES[g] : null }
    default: return null
  }
}

export type OptPick = { key: string; v: number }

/** Resolves a line's pick against the table. Returns an error if the option does not exist or the value is out of range. */
export function resolvePick(table: OptionTable, line: number, pick: OptPick | null | undefined):
  { opt: RandomOption; v: number } | { error: string } | null {
  if (!pick) return null
  const opt = table.lines[line]?.find((x) => x.id === pick.key)
  if (!opt) return { error: `option "${pick.key}" does not exist on line ${line + 1} (${table.group})` }
  if (!Number.isFinite(pick.v) || pick.v < opt.min || pick.v > opt.max) {
    return { error: `${opt.label} ${pick.v} out of range ${opt.min}~${opt.max}` }
  }
  return { opt, v: pick.v }
}

/** Short text for the slot: "LUK +2", "Max HP +4%", "SP Cost −5%". Fixed-value options stay as they are. */
export function optShort(opt: RandomOption, v: number): string {
  if (opt.min === opt.max) return opt.label
  const m = /^(.*?)\s*([+−])(%?)$/.exec(opt.label)
  if (!m) return `${opt.label} ${v}`
  // a negative value on a "+" option (class gem: STR −2) becomes a minus sign
  const sign = v < 0 ? (m[2] === '+' ? '−' : '+') : m[2]
  return `${m[1]} ${sign}${Math.abs(v)}${m[3]}`
}
