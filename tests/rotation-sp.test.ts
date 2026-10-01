// SP over the rotation (RTM regen), Phantom/Haunting Slice and shadow options on regular gear.
// Fixture: the Revenant set sent on 2026-10-01 (MaxSP 1352 without True Sight, SP Regen +75%, SP Cost −10%,
// Roaring cooldown 7 − 1 (Baphomet Card) − 2 (Crimson Gem) = 4 s).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runRotation } from '@/lib/engine/rotation'
import { rulesFor } from '@/lib/rules/classes'
import { migrateIds } from '@/lib/build-url'
import { optionTableFor, resolvePick } from '@/lib/rules/random-options'
import { Build, Skill } from '@/lib/types'
import { byId, find, mobBy, skills } from './fixtures'

const set = (): Build => migrateIds(JSON.parse(readFileSync(new URL('./fixtures-data/revenant-sp-2026-10-01.json', import.meta.url), 'utf8')))
const skillMap = new Map<string, Skill>(skills.map((s) => [s.key, s]))
const run = (steps: string[], b = set()) =>
  runRotation({ build: b, byId, steps, skills: skillMap, rules: rulesFor('Revenant'), toggles: {}, food: null, mob: mobBy('Average Dummy'), k: null })
const SR = 'trickster/scythe-reap', RS = 'revenant/reaping-slash', RO = 'revenant/roaring-overslash'
const HS = 'revenant/haunting-slice', PS = 'revenant/phantom-slice'
const LOOP = [SR, RS, RS, RS, RO]

describe('SP on the rotation', () => {
  it('RTM regen: 24 SP every 1.2 s + 33 SP every 4.5 s (Increase SP Recovery 10)', () => {
    const r = run([SR])
    expect(r.sp.max).toBe(1352)
    expect(r.sp.natural).toBe(24) // floor((1 + 0 + 13) × 1.75)
    expect(r.sp.isr).toBe(33) // floor(20 + 13.52)
    expect(r.sp.perSec).toBeCloseTo(27.3, 1)
  })

  it('each event carries cost and SP left; Roaring = 63 flat + 10% of current SP', () => {
    const r = run(LOOP)
    for (const e of r.events) expect(e.sp.after).toBeCloseTo(e.sp.before - e.sp.cost, 6)
    const ro = r.events[4]
    expect(ro.sp.flat).toBe(63)
    expect(ro.sp.pctPart).toBe(Math.trunc(ro.sp.before * 0.1))
    expect(r.events.slice(0, 4).map((e) => e.sp.cost)).toEqual([17, 45, 45, 45])
  })

  // a loop takes ~4 s (Roaring 4 s, Reaping 1 s): ~215 SP + 10% of current against ~109 SP of regen.
  // Independent step-by-step simulation of 2026-10-01 gives 7 full loops; the engine's timings land on the 8th.
  it('SR → RS×3 → Roaring on the 4 s Roaring cooldown runs out of SP on the 8th loop', () => {
    const r = run(Array.from({ length: 25 }, () => LOOP).flat())
    const first = r.events.findIndex((e) => e.waitedSp > 0)
    expect(first).toBeGreaterThan(0)
    const loop = Math.floor(first / LOOP.length) + 1
    expect(loop).toBeGreaterThanOrEqual(7)
    expect(loop).toBeLessThanOrEqual(9)
  })
})

describe('Phantom Slice and Haunting Slice', () => {
  it('Haunting Lv5 autocasts Scythe Reap and opens Combo Ready; 80 SP, no damage formula', () => {
    const r = run([HS, RS, RO])
    const h = r.events[0]
    expect(h.sp.cost).toBe(72) // 80 − 10%
    expect(h.damage).toBe(0)
    expect(h.autocasts.map((a) => a.skill)).toEqual([SR])
    expect(r.events[1].comboReady).toBe(true)
    expect(r.events[1].stacksAfter).toBe(1)
  })
  it('Haunting below Lv5 does not autocast (only a note)', () => {
    const b = set(); b.skills[HS] = 3
    const h = run([HS], b).events[0]
    expect(h.autocasts).toEqual([])
    expect(h.notes.join(' ')).toMatch(/60% chance/)
  })
  it('Phantom Slice deals damage: 200 + 20%/lv + 2%/VIT (in-game)', () => {
    const s = skillMap.get(PS)!
    expect(s.damage).toMatchObject({ base: 200, coefPerLevel: 20, perStat: [{ stat: 'vit', pct: 2 }], cooldown: 1 })
    expect(run([PS]).events[0].damage).toBeGreaterThan(0)
  })
})

