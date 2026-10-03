// Trickster (2026-10-01): class rules shared with Revenant, Dark Beak's element and Dark Messenger.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
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
  // 2026-10-03: the text says 25% and "1.5x when combo ready"; Patch Notes 4 and the code say base 20 and combo +30 + 1%/STR
  it('is a Trickster damage skill: MATK, 20% + 1% per STR per hit (Patch Notes 4), 10% extra current SP', () => {
    const s = skillMap.get(DM)!
    expect(s.damage).toMatchObject({ base: 20, coefPerLevel: 0, perStat: [{ stat: 'str', pct: 1 }], magic: true, spPct: 10 })
  })

  it('learned, it is in the rotation palette; hits = level, Combo Ready adds +30% + 1% per STR (not ×1.5)', () => {
    const b = trickster()
    b.skills[SM] = 1; b.skills[SR] = 1; b.skills['trickster/dark-message'] = 1; b.skills[DM] = 7
    expect(rotationRulesFor('Trickster').palette(b, [])).toContain(DM)
    const r = runRotation({ build: b, byId, steps: [DM, SR, DM], skills: skillMap, rules: rulesFor('Trickster'), toggles: {}, food: null, mob: mobBy('Average Dummy'), k: null })
    const [cold, , combo] = r.events
    expect(cold.hits).toBe(7)
    expect(combo.comboReady).toBe(true)
    // STR 60: (50 + 2 × 60) / (20 + 60)
    expect(combo.damage / cold.damage).toBeCloseTo(170 / 80, 6)
  })

  it('Revenant set of 2026-10-03 (in-game 14380 with Burning Scythe): skill % 198, King\'s Wizard + Follower Ring vs size × Fire magic', () => {
    const b = JSON.parse(readFileSync(new URL('./fixtures-data/revenant-dark-messenger-2026-10-03.json', import.meta.url), 'utf8')) as Build
    const rules = rulesFor('Revenant')
    const tg = learnedToggles(rules, b.skills, { burningScythe: true, darkside: true, comboReady: true })
    const r = runRotation({ build: b, byId, steps: [DM, 'trickster/dark-message', DM], skills: skillMap, rules, toggles: tg, food: null, mob: mobBy('Average Dummy'), k: null })
    const sh = computeSheet({ ...b, skillKey: DM }, byId, skillMap.get(DM)!, rules, tg)
    const layers = simulate({ ...b, skillKey: DM }, sh, mobBy('Average Dummy')).layers
    const mult = (label: string) => layers.find((l) => l.label === label)?.mult
    expect(sh.skillPct?.v).toBe(198)                 // 50 + 2 × STR 74; Darkside (physical only) does not add
    expect(mult('magic damage')).toBeCloseTo(1.28, 6) // Fire 10 + 10 + 2, Burning Scythe +6 [measured]
    expect(mult('magic vs size')).toBeCloseTo(1.23, 6) // Follower Ring 5 × 2, King's Wizard gloves 5 + pendant 3 + set 5
    expect(r.events[2].comboReady).toBe(true)
    // in-game 13280 and 14380 (MATK roll ±6%); the JSON has LUK 1 below the print (MATK 167 instead of 168)
    expect(r.events[2].damage).toBeCloseTo(13460, -1)
  })

  it('in-game 2026-10-03: Fire Magic DMG counts without Burning Scythe; all 4 cases within the MATK roll', () => {
    const b = JSON.parse(readFileSync(new URL('./fixtures-data/revenant-dark-messenger-2026-10-03.json', import.meta.url), 'utf8')) as Build
    b.stats.luk = 69   // status window: LUK 68 + 4
    const rules = rulesFor('Revenant')
    const seen: Record<string, number> = { 'false|false': 6310, 'true|false': 12580, 'false|true': 6490, 'true|true': 13280 }
    for (const bs of [false, true]) {
      const tg = learnedToggles(rules, b.skills, { burningScythe: bs, darkside: true, comboReady: true })
      const r = runRotation({ build: b, byId, steps: [DM, 'trickster/dark-message', DM], skills: skillMap, rules, toggles: tg, food: null, mob: mobBy('Average Dummy'), k: null })
      for (const [cr, e] of [[false, r.events[0]], [true, r.events[2]]] as const) {
        expect(Math.abs(seen[`${cr}|${bs}`] / e.damage - 1)).toBeLessThan(0.06)
      }
    }
  })
})

describe('Magic vs size', () => {
  it('"Magic vs Medium +5%" and "Magic DMG vs all sizes +5%" are bMagicAddSize, not plain magic damage', () => {
    expect(find('Follower Ring').mods.filter((m) => m.key === 'magic_vs_size').map((m) => m.scope?.size).sort()).toEqual(['large', 'medium', 'small'])
    expect(find('Follower Ring').mods.some((m) => m.key === 'magic_dmg')).toBe(false)
    expect(find("King's Wizard Gloves").mods).toContainEqual(expect.objectContaining({ key: 'magic_vs_size', value: 5, scope: { size: 'medium' }, cond: { t: 'always' } }))
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

describe('SP cost above MaxSP', () => {
  it('the rotation does not wait forever: the cast fails with no damage', () => {
    const b = trickster(null)
    b.baseLv = 1
    b.stats = { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 }
    b.skills[DM] = 10
    const r = runRotation({ build: b, byId, steps: [DM, DM], skills: skillMap, rules: rulesFor('Trickster'), toggles: {}, food: null, mob: mobBy('Average Dummy'), k: null })
    expect(r.sp.max).toBeLessThan(50)
    expect(r.events.map((e) => e.damage)).toEqual([0, 0])
    expect(r.events[0].notes.join(' ')).toMatch(/not enough SP/)
  })
})
