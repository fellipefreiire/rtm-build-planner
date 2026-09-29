import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { computeSheet } from '@/lib/engine/sheet'
import { rulesFor } from '@/lib/rules/classes'
import { optionTableFor, TABLES } from '@/lib/rules/random-options'
import { buildFromJson, buildToJson, decodeBuild, encodeBuild, isDecodeError } from '@/lib/build-url'
import { Build } from '@/lib/types'
import { migrateIds } from '@/lib/build-url'
import { byId, find, skillBy } from './fixtures'

// Sample endgame build from 2026-09-28 (old link, no random options)
// ids from the 2026-09-09 dump (Caelum 900395): migrated by name, as in the UI
const sample = (): Build => migrateIds(JSON.parse(readFileSync(new URL('./fixtures-data/revenant-endgame-sample.json', import.meta.url), 'utf8')))
const sheetOf = (b: Build) => computeSheet(b, byId, skillBy('revenant/roaring-overslash'), rulesFor('Revenant'), {})

describe('random options', () => {
  it('old link without opts: same numbers measured on the engine before the change', () => {
    const s = sheetOf(sample())
    expect(s.stats).toEqual({ str: 94, agi: 5, vit: 94, int: 6, dex: 57, luk: 104 })
    expect(s.critRate.v).toBeCloseTo(106.9, 1) // 95.4 before summing the Ominous levels (2026-09-28)
    expect(s.maxHp!.v).toBe(16484)
    expect(s.leechPower.v).toBe(31)
  })

  it('armor with LUK +2 raises LUK by 2 and crit with it', () => {
    const b = sample()
    const before = sheetOf(b)
    b.slots.armor!.opts = [{ key: 'luk', v: 2 }, null, null]
    const after = sheetOf(b)
    expect(after.stats.luk - before.stats.luk).toBe(2)
    expect(after.critRate.v).toBeGreaterThan(before.critRate.v)
  })

  it('scythe: Critical Rate +10 with Baphomet Jr. gives +11.5 crit', () => {
    const b = sample()
    const before = sheetOf(b)
    b.slots.weapon!.opts = [null, { key: 'crit', v: 10 }, null, null]
    const after = sheetOf(b)
    expect(after.critRate.v - before.critRate.v).toBeCloseTo(11.5, 1)
  })

  it('garment: Leech Rate brings Leech Power 2% along', () => {
    const b = sample()
    const before = sheetOf(b)
    b.slots.garment!.opts = [null, null, { key: 'leech', v: 13 }]
    expect(sheetOf(b).leechPower.v - before.leechPower.v).toBe(2)
  })

  it('out-of-range value or option from another table: ignored and listed as not applied', () => {
    const b = sample()
    const before = sheetOf(b)
    b.slots.armor!.opts = [{ key: 'luk', v: 9 }, { key: 'crit', v: 5 }, null]
    const s = sheetOf(b)
    expect(s.stats.luk).toBe(before.stats.luk)
    expect(s.critRate.v).toBe(before.critRate.v)
    expect(s.skipped.filter((x) => x.itemName === byId.get(b.slots.armor!.id)!.name && /out of range|does not exist/i.test(x.why))).toHaveLength(2)
  })

  it('an option the engine does not model shows up as not applied', () => {
    const b = sample()
    b.slots.weapon!.opts = [null, null, null, { key: 'hp_drain_7', v: 7 }]
    expect(sheetOf(b).skipped.some((x) => /drain/i.test(x.why))).toBe(true)
  })

  it('right table per slot and weapon type', () => {
    expect(optionTableFor(find('Ominous Lament'), 'weapon')?.group).toBe('scythe')
    expect(optionTableFor(find('Genesis Bright Armor'), 'armor')).toBe(TABLES.armor)
    expect(optionTableFor(find('Heir to the King Armor'), 'shadowArmor')?.prov).toBe('reported')
    expect(optionTableFor(find('Caelum of the Sun'), 'upper')).toBeNull()
  })

  it('JSON round trip keeps the options; old link still imports', () => {
    const b = sample()
    b.slots.armor!.opts = [{ key: 'luk', v: 2 }, { key: 'hp_pct', v: 4 }, { key: 'mag_taken', v: 2 }]
    const back = buildFromJson(buildToJson(b))
    expect(isDecodeError(back)).toBe(false)
    expect((back as Build).slots.armor!.opts).toEqual(b.slots.armor!.opts)
    const old = decodeBuild(encodeBuild(sample()))
    expect(isDecodeError(old)).toBe(false)
  })
})

describe('items with fixed random options', () => {
  it('Blooming Rose Sandals applies MS/ASPD/VCT/ACD without a choice', () => {
    const b = sample()
    delete b.slots.shoes
    const without = sheetOf(b)
    b.slots.shoes = { id: find('Blooming Rose Sandals').id, refine: 6, cards: [] }
    const s = sheetOf(b)
    // the item text has neither VCT nor ACD: the difference comes only from the fixed random options
    expect((s.totals.pct.cast_time ?? 0) - (without.totals.pct.cast_time ?? 0)).toBe(-5)
    expect((s.totals.pct.after_cast_delay ?? 0) - (without.totals.pct.after_cast_delay ?? 0)).toBe(-5)
    expect(optionTableFor(find('Blooming Rose Sandals'), 'shoes')?.fixed).toBe(true)
  })
})

