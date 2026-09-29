// Calibration against the game: the same build was assembled in the planner and in-game, and the
// status window and @battlestats were captured (2026-09-28). Every number here was read from the screenshot.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { computeSheet } from '@/lib/engine/sheet'
import { rulesFor } from '@/lib/rules/classes'
import { migrateIds } from '@/lib/build-url'
import { Build } from '@/lib/types'
import { byId, skillBy } from './fixtures'

const b: Build = migrateIds(JSON.parse(readFileSync(new URL('./fixtures-data/revenant-ingame-reference-2026-09-28.json', import.meta.url), 'utf8')))
const s = computeSheet({ ...b, skillKey: 'revenant/roaring-overslash' }, byId, skillBy('revenant/roaring-overslash'), rulesFor('Revenant'), {})
const p = (k: string) => (s.totals.pct[k] ?? 0) + (s.totals.flat[k] ?? 0)

describe('status window (in-game 2026-09-28)', () => {
  it('stat bonuses: STR +4 · AGI −1 · VIT −2 · INT −1 · DEX 0 · LUK +5 (the total never goes negative)', () => {
    expect(s.stats).toEqual({ str: 94, agi: 0, vit: 88, int: 0, dex: 50, luk: 95 })
  })
  it('Atk 180 + 50', () => expect([s.split.atk.base, s.split.atk.gear]).toEqual([180, 50]))
  it('Matk 80 + 14', () => expect([s.split.matk.base, s.split.matk.gear]).toEqual([80, 14]))
  it('Hit 456', () => expect(s.split.hit.base).toBe(456))
  it('Critical 117', () => expect(Math.floor(s.critRate.v)).toBe(117))
  it('Mdef 101 + 35', () => expect([s.split.mdef.base, s.split.mdef.gear]).toEqual([101, 35]))
  it('Flee 276 + 37', () => expect([s.split.flee.base, s.split.flee.gear]).toEqual([276, 37]))
  it('Aspd 142', () => expect(s.aspd?.v).toBe(142))
  it('SP 905', () => expect(s.maxSp?.v).toBe(905))
  it('Def 265 + 88 (armor refine rounded the way the emulator does it)', () => {
    expect([s.split.def.base, s.split.def.gear]).toEqual([265, 88])
  })
})

describe('@battlestats (in-game 2026-09-28)', () => {
  it('Skill Boosts: Roaring Overslash 89%, Reaping Slash 40%', () => {
    expect(s.totals.scoped.skill_dmg?.['roaring overslash']).toBe(89)
    expect(s.totals.scoped.skill_dmg?.['reaping slash']).toBe(40)
  })
  it('CRITICAL % 15 · CRITICAL ATK % 105 · ATK % 4', () => {
    expect(p('crit_rate_mult')).toBe(15)
    expect(s.critDmg.v).toBe(105)
    expect(s.totals.pct.atk ?? 0).toBe(4)
  })
  it('Defense Penetration 46 · Magic Defense Penetration 15 (the game shows 18: 3 come from an unidentified source)', () => {
    expect(s.defPen.v).toBe(46)
    expect(p('mdef_pen')).toBe(15)
  })
  it('Leech Power 33 · Regen HP 55% · Regen SP 55%', () => {
    expect(s.leechPower.v).toBe(33)
    expect(p('hp_regen')).toBe(55)
    expect(p('sp_regen')).toBe(55)
  })
  it('After Cast Delay −10% · Variable Cast from items 5%', () => {
    expect(p('after_cast_delay')).toBe(-10)
    expect(-p('cast_time')).toBe(5)
  })
})
