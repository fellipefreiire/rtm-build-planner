import { describe, expect, it } from 'vitest'
import { computeSheet } from '@/lib/engine/sheet'
import { incoming, SKILL_CALC } from '@/lib/engine/incoming'
import { rulesFor } from '@/lib/rules/classes'
import { elementMultiplier } from '@/lib/rules/server'
import { emptyBuild } from '@/lib/build-url'
import mobSkills from '@/data/mob-skills.json'
import { byId, mobBy, referenceBuild, skillBy } from './fixtures'

// a naked Revenant: no gear, so no resistances; the numbers below are hand-computed from the emulator formulas
const naked = () => {
  const b = emptyBuild('Revenant')
  b.baseLv = 150
  b.hpOverride = 10000
  b.armorElement = 'Neutral'
  const sheet = computeSheet(b, byId, null, rulesFor('Revenant'), {})
  return { b, sheet }
}

describe('incoming damage', () => {
  it('Ktullanux Tetra Vortex: (INT + Lv + Attack2 × 0.7–1.3) × ratio → MDEF → element', () => {
    const { b, sheet } = naked()
    const mob = mobBy('Ktullanux')
    const row = incoming(b, sheet, mob).rows.find((r) => r.skill === 'WL_TETRAVORTEX_WATER')!
    const [int, lv] = [mob.stats[3], mob.lv]
    const ratio = 40 * 5 + 4 * int // battle.cpp:6962
    const avg = (int + lv + Math.floor(1250 * 0.7) + int + lv + Math.floor(1250 * 1.3)) / 2
    const mdef = sheet.mdef.v
    const soft = sheet.split.mdef.base!
    const afterMdef = (avg * ratio / 100) * (1000 + mdef) / (1000 + 10 * mdef) - soft
    const expected = afterMdef * elementMultiplier('Water', 'Neutral', 1)
    expect(row.kind).toBe('magical')
    expect(row.hitChance).toBeNull() // magic never misses
    expect(row.final).toBeCloseTo(expected, 3)
    expect(row.pctHp).toBeCloseTo(expected / 100, 3)
  })

  it('normal attack: (STR + Lv) + ATK × 0.8–1.2 → DEF → element Neutral', () => {
    const { b, sheet } = naked()
    const mob = mobBy('Ktullanux')
    const row = incoming(b, sheet, mob).rows[0]
    const batk = mob.stats[0] + mob.lv
    const avg = (batk + Math.floor(mob.atk * 0.8) + batk + Math.floor(mob.atk * 1.2)) / 2
    const def = sheet.def.v
    const expected = avg * (4000 + def) / (4000 + 10 * def) - sheet.split.def.base!
    expect(row.key).toBe('auto')
    expect(row.element).toBe('Neutral')
    expect(row.final).toBeCloseTo(expected, 3)
  })

  it('damage never drops below 1 per hit (Poring vs a tank)', () => {
    const b = referenceBuild()
    const sheet = computeSheet(b, byId, skillBy(b.skillKey!), rulesFor('Revenant'), {})
    const rows = incoming(b, sheet, mobBy('Poring')).rows
    expect(rows[0].final).toBeGreaterThanOrEqual(1)
  })

  it('Earthquake splits among the targets in the area', () => {
    const { b, sheet } = naked()
    const one = incoming(b, sheet, mobBy('Ktullanux'), { roll: 'avg', targets: 1, near: true }).rows.find((r) => r.skill === 'NPC_EARTHQUAKE')!
    const four = incoming(b, sheet, mobBy('Ktullanux'), { roll: 'avg', targets: 4, near: true }).rows.find((r) => r.skill === 'NPC_EARTHQUAKE')!
    // IgnoreDefense: no MDEF step, so the split is exactly linear
    expect(four.final).toBeCloseTo(one.final / 4, 3)
  })

  it('reused ids are not trusted: Odin Avatar has no emulator skills', () => {
    const { b, sheet } = naked()
    const r = incoming(b, sheet, mobBy('Odin Avatar'))
    expect(r.source).toBe('none')
    expect(r.rows).toHaveLength(1)
  })

  it('every damaging skill a RTM mob casts has a transcribed formula', () => {
    const data = mobSkills as unknown as { skills: Record<string, { type: string | null; flags?: string[] }> }
    const missing = Object.entries(data.skills)
      .filter(([, s]) => s.type && ['Weapon', 'Magic', 'Misc'].includes(s.type) && !(s.flags ?? []).includes('NoDamage'))
      .map(([k]) => k)
      .filter((k) => !SKILL_CALC[k])
    expect(missing).toEqual([])
  })

  it('min ≤ final ≤ max, and the roll changes the number', () => {
    const { b, sheet } = naked()
    const mob = mobBy('Ktullanux')
    for (const r of incoming(b, sheet, mob).rows) {
      expect(r.min).toBeLessThanOrEqual(r.final + 1e-9)
      expect(r.final).toBeLessThanOrEqual(r.max + 1e-9)
    }
    const lo = incoming(b, sheet, mob, { roll: 'min', targets: 1, near: true }).rows[0].final
    const hi = incoming(b, sheet, mob, { roll: 'max', targets: 1, near: true }).rows[0].final
    expect(hi).toBeGreaterThan(lo)
  })
})
