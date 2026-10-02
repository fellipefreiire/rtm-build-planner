// Phantom Thief rules (Master Thief Arts) and the Edge "Double Effect" at +7 — 2026-10-02.
import { describe, expect, it } from 'vitest'
import { computeSheet } from '@/lib/engine/sheet'
import { learnedToggles, rulesFor } from '@/lib/rules/classes'
import { emptyBuild } from '@/lib/build-url'
import { Build, SlotId } from '@/lib/types'
import { byId, find, skillBy } from './fixtures'

const DELTA = 'phantom-thief/delta-skyfall'

function build(cls: string, gear: [SlotId, string, number][], skills: Record<string, number> = {}): Build {
  const b = emptyBuild(cls)
  b.baseLv = 100
  b.stats = { str: 50, agi: 90, vit: 1, int: 1, dex: 50, luk: 1 }
  b.skillKey = DELTA
  b.skills = { [DELTA]: 10, ...skills }
  for (const [slot, name, refine] of gear) b.slots[slot] = { id: find(name).id, refine, cards: [] }
  return b
}
const sheet = (b: Build) => computeSheet(b, byId, skillBy(DELTA), rulesFor(b.cls), {})

describe('Edge: "If Refine is +7 or higher: Double Effect"', () => {
  it('+6 gives Delta Skyfall +20%, +7 gives +40%', () => {
    expect(sheet(build('Phantom Thief', [['weapon', 'Edge', 6]])).totals.scoped.skill_dmg?.['delta skyfall']).toBe(20)
    expect(sheet(build('Phantom Thief', [['weapon', 'Edge', 7]])).totals.scoped.skill_dmg?.['delta skyfall']).toBe(40)
  })
})

describe('Master Thief Arts: Shadow sets', () => {
  it('one piece activates the set bonus on Phantom Thief, not on other classes', () => {
    const gear: [SlotId, string, number][] = [['shadowShoes', 'Tower Shoes', 0]]
    expect(sheet(build('Phantom Thief', gear)).stats.str).toBe(50 + 3)
    expect(sheet(build('Revenant', gear)).stats.str).toBe(50)
  })
  it('Shadow pieces count +3 refine for their bonuses', () => {
    // Tower Shoes: ATK +1% per refine, plus ATK +3% from the set
    expect(sheet(build('Phantom Thief', [['shadowShoes', 'Tower Shoes', 5]])).totals.pct.atk).toBe(8 + 3)
    expect(sheet(build('Revenant', [['shadowShoes', 'Tower Shoes', 5]])).totals.pct.atk ?? 0).toBe(5)
  })
  it('Touch sets still need every piece', () => {
    const s = sheet(build('Phantom Thief', [['shadowArmor', 'Bulwark Pact Armor', 0]]))
    expect(s.skipped.some((x) => /set bulwark pact incomplete/i.test(x.why))).toBe(true)
  })
})

describe('Thief line passives', () => {
  it('Blade Mastery: 3 ATK per level with a sword, nothing with a bow', () => {
    const sword = sheet(build('Phantom Thief', [['weapon', 'Edge', 0]], { 'unchained-thief/blade-mastery': 10 }))
    expect(sword.atk.from.join(' ')).toContain('mastery 30')
    const bow = build('Phantom Thief', [], { 'unchained-thief/blade-mastery': 10 })
    bow.slots.weapon = { id: find('Bow').id, refine: 0, cards: [] }
    expect(sheet(bow).atk.from.join(' ')).toContain('mastery 0')
  })
})

import { simulate } from '@/lib/engine/simulate'
import { mobs } from './fixtures'

const mob = (n: string) => mobs.find((m) => m.name === n)!
const sim = (b: Build, toggles: Record<string, boolean>, skillKey = DELTA) => {
  const s = computeSheet({ ...b, skillKey }, byId, skillBy(skillKey), rulesFor(b.cls), toggles)
  return { s, enc: (n: string) => simulate({ ...b, skillKey }, s, mob(n)) }
}
const layer = (e: ReturnType<typeof simulate>, l: string) => e.layers.find((x) => x.label.startsWith(l))!

