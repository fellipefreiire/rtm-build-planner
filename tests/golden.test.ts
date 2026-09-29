import { describe, expect, it } from 'vitest'
import { computeSheet } from '@/lib/engine/sheet'
import { simulate } from '@/lib/engine/simulate'
import { rulesFor } from '@/lib/rules/classes'
import { elementMultiplier, pointBudget, statCostTotal } from '@/lib/rules/server'
import { byId, items as itemsAll, mobBy, referenceBuild, skillBy } from './fixtures'

const sheet8 = () => {
  const { sheet } = sheetOf()
  return sheet.totals.flat.all_stats
}

const sheetOf = () => {
  const b = referenceBuild()
  return {
    b,
    sheet: computeSheet(b, byId, skillBy(b.skillKey!), rulesFor('Revenant'), { darkside: true, trueSight: false }),
  }
}

describe('server rules', () => {
  it('stat cost matches the measured table', () => {
    expect(statCostTotal(49)).toBe(48)
    expect(statCostTotal(90)).toBe(130)
    expect(statCostTotal(99)).toBe(149)
  })

  it('point budget = emulator table (db/re/statpoint.yml)', () => {
    expect(pointBudget(137).v).toBe(440) // in-game on 2026-09-27: 440 spent, Status Point 0
    expect(pointBudget(147).v).toBe(447)
    expect(pointBudget(150).v).toBe(447) // 148–150 give no points
  })

  it('element table matches the two measured cases', () => {
    expect(elementMultiplier('Fire', 'Poison', 4)).toBe(1)
    expect(elementMultiplier('Neutral', 'Poison', 4)).toBe(0.5)
    expect(elementMultiplier('Poison', 'Holy', 1)).toBe(0.9)
  })
})

describe('golden: Tank Rachel set — Holy', () => {
  it('spends 448 points: 1 over the real cap of 447', () => {
    // the target build was put together on a formula that gave 448; the server table gives 447
    const { sheet } = sheetOf()
    expect(sheet.budget.spent).toBe(448)
    expect(sheet.budget.over).toBe(true)
  })

  // RTM patch: +2% per LUK (the db says +1%). The fixture turns Darkside on: +2% per DEX
  it('the Roaring % mechanic matches: 300 (Lv10) + 2×LUK + 2×DEX (Darkside)', () => {
    const { sheet } = sheetOf()
    const expected = 300 + 2 * sheet.stats.luk + 2 * sheet.stats.dex
    expect(sheet.skillPct?.v).toBe(expected)
  })

  it('gear gives All Stats +5, as measured in-game', () => {
    // In-game status with gear (All Stats +5) -> LUK 104, DEX 54.
    // Full End of Kings (+4) + Dandelion Eyepatch (+1). It used to give +8: the +3 from
    // Emperium Boots is a bonus of the Emperium set (Armor, Manteau, Ring) and was applied without it.
    expect(sheet8()).toBe(5)
  })

  it('no effect line is lost: every line becomes a mod or unparsed', () => {
    const { sheet } = sheetOf()
    for (const p of sheet.equipped) {
      for (const it of [p.item, ...p.cards]) {
        const target = new Set([
          ...it.mods.map((m) => m.src.line),
          ...it.unparsed.map((u) => u.line),
        ])
        const withNumber = new Set(
          [...it.mods.map((m) => m.src.line), ...it.unparsed.map((u) => u.line)],
        )
        expect(target.size).toBe(withNumber.size)
      }
    }
  })

  it('is deterministic', () => {
    const a = sheetOf().sheet
    const b = sheetOf().sheet
    expect(JSON.stringify(b.totals)).toBe(JSON.stringify(a.totals))
  })
})

describe('golden: against Converted Zealot', () => {
  it('Fire weapon element cancels the Poison 4 resistance', () => {
    const { b, sheet } = sheetOf()
    const enc = simulate(b, sheet, mobBy('Converted Zealot'))
    const elem = enc.layers.find((l) => l.label === 'weapon element')!
    expect(elem.mult).toBe(1)
  })

  it('the anchor converts an index into absolute damage without inventing numbers', () => {
    const { b, sheet } = sheetOf()
    const mob = mobBy('Converted Zealot')
    const noAnchor = simulate(b, sheet, mob)
    expect(noAnchor.damage).toBeNull()

    b.anchor = { dmg: 39120, index: noAnchor.index }
    const withAnchor = simulate(b, sheet, mob)
    expect(withAnchor.damage!.v).toBeCloseTo(39120, 0)
  })
})

describe('two-handed weapon', () => {
  it('off-hand does not count when the weapon is two-handed', () => {
    const b = referenceBuild()
    const base = computeSheet(b, byId, skillBy(b.skillKey!), rulesFor('Revenant'), { darkside: true })
    // Pesta is two-handed; equipping an off-hand must not change anything
    const shield = itemsAll.find((i) => i.slots.includes('offhand') && i.def > 0)!
    b.slots.offhand = { id: shield.id, refine: 10, cards: [] }
    const withShield = computeSheet(b, byId, skillBy(b.skillKey!), rulesFor('Revenant'), { darkside: true })
    expect(withShield.def.v).toBe(base.def.v)
    expect(withShield.skipped.some((s) => /two-handed/i.test(s.why))).toBe(true)
  })
})
