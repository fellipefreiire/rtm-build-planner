import { describe, expect, it } from 'vitest'
import {
  aspd, baseCrit, baseFlee, baseHit, basePerfectDodge, emuJob, emuWeaponType,
  pointBudget, softDef, softMdef, statCostTotal, statusAtk, statusMatk,
} from '@/lib/rules/server'
import { computeSheet } from '@/lib/engine/sheet'
import { rulesFor } from '@/lib/rules/classes'
import { byId, find, referenceBuild, skillBy } from './fixtures'

// In-game status window on 2026-09-26.
// Totals with gear: STR 89 · AGI 0 · VIT 37 · INT 24 · DEX 76 · LUK 94.
// The base level was not reported; 136 is the only one that matches DEF, MDEF and ATK at the same time.
const s = { str: 89, agi: 0, vit: 37, int: 24, dex: 76, luk: 94 }
const LV = 136

describe('emulator base status against the in-game reading of 2026-09-26', () => {
  it('ATK 180 (+ 50)', () => expect(statusAtk(s, LV)).toBe(180))
  it('DEF 188 (+ 88)', () => expect(softDef(s, LV)).toBe(188))
  it('MDEF 95 (+ 34)', () => expect(softMdef(s, LV)).toBe(95))
  it('FLEE 274 (+ 37) = formula + 20 from Advanced Scythe Mastery Lv10', () => {
    expect(baseFlee(s, LV) + 20).toBe(274)
  })
  it('ASPD 144 with a scythe (Rebellion, Mace penalty 58)', () => {
    expect(emuJob('Revenant').job).toBe('Rebellion')
    const r = aspd('Revenant', s, 'Mace', { shield: false, offhandType: null, pct: 5, flat: 0, limit: 1 })
    expect(r.v).toBe(144)
  })
  it('HIT: the formula gives 481, the game showed 506 (+25 from the class)', () => {
    // The 25 also show up when naked (2026-09-27): Revenant bonus on RTM, in rules.innate.
    expect(baseHit(s, LV)).toBe(481)
  })
  it('base crit and PD follow 0.1 per LUK', () => {
    // the window shows the integer (55); combat uses the 0.1 unit
    expect(baseCrit({ ...s, luk: 104 })).toBe(55.6)
    expect(basePerfectDodge({ ...s, luk: 100, agi: 0 })).toBe(11)
  })
})

describe('sheet integration', () => {
  it('scythe becomes Mace in the emulator', () => {
    expect(emuWeaponType(find('Pesta'))).toBe('Mace')
  })

  it('Advanced Scythe Mastery adds to FLEE, crit and ATK only when learned', () => {
    const b = referenceBuild()
    const r = rulesFor('Revenant')
    const without = computeSheet(b, byId, skillBy(b.skillKey!), r, { darkside: true })
    b.skills['revenant/advanced-scythe-mastery'] = 10
    const withIt = computeSheet(b, byId, skillBy(b.skillKey!), r, { darkside: true })
    expect(withIt.flee.v - without.flee.v).toBe(20)
    expect(withIt.critRate.v - without.critRate.v).toBe(10)
    // the mastery does not show in the status window (the game showed 180 + 50 on 2026-09-26), but it counts in damage ATK
    expect(withIt.split.atk.gear - without.split.atk.gear).toBe(0)
    expect(withIt.atk.v - without.atk.v).toBeCloseTo(50 * (1 + (withIt.totals.pct.atk ?? 0) / 100), 6)
  })

})

// In-game status window on 2026-09-27. The numbers next to the stats were
// negative (90−1, 1−1, 33−5, 20−5, 80−2, 99+4). Level 137: everything below matches and
// the 440 points spent match the server table.
describe('in-game reading of 2026-09-27 (base 137)', () => {
  const t = { str: 89, agi: 0, vit: 28, int: 15, dex: 78, luk: 103 }
  const L = 137
  it('ATK 184', () => expect(statusAtk(t, L)).toBe(184))
  it('MATK 113', () => expect(statusMatk(t, L)).toBe(113))
  it('DEF 175', () => expect(softDef(t, L)).toBe(175))
  it('MDEF 80', () => expect(softMdef(t, L)).toBe(80))
  it('FLEE 277 = formula + 20 from Advanced Scythe Mastery', () => expect(baseFlee(t, L) + 20).toBe(277))
  it('440 points spent = budget at level 137', () => {
    const spent = statCostTotal(90) + statCostTotal(1) + statCostTotal(33) + statCostTotal(20)
      + statCostTotal(80) + statCostTotal(99)
    expect(spent).toBe(440)
    expect(pointBudget(L).v).toBe(440)
  })
})