describe('2026-10-02: server damage layers', () => {
  it('race/size/element/class pools multiply by category (battle_calc_cardfix)', () => {
    // King's Knight Armor +0: vs Large +5% · False God Pendant +0: vs non-boss +5% (sets with 1 piece on Phantom Thief)
    const b = build('Phantom Thief', [['weapon', 'Edge', 7], ['shadowGloves', "King's Noble Gloves", 0], ['shadowAcc', 'False God Pendant', 0]])
    const p = layer(sim(b, {}).enc('Moon Guardian'), 'race/size')
    expect(p.mult).toBeCloseTo((1 + 0.08) * (1 + 0.08), 4)   // size 3+5 = 8% × non-boss 3+5 = 8%
  })
  it('Seven Winds picks the best element vs the target', () => {
    const b = build('Phantom Thief', [['weapon', 'Edge', 7]], { 'phantom-thief/seven-winds': 7 })
    const { enc } = sim(b, { sevenWinds: true })
    expect(layer(enc('Moon Guardian'), 'weapon element').why).toMatch(/^Holy \(Seven Winds Lv7\)/)
    expect(layer(enc('Doomfist'), 'weapon element').why).toMatch(/^Water \(Seven Winds Lv3\)/)
    expect(layer(enc('Meteor Golem'), 'weapon element').why).toMatch(/^Wind \(Seven Winds Lv2\)/)
    expect(layer(enc('Doomfist'), 'weapon element').mult).toBe(1.25)
  })
  it('Seven Winds at a picked level uses that element, even if another hits harder', () => {
    const b = build('Phantom Thief', [['weapon', 'Edge', 7]], { 'phantom-thief/seven-winds': 7 })
    const toggles = learnedToggles(rulesFor('Phantom Thief'), b.skills, { sevenWinds: true }, { sevenWinds: 4 })
    const w = layer(sim(b, toggles).enc('Doomfist'), 'weapon element')
    expect(w.why).toMatch(/^Fire \(Seven Winds Lv4\)/)
    expect(w.mult).toBeLessThan(1)   // Fire vs Fire 1
  })
  it('Seven Winds only offers the learned levels', () => {
    const b = build('Phantom Thief', [['weapon', 'Edge', 7]], { 'phantom-thief/seven-winds': 3 })
    expect(layer(sim(b, { sevenWinds: true }).enc('Moon Guardian'), 'weapon element').why).not.toMatch(/Holy/)
  })
  it("Soul Destroyer adds 75 + 5 × level × INT after the multipliers", () => {
    const b = build('Phantom Thief', [['weapon', 'Edge', 7]], { 'phantom-thief/soul-destroyer': 10 })
    const { s } = sim(b, {}, 'phantom-thief/soul-destroyer')
    expect(s.skillFlat).toBe(75 + 5 * 10 * s.stats.int)
  })
  it('a skill that needs a Katar warns with a sword', () => {
    const b = build('Phantom Thief', [['weapon', 'Edge', 7]], { 'phantom-thief/sonic-blow': 10 })
    expect(sim(b, {}, 'phantom-thief/sonic-blow').s.weaponWarning).toMatch(/katar/i)
  })
})

describe('Maiden of Time set (2026-10-02)', () => {
  it('"Total Flee +N%" multiplies FLEE; the set adds ATK +1 per 20 FLEE', () => {
    const bare = build('Phantom Thief', [['armor', 'Power Dragon Plate', 0], ['garment', 'Volcano Manteau', 0], ['shoes', 'Temporal AGI Boots', 0]])
    const withSet = JSON.parse(JSON.stringify(bare)) as Build
    withSet.slots.armor!.cards = [find('Maiden of Past Card').id]
    withSet.slots.garment!.cards = [find('Maiden of Present Card').id]
    withSet.slots.shoes!.cards = [find('Maiden of Future Card').id]
    const a = sheet(bare), b = sheet(withSet)
    expect(b.flee.v).toBe(Math.floor(a.flee.v * 1.16))   // +6% +5% +5%
    expect(b.atk.from.join(' ')).toContain(`${Math.floor(b.flee.v / 20)} from FLEE`)
  })
})
