// Trickster (2026-10-01): class rules shared with Revenant, Dark Beak's element and Dark Messenger.
import { describe, expect, it } from 'vitest'
import { computeSheet } from '@/lib/engine/sheet'
import { runRotation } from '@/lib/engine/rotation'
import { simulate } from '@/lib/engine/simulate'
import { rulesFor, learnedToggles } from '@/lib/rules/classes'
import { rotationRulesFor } from '@/lib/rules/rotation'
import { emptyBuild } from '@/lib/build-url'
import { Build, Skill } from '@/lib/types'
import { byId, find, mobBy, skills } from './fixtures'

const skillMap = new Map<string, Skill>(skills.map((s) => [s.key, s]))
const SR = 'trickster/scythe-reap', DM = 'trickster/dark-messenger', SM = 'trickster/scythe-mastery'

const trickster = (weapon: string | null = 'Dark Beak'): Build => {
  const b = emptyBuild('Trickster')
  b.baseLv = 99
  b.jobLv = 50
  b.stats = { str: 60, agi: 1, vit: 50, int: 30, dex: 40, luk: 70 }
  if (weapon) b.slots.weapon = { id: find(weapon).id, refine: 0, cards: [] }
  return b
}
const sheet = (b: Build, toggles: Record<string, boolean> = {}) => computeSheet(b, byId, null, rulesFor(b.cls), toggles)

describe('Dark Beak', () => {
  it('"Dark Weapon" is the weapon element; the ±% lines below it are the element table, not bonuses', () => {
    const it = find('Dark Beak')
    expect(it.endow).toBe('Dark')
    expect(it.mods.some((m) => m.key === 'dmg_vs_element')).toBe(false)
    expect(sheet(trickster()).weaponElement.v).toBe('Dark')
  })
})

describe('Trickster class rules', () => {
  it('same HP and HIT as a Revenant with the same stats (class bonus ×1.10 HP, +25 HIT)', () => {
    const t = sheet(trickster(null))
    const r = sheet({ ...trickster(null), cls: 'Revenant' })
    expect(t.maxHp?.v).toBe(r.maxHp?.v)
    expect(t.split.hit.base).toBe(r.split.hit.base)
  })

  it('Scythe Mastery 10: +20 ATK and +10 crit with a scythe, +10 PD always', () => {
    const b0 = trickster(), b10 = trickster()
    b10.skills[SM] = 10
    const a = sheet(b0), b = sheet(b10)
    expect(b.critRate.v - a.critRate.v).toBe(10)
    expect(b.perfectDodge.v - a.perfectDodge.v).toBeCloseTo(10, 6)
    const n0 = trickster(null), n10 = trickster(null)
    n10.skills[SM] = 10
    expect(sheet(n10).critRate.v - sheet(n0).critRate.v).toBe(0)
    expect(sheet(n10).perfectDodge.v - sheet(n0).perfectDodge.v).toBeCloseTo(10, 6)
  })

  it('True Sight and Burning Scythe show up once learned; True Sight scales per level', () => {
    const rules = rulesFor('Trickster')
    const b = trickster(null)
    b.skills['trickster/true-sight'] = 5
    b.skills['trickster/burning-scythe'] = 1
    const t = learnedToggles(rules, b.skills, { trueSight: true, burningScythe: true })
    expect(t).toEqual({ trueSight: true, burningScythe: true })
    const on = sheet(b, t)
    expect(on.weaponElement.v).toBe('Fire')
    // Lv10 against Lv5: +15 crit and +15 HIT (the +3 All Stats is the same on both)
    const b10 = { ...b, skills: { ...b.skills, 'trickster/true-sight': 10 } }
    const on10 = sheet(b10, t)
    expect(on10.critRate.v - on.critRate.v).toBe(15)
    expect(on10.hit.v - on.hit.v).toBe(15)
  })
})

describe('Dark Messenger', () => {
  it('is a Trickster damage skill: MATK, 25% + 1% per STR per hit, 10% extra current SP', () => {
    const s = skillMap.get(DM)!
    expect(s.damage).toMatchObject({ base: 25, coefPerLevel: 0, perStat: [{ stat: 'str', pct: 1 }], magic: true, spPct: 10 })
  })

  it('learned, it is in the rotation palette; hits = level, ×1.5 in Combo Ready', () => {
    const b = trickster()
    b.skills[SM] = 1; b.skills[SR] = 1; b.skills['trickster/dark-message'] = 1; b.skills[DM] = 7
    expect(rotationRulesFor('Trickster').palette(b, [])).toContain(DM)
    const r = runRotation({ build: b, byId, steps: [DM, SR, DM], skills: skillMap, rules: rulesFor('Trickster'), toggles: {}, food: null, mob: mobBy('Average Dummy'), k: null })
    const [cold, , combo] = r.events
    expect(cold.hits).toBe(7)
    expect(combo.comboReady).toBe(true)
    expect(combo.damage / cold.damage).toBeCloseTo(1.5, 1)
  })
})

describe('Magic damage from gear', () => {
  it('Arch Brooch "Magic Damage +7%" and "Dark Magic DMG" raise Dark Messenger; physical skills untouched', () => {
    const dmg = (key: string, acc: string | null) => {
      const b = trickster()
      b.skillKey = key; b.skillLv = 5
      if (acc) b.slots.accessory = { id: find(acc).id, refine: 0, cards: [] }
      return simulate(b, computeSheet(b, byId, skillMap.get(key)!, rulesFor('Trickster'), {}), mobBy('Average Dummy')).index
    }
    expect(find('Arch Brooch').mods[0]).toMatchObject({ key: 'magic_dmg', value: 7 })
    expect(dmg(DM, 'Arch Brooch') / dmg(DM, null)).toBeCloseTo(1.07, 6)
    expect(dmg(SR, 'Arch Brooch')).toBeCloseTo(dmg(SR, null), 6)
    // Fallen Angel Muffler: Dark Magic DMG +15%, and Dark Beak makes Dark Messenger Dark
    expect(find('Fallen Angel Muffler').mods.some((m) => m.key === 'magic_dmg' && m.scope?.element === 'dark')).toBe(true)
  })
})

describe('Multi-position headgear', () => {
  it('Crown of Deceit (upper + mid) in mid makes the upper piece not count', () => {
    const b = trickster()
    b.slots.upper = { id: find('Forest Guide').id, refine: 0, cards: [] }
    const without = sheet(b)
    b.slots.mid = { id: find('Crown of Deceit').id, refine: 0, cards: [] }
    const s = sheet(b)
    expect(s.skipped.map((x) => x.itemName)).toContain('Forest Guide')
    expect(s.skipped.map((x) => x.itemName)).not.toContain('Crown of Deceit')
    expect(s.matk.v).not.toBe(without.matk.v)
  })
})
