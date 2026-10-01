// Item text the parser used to drop or misread (2026-10-01). One case per fix.
import { describe, expect, it } from 'vitest'
import { find } from './fixtures'

const mods = (name: string) => find(name).mods.map((m) => ({ key: m.key, value: m.value, pct: m.pct, scope: m.scope ?? {}, cond: m.cond.t, req: m.req }))
const has = (name: string, m: Record<string, unknown>) => expect(mods(name)).toContainEqual(expect.objectContaining(m))

describe('targets: boss, races, elements', () => {
  it('"DMG vs Boss" (the plural strip turned it into "bos")', () => has('Despero Shard Card', { key: 'dmg_vs_boss', value: 3 }))
  it('"Resistance vs Boss"', () => has('Dolor Shard Card', { key: 'resist_boss', value: 3 }))
  it('"DMG vs Demi-Humans"', () => has('Bloody Murderer Card', { key: 'dmg_vs_race', value: 18, scope: { race: 'demihuman' } }))
  it('"Neutral Element Resistance"', () => has('Alligator Card', { key: 'resist_element', value: 5, scope: { element: 'neutral' } }))
  it('"Damage and Resistance vs All Sizes" is both', () => {
    has("King's Noble Armor", { key: 'dmg_vs_size', value: 5, scope: { size: 'large' } })
    has("King's Noble Armor", { key: 'resist_size', value: 5, scope: { size: 'small' } })
  })
  it('a target list split by commas stays whole, and "Extra +1% per refine" keeps the targets', () => {
    for (const e of ['fire', 'water', 'wind', 'earth']) has('Lava Spirit Hood', { key: 'resist_element', value: 5, scope: { element: e }, cond: 'always' })
    has('Lava Spirit Hood', { key: 'resist_element', value: 1, scope: { element: 'fire' }, cond: 'per_refine' })
    expect(mods('Lava Spirit Hood').some((m) => m.key === 'perfect_dodge' && m.cond === 'per_refine')).toBe(false)
  })
})

describe('lines the dump wraps mid-sentence', () => {
  it('"Critical +5, Critical Damage" / "+10%"', () => {
    has('Sylph Lance', { key: 'crit_dmg', value: 10 })
    expect(mods('Sylph Lance').some((m) => m.key === 'crit_rate' && m.pct)).toBe(false)
  })
  it('"Magic Defense Penetration" / "+5" is MDEF pen, not DEF pen', () => {
    has('Onmyoji Mantle', { key: 'mdef_pen', value: 5, cond: 'always' })
    expect(mods('Onmyoji Mantle').some((m) => m.key === 'def_pen')).toBe(false)
  })
  it('"Defense Penetration +5," / "+1 more per refine"', () => has("Ornstein's Gift Armor", { key: 'def_pen', value: 1, cond: 'per_refine' }))
  it('"ATK +1 and MATK +1 per" / "set refine": both, per total set refine', () => {
    has('Fallen Dagger', { key: 'atk', value: 1, cond: 'per_set_refine' })
    has('Fallen Dagger', { key: 'matk', value: 1, cond: 'per_set_refine' })
  })
  it('"Heal SP cost -9%," / "plus 9% more per refine" keeps the skill and the sign', () =>
    has('Friendly Orphan Armor', { key: 'skill_sp_cost', value: -9, scope: { skill: 'heal' }, cond: 'per_refine' }))
  it('a sentence is not joined with the next stat ("…on level learned" + "MATK -10%")', () => has('Surtr Avatar Card', { key: 'matk', value: -10, cond: 'always' }))
})

describe('other forms', () => {
  it('"Double Attack Lv4 (40%)" is the rate', () => has('Dual Sharp Scythe', { key: 'double_attack_rate', value: 40 }))
  it('"Bonus AGI +3 if Base Stat is 99" is gated on the allocated stat', () => has('Agi Glove', { key: 'agi', value: 3, req: { stat: 'agi', min: 99 } }))
  it('"Queen\'s Brand, Plague Impress and Dragon Breath DMG+20%": one modifier per skill', () => {
    for (const sk of ["queen's brand", 'plague impress', 'dragon breath']) has('Armor of Lords', { key: 'skill_dmg', value: 20, scope: { skill: sk } })
  })
  it('"ATK -2. MATK -2." is two effects', () => {
    has('Feral Bond Armor', { key: 'atk', value: -2 })
    has('Feral Bond Armor', { key: 'matk', value: -2 })
  })
  it('economy lines are "not modeled", not "not understood"', () => {
    const u = find("Hel's Desires Armor").unparsed
    expect(u.filter((x) => /Kafra/.test(x.raw)).every((x) => x.reason === 'nao_modelado')).toBe(true)
  })
})

describe('new effects the engine now applies (2026-10-01)', () => {
  it('Heir to the King: "Adds DEF equal to 10% of your total ATK" (and MDEF from MATK)', () => {
    has('Heir to the King Armor', { key: 'def_from_atk', value: 10 })
    has('Heir to the King Armor', { key: 'mdef_from_matk', value: 10 })
  })
  it('flat SP/HP every second', () => {
    has('Crown of the Divine', { key: 'sp_per_sec', value: 1, cond: 'per_refine' })
    has('Deathcover Mantle', { key: 'hp_per_sec', value: -5, cond: 'per_refine' })
  })
  it('"Reduces all physical damage by 1% per refine"', () => has('Deathland Greaves', { key: 'resist_melee', value: 1, cond: 'per_refine' }))
  it('"DMG vs Formless" (the plural strip turned it into "formles")', () => has('Chocolate Bear Card', { key: 'dmg_vs_race', value: 18, scope: { race: 'formless' } }))
  it('"+4 refine: Total DEF +5%"', () => expect(find('Embracing Goddess Armor').mods).toContainEqual(expect.objectContaining({ key: 'def', value: 5, cond: { t: 'refine_min', n: 4 } })))
})
