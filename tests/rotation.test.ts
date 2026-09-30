import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runRotation } from '@/lib/engine/rotation'
import { computeSheet } from '@/lib/engine/sheet'
import { rulesFor } from '@/lib/rules/classes'
import { migrateIds } from '@/lib/build-url'
import { Build, Skill } from '@/lib/types'
import { byId, mobBy, skills } from './fixtures'

const sample = (): Build => migrateIds(JSON.parse(readFileSync(new URL('./fixtures-data/revenant-endgame-sample.json', import.meta.url), 'utf8')))
const skillMap = new Map<string, Skill>(skills.map((s) => [s.key, s]))
const run = (steps: string[], learn: Record<string, number> = {}) => {
  const b = sample()
  b.skills = { ...b.skills, 'trickster/scythe-reap': 10, 'revenant/reaping-slash': 10, 'revenant/roaring-overslash': 10, 'trickster/hellraiser': 1, ...learn }
  return runRotation({ build: b, byId, steps, skills: skillMap, rules: rulesFor('Revenant'), toggles: {}, food: null, mob: mobBy('Average Dummy'), k: null })
}
const SR = 'trickster/scythe-reap', RS = 'revenant/reaping-slash', RO = 'revenant/roaring-overslash', HR = 'trickster/hellraiser'

describe('rotation: Combo Ready and Overslash stacks', () => {
  it('Scythe Reap → Reaping ×3 → Roaring: stacks 1,2,3; Roaring hits 4 times and does not consume the stacks', () => {
    const r = run([SR, RS, RS, RS, RO])
    expect(r.events.map((e) => e.stacksAfter)).toEqual([0, 1, 2, 3, 3])
    expect(r.events[4].hits).toBe(4)
    expect(r.events[4].comboReady).toBe(true)
  })
  it('without Combo Ready Reaping does not go past 1 stack, and Roaring goes out without combo', () => {
    const r = run([RS, RS, RS, RO])
    expect(r.events.map((e) => e.stacksAfter)).toEqual([1, 1, 1, 1])
    expect(r.events[3].hits).toBe(2)
    expect(r.events[3].comboReady).toBe(false)
  })
  it('Hellraiser grants Finisher Ready: Reaping goes straight to 5 stacks', () => {
    const r = run([HR, RS, RO])
    expect(r.events.map((e) => e.stacksAfter)).toEqual([0, 5, 5])
    expect(r.events[2].hits).toBe(6)
  })
  it('Roaring with combo hits harder than without, and 4 hits = 4× 1 hit', () => {
    const a = run([SR, RO]).events[1]
    const b = run([RO]).events[0]
    expect(a.damage).toBeGreaterThan(b.damage)
    const c = run([SR, RS, RS, RS, RO]).events[4]
    expect(c.damage).toBeCloseTo(a.damage * 4, 0)
  })
  it('respects cooldown: two Roarings in a row wait for the CD', () => {
    const r = run([SR, RO, RO])
    expect(r.events[2].start - r.events[1].start).toBeGreaterThanOrEqual(6 - 1e-9) // Baphomet Card: 7 − 1
  })
  it('per-skill breakdown sums to the total', () => {
    const r = run([SR, RS, RS, RO])
    expect(r.bySkill.reduce((a, x) => a + x.total, 0)).toBeCloseTo(r.total, 6)
    expect(r.dps).toBeCloseTo(r.total / r.duration, 6)
  })
})

describe('rotation: time = max(ACD, amotion) — emulator skill.conf', () => {
  it('every skill locks at least amotion (2000 − 10 × ASPD); Roaring (ACD 1 s) locks longer', () => {
    const b = sample()
    const aspd = computeSheet(b, byId, null, rulesFor('Revenant'), {}).aspd!.v
    const amotion = (2000 - 10 * aspd) / 1000
    const r = run([SR, RS, RO])
    const [sr, rs, ro] = r.events
    expect(sr.end - sr.start).toBeCloseTo(amotion, 6) // Scythe Reap Lv10 ACD (0.1 s) < amotion
    expect(rs.end - rs.start).toBeCloseTo(amotion, 6) // Reaping ACD (~0.4 s) < amotion
    expect(ro.end - ro.start).toBeGreaterThan(amotion)
  })
})

describe('rotation: state lanes', () => {
  it('Combo Ready: Scythe Reap opens 4 s; another Scythe Reap inside the window extends the same lane', () => {
    const r = run([SR, RS, SR, RS])
    expect(r.lanes.comboReady).toHaveLength(1)
    const [cr] = r.lanes.comboReady
    expect(cr.from).toBe(0)
    expect(cr.to).toBeCloseTo(r.events[2].start + 4, 6)
  })
  it('Overslash: each Reaping renews the 6 s; the previous segment ends at the next Reaping', () => {
    const r = run([SR, RS, RS])
    const [a, b] = r.lanes.stacks
    expect(a).toMatchObject({ stacks: 1 })
    expect(a.to).toBeCloseTo(r.events[2].start, 6)
    expect(b.stacks).toBe(2)
    expect(b.to - b.from).toBeCloseTo(6, 6)
  })
  it('Hellraiser Finisher Ready lasts 5 s', () => {
    const r = run([HR, RS])
    expect(r.lanes.finisherReady[0].to - r.lanes.finisherReady[0].from).toBeCloseTo(5, 6)
  })
  it('Roaring consumes Finisher Ready: the lane ends at the Roaring and the next Reaping does not jump to 5', () => {
    const r = run([HR, SR, RO, RS])
    expect(r.events[2].finisherReady).toBe(true)
    expect(r.lanes.finisherReady[0].to).toBeCloseTo(r.events[2].start, 6)
    expect(r.events[3].finisherReady).toBe(false)
    expect(r.events[3].stacksAfter).toBe(1)
  })
})
