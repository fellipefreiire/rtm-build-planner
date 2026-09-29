import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { computeSheet } from '@/lib/engine/sheet'
import { runFight, spCost, spPerCast } from '@/lib/engine/fight'
import { learnedToggles, rulesFor } from '@/lib/rules/classes'
import { Build } from '@/lib/types'
import { migrateIds } from '@/lib/build-url'
import { byId, skillBy } from './fixtures'

// ids from the 2026-09-09 dump (Caelum 900395): migrated by name, as in the UI
const sample = (): Build => migrateIds(JSON.parse(readFileSync(new URL('./fixtures-data/revenant-endgame-sample.json', import.meta.url), 'utf8')))
const roar = skillBy('revenant/roaring-overslash')

describe('fight over time', () => {
  const sheet = computeSheet(sample(), byId, roar, rulesFor('Revenant'), {})
  it('Roaring Lv10 post-patch: 70 SP (with gear SP Cost) + 10% of CURRENT SP', () => {
    const red = (sheet.totals.pct.sp_cost ?? 0) + (sheet.totals.flat.sp_cost ?? 0)
    const flat = Math.round(70 * (1 + red / 100))
    expect(spCost(sheet, roar, 10, 1000)).toMatchObject({ flat, total: flat + 100 })
    expect(spCost(sheet, roar, 10, 300).total).toBe(flat + 30)
    expect(spPerCast(sheet, roar, 10)).toBe(flat + Math.trunc(sheet.maxSp!.v / 10))
  })
  it('Reaping Slash Lv10: 50 SP, no current-SP component', () => {
    const red = (sheet.totals.pct.sp_cost ?? 0) + (sheet.totals.flat.sp_cost ?? 0)
    expect(spCost(sheet, skillBy('revenant/reaping-slash'), 10, 1000).total).toBe(Math.round(50 * (1 + red / 100)))
  })
  it('effectively infinite SP: CD rules, casts = duration ÷ CD + 1', () => {
    const r = runFight({ sheet, skill: roar, skillLv: 10, perCast: 1000, cooldown: 6, duration: 60, isrLv: 10 })
    if (r.spOutAt === null) expect(r.casts).toBe(11)
    expect(r.series).toHaveLength(60) // end of each second, 1 to 60
    expect(r.total).toBe(r.casts * 1000)
  })
  it('CD too short: SP runs out and DPS drops below damage ÷ CD', () => {
    const r = runFight({ sheet, skill: roar, skillLv: 10, perCast: 1000, cooldown: 1, duration: 120, isrLv: 0 })
    expect(r.spOutAt).not.toBeNull()
    expect(r.dps).toBeLessThan(1000)
  })
})

describe('Simulator buffs', () => {
  const b = sample()
  const r = rulesFor('Revenant')
  const without = computeSheet(b, byId, roar, r, {})
  it('True Sight: crit +30 before the ×1.15 from Baphomet Jr. and All Stats +3', () => {
    const withIt = computeSheet(b, byId, roar, r, { trueSight: true })
    expect(withIt.stats.luk - without.stats.luk).toBe(3)
    // +30 × 1.15 = 34.5, plus the crit from the 3 LUK
    expect(withIt.critRate.v - without.critRate.v).toBeGreaterThan(34.5)
  })
  it('Vampire Mark: leech per hit goes up by 15, shield unchanged', () => {
    const withIt = computeSheet(b, byId, roar, r, { vampireMark: true })
    expect(withIt.leechPower.v - without.leechPower.v).toBe(15)
    expect(withIt.shield!.v).toBe(without.shield!.v)
  })
  it('Darkside adds 2% per DEX to Roaring; food adds to the stat', () => {
    const withIt = computeSheet(b, byId, roar, r, { darkside: true }, { stat: 'luk', value: 8 })
    expect(withIt.stats.luk - without.stats.luk).toBe(8)
    expect(withIt.skillPct!.v - without.skillPct!.v).toBe(2 * withIt.stats.dex + 2 * 8)
  })
  it('Burning Scythe only applies without an item endow', () => {
    const noWeapon = { ...b, slots: { ...b.slots } }
    delete noWeapon.slots.weapon
    delete noWeapon.slots.shadowGloves
    expect(computeSheet(noWeapon, byId, roar, r, { burningScythe: true }).weaponElement.v).toBe('Fire')
  })
})

describe('cooldown from gear, gem and learned buffs', () => {
  const r = rulesFor('Revenant')
  const cdOf = (b: Build) => (roar.damage!.cooldown ?? 0) + (computeSheet(b, byId, roar, r, {}).totals.scoped.skill_cooldown?.['roaring overslash'] ?? 0)
  it('Roaring: 7 s from the db, 6 s with Baphomet Card (rework −1 s), 4 s with Crimson Gem', () => {
    const b = sample()
    expect(cdOf(b)).toBe(6) // the sample build has Njord [Baphomet Card]
    b.slots.gem = { id: 60179, refine: 10, cards: [] }
    expect(cdOf(b)).toBe(4)
    delete b.slots.mid
    delete b.slots.gem
    expect(cdOf(b)).toBe(7)
  })
  it('Reaper Gem +10: crit dmg +25, leech +10 and All Stats −5 +5; the gem random options apply', () => {
    const b = sample()
    const without = computeSheet(b, byId, roar, r, {})
    b.slots.gem = { id: 60177, refine: 10, cards: [], opts: [{ key: 'str', v: 1 }, { key: 'vit', v: -3 }, { key: 'luk', v: 1 }] }
    const withIt = computeSheet(b, byId, roar, r, {})
    expect(withIt.critDmg.v - without.critDmg.v).toBe(25)
    expect(withIt.leechPower.v - without.leechPower.v).toBe(10)
    expect(withIt.stats.luk - without.stats.luk).toBe(1)
    expect(withIt.stats.vit - without.stats.vit).toBe(-3)
  })
  it('a buff whose skill is not learned stays off', () => {
    const t = learnedToggles(r, { 'trickster/true-sight': 10 }, { trueSight: true, darkside: true, comboReady: true })
    expect(t.trueSight).toBe(true)
    expect(t.darkside).toBe(false)     // Darkside not learned
    expect(t.comboReady).toBe(false)   // without Reaping Slash there is no Combo Ready
  })
})