describe('Shadow random options on regular gear', () => {
  it('Dandelion Eyepatch: line 1 VIT +1, line 2 a skill DMG +5%', () => {
    const t = optionTableFor(find('Dandelion Eyepatch'), 'mid')!
    expect(t.group).toBe('shadow')
    expect(resolvePick(t, 0, { key: 'vit', v: 1 })).toMatchObject({ v: 1 })
    expect(resolvePick(t, 1, { key: 'skill:other', v: 5 })).toMatchObject({ v: 5 })
    expect(resolvePick(t, 1, { key: 'skill:roaring overslash', v: 5 })).toMatchObject({ v: 5 })
  })
})

describe('skill level per rotation step', () => {
  it('"key@lv" uses that level for SP and damage; no "@" = learned; above learned is capped', () => {
    const r = run([SR, `${RS}@1`, RS, `${RS}@15`])
    expect(r.events.map((e) => e.lv)).toEqual([10, 1, 10, 10])
    expect(r.events[1].sp.cost).toBe(5) // round(5 × 0.9)
    expect(r.events[2].sp.cost).toBe(45)
    expect(r.events[3].sp.cost).toBe(45)
    expect(r.events[1].damage).toBeLessThan(r.events[2].damage)
  })
  it('Haunting Slice @3 does not autocast (60%), @5 does', () => {
    const r = run([`${HS}@3`])
    expect(r.events[0].autocasts).toEqual([])
    expect(r.events[0].lv).toBe(3)
    expect(run([`${HS}@5`]).events[0].autocasts).toHaveLength(1)
  })
})

describe('skill level per skill (Skills palette)', () => {
  it('levels map applies to every cast of the skill; a step with "@" still wins', () => {
    const b = set()
    const r = runRotation({ build: b, byId, steps: [SR, RS, RS, `${RS}@3`], levels: { [RS]: 1 }, skills: skillMap, rules: rulesFor('Revenant'), toggles: {}, food: null, mob: mobBy('Average Dummy'), k: null })
    expect(r.events.map((e) => e.lv)).toEqual([10, 1, 1, 3])
    expect(r.events.slice(1, 3).map((e) => e.sp.cost)).toEqual([5, 5])
  })
  it('saved rotations with "key@lv" migrate to plain keys + the level map', async () => {
    const mem: Record<string, string> = {
      'rtm-planner:sim': JSON.stringify({ rotations: { Revenant: [SR, `${RS}@1`, `${RS}@1`, RO] } }),
    }
    const g = globalThis as unknown as { localStorage?: unknown }
    g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v } }
    try {
      const { loadSim } = await import('@/lib/sim-store')
      const s = loadSim({})
      expect(s.rotations.Revenant).toEqual([SR, RS, RS, RO])
      expect(s.skillLv.Revenant).toEqual({ [RS]: 1 })
    } finally { delete g.localStorage }
  })
})

describe('Darkside Shadow server bug (2026-10-01)', () => {
  it('does not change Scythe Reap nor Reaping Slash, still raises Roaring', () => {
    const go = (darkside: boolean) => runRotation({ build: set(), byId, steps: [SR, RS, RO], skills: skillMap, rules: rulesFor('Revenant'), toggles: { darkside }, food: null, mob: mobBy('Average Dummy'), k: null })
    const on = go(true).events, off = go(false).events
    expect(on[0].damage).toBe(off[0].damage)
    expect(on[1].damage).toBe(off[1].damage)
    expect(on[2].damage).toBeGreaterThan(off[2].damage)
  })
})

describe('gear SP every second', () => {
  it('Crown of the Divine +9 ("Regen 1 SP per refine every second") adds 9 SP/s to the regen', () => {
    const b = set()
    const plain = run([SR], b).sp.perSec
    b.slots.upper = { id: find('Crown of the Divine').id, refine: 9, cards: [] }
    const crown = run([SR], b)
    expect(crown.sp.perSec - plain).toBeGreaterThan(8.5)
  })
})