describe('items without random options', () => {
  it('NPC/quest/trade items have no table (Sage Ring, Caelum, Celestial Tome)', () => {
    expect(optionTableFor(find('Sage Ring'), 'accessory')).toBeNull()
    expect(optionTableFor(find('Celestial Tome'), 'manual')).toBeNull()
    expect(optionTableFor(find('Ring of Naght Sieger'), 'accessory2')).toBe(TABLES.accessory)
  })

  it('opts saved on an item without a table do not apply and show up as not applied', () => {
    const b = sample()
    const before = sheetOf(b)
    // in the sample build the Sage Ring is in accessory2
    b.slots.accessory2!.opts = [{ key: 'luk', v: 1 }]
    const s = sheetOf(b)
    expect(s.stats.luk).toBe(before.stats.luk)
    expect(s.skipped.some((x) => x.itemName === 'Sage Ring' && /no random option table/i.test(x.why))).toBe(true)
  })
})

describe('costume', () => {
  it('Living Reaper in the costume slot adds Critical Damage +5%', () => {
    const b = sample()
    const before = sheetOf(b)
    b.slots.costume = { id: find('Living Reaper').id, refine: 0, cards: [] }
    expect(find('Living Reaper').slots).toEqual(['costume'])
    expect(sheetOf(b).critDmg.v - before.critDmg.v).toBe(5)
  })
})

describe('shadow gear', () => {
  it('two lines: stat +1 and skill damage +5% (Roaring is in the skill pool)', () => {
    const t = optionTableFor(find('Heir to the King Armor'), 'shadowArmor')!
    expect(t.lines).toHaveLength(2)
    const b = sample()
    const before = sheetOf(b)
    b.slots.shadowArmor!.opts = [{ key: 'luk', v: 1 }, { key: 'skill:roaring overslash', v: 5 }]
    const s = sheetOf(b)
    expect(s.stats.luk - before.stats.luk).toBe(1)
    expect((s.totals.scoped.skill_dmg?.['roaring overslash'] ?? 0) - (before.totals.scoped.skill_dmg?.['roaring overslash'] ?? 0)).toBe(5)
  })
})

describe('headgear and Dream Enchant', () => {
  it('dropped headgear has 1 stat line; Caelum (trade) has none', () => {
    expect(optionTableFor(find('Flaming Weaver'), 'lower')?.lines).toHaveLength(1)
    expect(optionTableFor(find("Njord's Mark"), 'mid')?.group).toBe('headgear')
    expect(optionTableFor(find('Caelum of the Sun'), 'upper')).toBeNull()
  })

  it('Dream of Fate on Njord +10: LUK +5 and All Stats +1; with base LUK 99, HP/SP +2%', () => {
    const b = sample()
    const before = sheetOf(b)
    b.slots.mid!.dream = 'dream-of-fate'
    const s = sheetOf(b)
    expect(s.stats.luk - before.stats.luk).toBe(6)
    expect(s.stats.str - before.stats.str).toBe(1)
    b.stats.luk = 99
    const c99 = sheetOf(b)
    b.slots.mid!.dream = null
    const without99 = sheetOf(b)
    expect((c99.totals.pct.hp ?? 0) - (without99.totals.pct.hp ?? 0)).toBe(2)
  })

  it('the +10 bonus only with the item at +10', () => {
    const b = sample()
    b.slots.mid!.refine = 9
    const before = sheetOf(b)
    b.slots.mid!.dream = 'dream-of-fate'
    expect(sheetOf(b).stats.str - before.stats.str).toBe(0)
  })

  it('an item without "Dream Enchants available" ignores the enchant', () => {
    const b = sample()
    const before = sheetOf(b)
    b.slots.upper!.dream = 'dream-of-fate' // Caelum does not accept it
    const s = sheetOf(b)
    expect(s.stats.luk).toBe(before.stats.luk)
    expect(s.skipped.some((x) => /does not accept Dream/i.test(x.why))).toBe(true)
  })
})

describe('element read from gear', () => {
  it('Sarah Irine = Holy on the weapon; Genesis = Holy on the armor; Umbral = Dark', () => {
    const b = sample()
    b.slots.weapon!.cards = [find('Baroness of Sorrow Card').id, find('Sarah Irine Card').id]
    let s = sheetOf(b)
    expect(s.weaponElement).toEqual({ v: 'Holy', from: 'Sarah Irine Card' })
    expect(s.armorElement.v).toBe('Holy')
    b.slots.weapon!.cards = [find('Baroness of Sorrow Card').id, find('Umbral Knight Card').id]
    s = sheetOf(b)
    expect(s.weaponElement.v).toBe('Dark')
    delete b.slots.weapon
    delete b.slots.shadowGloves
    expect(sheetOf(b).weaponElement.v).toBe('Neutral')
  })
})
