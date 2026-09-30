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

  it('Harvest: Night Menace ×(1 + 2% × HP missing after its own 20% cost)', () => {
    // full HP → 80% when it hits (×1.4); 50% → 40% (×2.2)
    const full = run([NM], { harvest: true }, 100).events[0]
    const half = run([NM], { harvest: true }, 50).events[0]
    expect(half.damage / full.damage).toBeCloseTo(2.2 / 1.4, 6)
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

  it('matches the in-game reading of 2026-09-30 (lv47 build, Average Dummy, no buffs)', () => {
    const b: Build = migrateIds(JSON.parse(readFileSync(new URL('./fixtures-data/dark-knight-lv47-2026-09-30.json', import.meta.url), 'utf8')))
    const sheet = computeSheet({ ...b, skillKey: null }, byId, null, rulesFor('Dark Knight'), {})
    expect(sheet.hit.v).toBe(344)
    expect(Math.round(sheet.maxHp!.v)).toBe(1437)
    const off = { harvest: false, blackMetal: false, knightRitual: false }
    const nm = run([NM], off, 100, b).events[0].damage
    const nmCr = run([DR, NM], off, 100, b).events[1].damage
    // "around" in-game numbers: within 3%
    expect(Math.abs(nm / 2240 - 1)).toBeLessThan(0.03)
    expect(Math.abs(nmCr / 5200 - 1)).toBeLessThan(0.03)
    // Devil Raid (range 9) is ranged: without the build's Melee +15%
    expect(Math.abs(run([DR], off, 100, b).events[0].damage / 1200 - 1)).toBeLessThan(0.03)
  })

  it('Harvest reads the HP after the skill pays its own cost (in-game 2026-09-30, lv47, full HP)', () => {
    const b: Build = migrateIds(JSON.parse(readFileSync(new URL('./fixtures-data/dark-knight-lv47-2026-09-30.json', import.meta.url), 'utf8')))
    const hv = { harvest: true, blackMetal: false, knightRitual: false }
    const within = (x: number, game: number) => expect(Math.abs(x / game - 1)).toBeLessThan(0.04)
    within(run([DR], hv, 100, b).events[0].damage, 1350)
    within(run([NM], hv, 100, b).events[0].damage, 3250)
    // right after Devil Raid, from full HP: the engine chains the costs (100% → 90% → 72%)
    within(run([DR, NM], hv, 100, b).events[1].damage, 9026)
  })

  it('HP over the rotation: cost before the damage, leech after, regen between casts, never above max', () => {
    const b = dk()
    const r = run([NM], { harvest: true }, 100, b)
    const e = r.events[0]
    expect(e.hp.before).toBeCloseTo(r.hp.max, 6)
    expect(e.hp.hit).toBeCloseTo(r.hp.max - Math.trunc(r.hp.max * 0.2), 6) // Night Menace takes 20% of current HP
    // leech = damage (with its autocast) × power × chance
    const dmg = e.damage + e.autocasts.reduce((a, x) => a + x.damage, 0)
    expect(e.hp.leech).toBeCloseTo(dmg * r.hp.leechPower / 100 * r.hp.leechChance, 6)
    expect(e.hp.after).toBeLessThanOrEqual(r.hp.max + 1e-9)
    expect(r.hp.series.every((p) => p.pct <= 100 + 1e-9)).toBe(true)
    // regen between two Night Menaces (the second waits for the 5 s cooldown)
    const two = run([NM, NM], { harvest: false }, 50, b)
    const [a, c] = two.events
    const expected = Math.min(two.hp.max, a.hp.after + (c.start - a.start) * two.hp.regenPerSec)
    expect(c.hp.before).toBeCloseTo(expected, 6)
  })
})