// Set from a build URL shared on 2026-09-27 (Ominous Lament, Heir ×3 + White Abyss Shield…)
describe('set from the 2026-09-27 URL', () => {
  const b = referenceBuild()
  b.baseLv = 150
  b.stats = { str: 90, agi: 1, vit: 41, int: 20, dex: 80, luk: 99 }
  b.slots = {
    weapon: { id: 1538, refine: 10, cards: [13620, 13620] },
    lower: { id: 5926, refine: 10, cards: [13633, 13633] },
    garment: { id: 15439, refine: 10, cards: [13547, 4286] },
    upper: { id: 31213, refine: 10, cards: [4129, 13608] }, // Caelum of the Sun (900395 in the 2026-09-09 dump)
    mid: { id: 5932, refine: 10, cards: [4147] },
    accessory: { id: 16314, refine: 0, cards: [13743, 13743, 13743] },
    accessory2: { id: 15384, refine: 0, cards: [13743, 13743] },
    shoes: { id: 22071, refine: 10, cards: [4609] },
    armor: { id: 15443, refine: 10, cards: [13742] },
    shadowArmor: { id: 28072, refine: 10, cards: [] },
    shadowShoes: { id: 28074, refine: 0, cards: [] },
    shadowAcc: { id: 28075, refine: 10, cards: [] },
    shadowGloves: { id: 28167, refine: 10, cards: [] },
    pet: { id: 9057, refine: 0, cards: [] },
    manual: { id: 24236, refine: 0, cards: [] },
  }
  const s = computeSheet(b, byId, null, rulesFor('Revenant'), {})
  const sum = (k: string) => (s.totals.flat[k] ?? 0) + (s.totals.pct[k] ?? 0)

  it('Leech Power 21 = weapon 8 + pet 10 + Baphomet set 3', () => expect(s.leechPower.v).toBe(21))
  it('SP Cost −20: Heal/Hiding from Celestial Tome do not count', () => expect(sum('sp_cost')).toBe(-20))
  it('All Stats +3: Heir (3 of 4 pieces) and White Abyss (1 of 4) do not complete a set', () => {
    expect(s.totals.flat.all_stats).toBe(3)
    expect(s.skipped.some((k) => /heir to the king incomplete/i.test(k.why))).toBe(true)
  })
  it('Total Critical Rate +15% multiplies, does not add', () => {
    expect(s.totals.flat.crit_rate_mult ?? s.totals.pct.crit_rate_mult).toBe(15)
  })
  it('point cap at 150 = 447', () => expect(s.budget.cap).toBe(447))
})

// Measured naked in-game on 2026-09-27, base 137: no items, no gear bonuses.
// Everything left above the formulas comes from the class (rules.innate).
describe('naked reading of 2026-09-27 (base 137, no items)', () => {
  const b = referenceBuild()
  b.baseLv = 137
  b.stats = { str: 90, agi: 1, vit: 33, int: 20, dex: 80, luk: 99 }
  // the window's PD 26 = 11 from the formula + 5 from Reaper Shell + 10 from Scythe Mastery (applies without a scythe);
  // the 2026-09-28 reading, with no skill and only the pet, gave 6 = 1 + 5 and confirmed it
  b.slots = { pet: { id: find('Reaper Shell').id, refine: 0, cards: [] } }
  b.skills = { 'trickster/scythe-mastery': 10 }
  b.hpOverride = null
  const s = computeSheet(b, byId, null, rulesFor('Revenant'), {})
  it('HP 5105 = 3490 × 1.33 × 1.10', () => expect(s.maxHp?.v).toBe(5105))
  it('SP 1044 = 870 × 1.20', () => expect(s.maxSp?.v).toBe(1044))
  it('window: Atk 186 · Matk 123 · Def 185 · Mdef 91', () => {
    expect([s.split.atk.base, s.split.matk.base, s.split.def.base, s.split.mdef.base]).toEqual([186, 123, 185, 91])
  })
  it('window: Hit 516 · Flee 257 + 26 · Critical 52', () => {
    expect([s.split.hit.base, s.split.flee.base, s.split.flee.gear, s.split.crit.base]).toEqual([516, 257, 26, 52])
  })
})

describe('Ominous Lament: bonus per level of Ominous Presence OR Advanced Scythe Mastery', () => {
  const b = referenceBuild()
  b.slots = { weapon: { id: 1538, refine: 0, cards: [] } }
  const r = rulesFor('Revenant')
  const crit = (skills: Record<string, number>) => {
    b.skills = skills
    return computeSheet(b, byId, null, r, {}).totals.flat.crit_rate ?? 0
  }
  it('neither of the two: 0', () => expect(crit({})).toBe(0))
  it('one at 10: +10', () => expect(crit({ 'revenant/ominous-presence': 10 })).toBe(10))
  // measured 2026-09-28: crit 117 in the window and Roaring +89% / Reaping +40% in @battlestats only match when summing
  it('both at 10: +20 (adds the levels of both)', () => {
    expect(crit({ 'revenant/ominous-presence': 10, 'revenant/advanced-scythe-mastery': 10 })).toBe(20)
    expect(crit({ 'revenant/ominous-presence': 4, 'revenant/advanced-scythe-mastery': 7 })).toBe(11)
  })
})
