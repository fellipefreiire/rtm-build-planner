import { describe, expect, it } from 'vitest'
import { computeSheet } from '@/lib/engine/sheet'
import { rulesFor } from '@/lib/rules/classes'
import { emptyBuild } from '@/lib/build-url'
import { Build } from '@/lib/types'
import { byId, find } from './fixtures'

// Aggressive Orphan: piece All Stats +2 (the Pendant has Max HP/SP -1% per refine instead); set (header split in two lines in the dump) All Stats +4;
// "At set refine 9+ and again at 18+": Damage against all races +10%, Max HP/SP -10% — by the TOTAL refine of the set
const ao = (refine: number, pieces = 4): Build => {
  const b = emptyBuild('Dark Knight')
  const names = ['Aggressive Orphan Armor', 'Aggressive Orphan Gloves', 'Aggressive Orphan Boots', 'Aggressive Orphan Pendant'] as const
  const slots = ['shadowArmor', 'shadowGloves', 'shadowShoes', 'shadowAcc'] as const
  names.slice(0, pieces).forEach((n, i) => { b.slots[slots[i]] = { id: find(n).id, refine, cards: [] } })
  return b
}
const sheet = (b: Build) => computeSheet(b, byId, null, rulesFor('Dark Knight'), {})

describe('set bonuses written over two lines ("X Set" / "Bonus:")', () => {
  it('full set +10: All Stats 2×3 + 4 once; race damage twice (set refine 40 ≥ 9 and ≥ 18), on every race', () => {
    const s = sheet(ao(10))
    expect(s.totals.flat.all_stats).toBe(10)
    expect(s.totals.scoped.dmg_vs_race?.brute).toBe(20)
    // the dedupe key carries the scope: all 10 races, not only the first one
    expect(Object.keys(s.totals.scoped.dmg_vs_race ?? {})).toHaveLength(10)
  })
  it('set refine 12 (4 × +3): only the first threshold', () => {
    expect(sheet(ao(3)).totals.scoped.dmg_vs_race?.brute).toBe(10)
  })
  it('3 pieces: only the piece bonuses', () => {
    const s = sheet(ao(10, 3))
    expect(s.totals.flat.all_stats).toBe(6) // Armor, Gloves, Boots: 2 each
    expect(s.totals.scoped.dmg_vs_race?.brute ?? 0).toBe(0)
  })
})

// Unknown Tech: every set line is "per base stat" or "per total set refine" — no plain set bonus line, so the
// pieces were never registered as a set: LUK +1 per 5 base DEX applied once per piece (×4) and the penetration
// never applied. Piece bonuses "Critical +1, +1 per 5 base DEX." wrap mid-sentence in the dump.
const ut = (pieces = 4, refine = 9): Build => {
  const b = emptyBuild('Revenant')
  b.baseLv = 150
  b.stats = { str: 1, agi: 1, vit: 1, int: 1, dex: 90, luk: 1 }
  const names = ['Unknown Tech Armor', 'Unknown Tech Shield', 'Unknown Tech Boots', 'Unknown Tech Pendant'] as const
  const slots = ['shadowArmor', 'shadowGloves', 'shadowShoes', 'shadowAcc'] as const
  names.slice(0, pieces).forEach((n, i) => { b.slots[slots[i]] = { id: find(n).id, refine, cards: [] } })
  return b
}
const utSheet = (b: Build) => computeSheet(b, byId, null, rulesFor('Revenant'), {})

describe('Unknown Tech shadow set (base DEX 90, +9 each)', () => {
  it('full set: LUK +18 once, penetration +18 (36 total refine / 2); piece bonuses scale with base DEX', () => {
    const s = utSheet(ut())
    expect(s.stats.luk - s.statsBase.luk).toBe(18)
    expect(s.totals.flat.def_pen).toBe(18)
    expect(s.totals.flat.crit_rate).toBe(1 + 18) // Armor: +1, +1 per 5 base DEX
    expect(s.totals.pct.move_speed).toBe(1 + 9) // Boots: +1%, +1% per 10 base DEX
    expect(s.totals.pct.crit_dmg).toBe(1 + 9) // Shield
    expect(s.totals.flat.perfect_dodge).toBe(1 + 9) // Pendant
  })
  it('3 pieces: no set bonus (LUK, penetration), piece bonuses stay', () => {
    const s = utSheet(ut(3))
    expect(s.stats.luk - s.statsBase.luk).toBe(0)
    expect(s.totals.flat.def_pen ?? 0).toBe(0)
    expect(s.totals.flat.crit_rate).toBe(19)
  })
})
