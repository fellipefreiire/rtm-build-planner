import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runRotation } from '@/lib/engine/rotation'
import { computeSheet } from '@/lib/engine/sheet'
import { rulesFor } from '@/lib/rules/classes'
import { rotationRulesFor } from '@/lib/rules/rotation'
import { migrateIds } from '@/lib/build-url'
import { Build, ClassInfo, Skill } from '@/lib/types'
import classesJson from '@/data/classes.json'
import { byId, mobBy, skills } from './fixtures'

const classes = classesJson as unknown as ClassInfo[]
const skillMap = new Map<string, Skill>(skills.map((s) => [s.key, s]))
// the Dark Knight build of 2026-09-30; its skill list still carries two Revenant skills from an import
const dk = (): Build => migrateIds(JSON.parse(readFileSync(new URL('./fixtures-data/dark-knight-2026-09-30.json', import.meta.url), 'utf8')))
const lineageSkills = (cls: string) =>
  (classes.find((c) => c.name === cls)?.lineage ?? []).flatMap((c) => classes.find((x) => x.name === c)?.damageSkills ?? [])
const run = (steps: string[], toggles: Record<string, boolean> = {}, hpPct = 100, b = dk()) =>
  runRotation({ build: b, byId, steps, skills: skillMap, rules: rulesFor(b.cls), toggles, food: null, mob: mobBy('Average Dummy'), k: null, hpPct })

const DR = 'dark-knight/devil-raid', FM = 'dark-knight/fatal-menace', NM = 'dark-knight/night-menace', V = 'dark-knight/vengeance'

describe('rotation: Dark Knight', () => {
  it('the palette lists the learned damage skills of the lineage, not the Revenant ones from the import', () => {
    const p = rotationRulesFor('Dark Knight').palette(dk(), lineageSkills('Dark Knight'))
    expect(p).toContain(DR)
    expect(p).toContain(NM)
    expect(p.every((k) => k.startsWith('dark-knight/') || k.startsWith('orphan/'))).toBe(true)
  })

  it('Devil Raid → Fatal Menace: Fatal Menace goes out with Combo Ready and gains 3% per STR', () => {
    const b = dk()
    delete b.slots.mid // without Forgotten Egnigem: no Vengeance autocast in between
    const alone = run([FM], {}, 100, b).events[0]
    const r = run([DR, FM], {}, 100, b)
    expect(r.events[1].comboReady).toBe(true)
    expect(alone.comboReady).toBe(false)
    const sheet = computeSheet({ ...b, skillKey: FM }, byId, skillMap.get(FM)!, rulesFor('Dark Knight'), {})
    const pct = sheet.skillPct!.v
    expect(r.events[1].damage / alone.damage).toBeCloseTo((pct + 3 * sheet.stats.str) / pct, 6)
  })

  it('Black Metal doubles Devil Raid (plus its own ATK +10)', () => {
    const on = run([DR], { blackMetal: true }).events[0]
    const off = run([DR], { blackMetal: false }).events[0]
    expect(on.notes.some((n) => n.includes('Black Metal'))).toBe(true)
    expect(on.damage / off.damage).toBeGreaterThanOrEqual(2)
    expect(on.damage / off.damage).toBeLessThan(2.05)
  })

  it('Harvest at 50% HP doubles Night Menace: ×(1 + 2% × 50)', () => {
    const full = run([NM], { harvest: true }, 100).events[0]
    const half = run([NM], { harvest: true }, 50).events[0]
    expect(half.damage / full.damage).toBeCloseTo(2, 6)
  })

  it('Forgotten Egnigem and Devil Gem: Devil Raid casts Vengeance twice, Night Menace casts Fatal Menace, with no time', () => {
    const r = run([DR, NM])
    const [dr, nm] = r.events
    expect(dr.autocasts.map((a) => a.skill)).toEqual([V, V])
    expect(nm.autocasts.map((a) => a.skill)).toEqual([FM])
    for (const a of [...dr.autocasts, ...nm.autocasts]) expect(a.end).toBe(a.start)
    expect(nm.start).toBeCloseTo(dr.end, 9) // the autocasts did not push Night Menace back
    // the Vengeance autocast after Devil Raid gives Combo Ready, so the Fatal Menace from the gem has it
    expect(nm.autocasts[0].comboReady).toBe(true)
    const sum = r.events.reduce((a, e) => a + e.damage + e.autocasts.reduce((x, y) => x + y.damage, 0), 0)
    expect(r.total).toBeCloseTo(sum, 6)
    expect(r.bySkill.find((b) => b.skill === V)?.casts).toBe(2)
  })

  it('a class with no rotation module shows its own damage skills', () => {
    const lin = lineageSkills('Night Raven')
    const b: Build = { ...dk(), cls: 'Night Raven', skills: Object.fromEntries(lin.slice(0, 2).map((k) => [k, 1])) }
    expect(rotationRulesFor('Night Raven').palette(b, lin)).toEqual(lin.slice(0, 2))
  })
})
