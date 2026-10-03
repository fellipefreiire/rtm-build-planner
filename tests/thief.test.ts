// Thief (2026-10-02): class rules and Back Stab with a single dagger. In-game a lv35 Thief hit 978 on Orc Lady.
import { describe, expect, it } from 'vitest'
import { computeSheet } from '@/lib/engine/sheet'
import { simulate } from '@/lib/engine/simulate'
import { rulesFor } from '@/lib/rules/classes'
import { emptyBuild } from '@/lib/build-url'
import { Build, Skill } from '@/lib/types'
import { byId, find, mobBy, skills } from './fixtures'

const BS = skills.find((s) => s.key === 'thief/back-stab') as Skill
const thief = (weapon = 'The Dagger'): Build => {
  const b = emptyBuild('Thief')
  b.baseLv = 35
  b.jobLv = 43
  b.stats = { str: 49, agi: 49, vit: 1, int: 1, dex: 23, luk: 1 }
  b.slots.weapon = { id: find(weapon).id, refine: 0, cards: [] }
  b.skills = { 'thief/back-stab': 10, 'thief/improve-dodge': 2, 'thief/improve-defense': 10, 'thief/improve-wisdom': 10 }
  b.skillKey = BS.key
  return b
}
const sheet = (b: Build) => computeSheet(b, byId, BS, rulesFor(b.cls), {})

describe('Back Stab', () => {
  it('single dagger: 150 + 15%/level + 3% per AGI + 5% per Improve Dodge level', () => {
    expect(sheet(thief()).skillPct?.v).toBe(150 + 15 * 10 + 3 * 49 + 5 * 2)
  })

  it('a sword keeps the plain text: 150 + 5%/level + 1% per AGI', () => {
    expect(sheet(thief('Sword')).skillPct?.v).toBe(150 + 5 * 10 + 49)
  })

  it('"Backstab Damage +15%" (The Dagger) is a boost to the skill Back Stab', () => {
    const b = thief()
    const e = simulate(b, sheet(b), mobBy('Orc Lady'))
    expect(e.layers.find((l) => l.label === 'skillboost')?.mult).toBeCloseTo(1.15, 6)
  })
})

describe('Thief class rules', () => {
  it('HIT is the formula + 25, like Revenant (status window 2026-10-02: 305 at lv36, DEX 27, LUK 5, +14 from gear)', () => {
    const b = thief()
    b.baseLv = 36
    b.stats.dex = 27
    b.stats.luk = 5
    expect(sheet(b).hit.v).toBe(36 + 2 * 27 + 1 + 175 + 25)
  })

  it('Improve Defense and Improve Wisdom add HP and SP; Improve Dodge adds FLEE', () => {
    const b = thief(), naked = { ...thief(), skills: {} }
    // the HP ×1.10 of the class also multiplies the skill's HP
    expect(sheet(b).maxHp!.v - sheet(naked).maxHp!.v).toBeCloseTo(10 * 35 * 1.1, -1)
    expect(sheet(b).flee.v - sheet(naked).flee.v).toBe(4 * 2)
  })
})

describe('calibration: in-game Back Stab on Orc Lady (2026-10-02)', () => {
  // lv36/43 Thief, no buffs: status window STR 53 AGI 50 VIT 3 INT 3 DEX 27 LUK 5, ATK 75 + 22, HIT 305; Back Stab Lv10 hit 1000
  const b = (): Build => ({
    ...emptyBuild('Thief'), baseLv: 36, jobLv: 43, skillKey: BS.key,
    stats: { str: 49, agi: 49, vit: 1, int: 1, dex: 25, luk: 1 },
    skills: { 'thief/back-stab': 10, 'thief/improve-dodge': 2, 'thief/improve-defense': 10, 'thief/improve-wisdom': 10, 'thief/increase-sp-recovery': 10 },
    slots: {"weapon":{"id":13074,"refine":0,"cards":[],"opts":[{"key":"atk_pct","v":3},{"key":"hit","v":14},{"key":"melee","v":2},{"key":"crit_dmg_10","v":10}]},"garment":{"id":16131,"refine":0,"cards":[4285],"opts":[{"key":"str","v":1},{"key":"flee","v":7},{"key":"hp_regen","v":17}]},"upper":{"id":5286,"refine":0,"cards":[]},"accessory":{"id":32242,"refine":0,"cards":[13688],"opts":[{"key":"luk","v":1}]},"accessory2":{"id":32242,"refine":0,"cards":[4069],"opts":[{"key":"atk_pct","v":1}]},"shoes":{"id":2466,"refine":0,"cards":[],"opts":[{"key":"str","v":1},{"key":"aspd_pct","v":8},{"key":"acd","v":7}]},"armor":{"id":2313,"refine":0,"cards":[],"opts":[{"key":"vit","v":1},{"key":"hp_pct","v":2},{"key":"heal_recv","v":8}]},"lower":{"id":5536,"refine":0,"cards":[]},"rune":{"id":24108,"refine":0,"cards":[]},"shadowArmor":{"id":24258,"refine":0,"cards":[],"opts":[{"key":"luk","v":1}]},"shadowGloves":{"id":24259,"refine":0,"cards":[],"opts":[{"key":"str","v":1}]},"shadowShoes":{"id":24260,"refine":0,"cards":[],"opts":[{"key":"int","v":1}]},"shadowAcc":{"id":24261,"refine":0,"cards":[],"opts":[{"key":"dex","v":1}]}},
  } as Build)

  it('status window matches', () => {
    const s = sheet(b())
    expect(s.stats).toEqual({ str: 53, agi: 50, vit: 3, int: 3, dex: 27, luk: 5 })
    expect(s.split.atk.base).toBe(75)
    expect(s.split.atk.gear).toBe(22)
    expect(s.hit.v).toBe(305)
  })

  it('1000 in-game, within 2%: soft DEF (Lv 47 + VIT 25/2 = 59) and dagger vs Medium 90%', () => {
    const e = simulate(b(), sheet(b()), mobBy('Orc Lady'))
    expect(e.layers.find((l) => l.label === 'target soft DEF')?.why).toContain('−59')
    expect(e.layers.some((l) => l.label === 'weapon size penalty')).toBe(true)
    expect(Math.abs(e.index / 1000 - 1)).toBeLessThan(0.02)
  })
})
