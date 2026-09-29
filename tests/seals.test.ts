import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { sealResult } from '@/lib/rules/seals'
import { computeSheet } from '@/lib/engine/sheet'
import { rulesFor } from '@/lib/rules/classes'
import { migrateIds } from '@/lib/build-url'
import { Build } from '@/lib/types'
import { byId } from './fixtures'

const sample = (): Build => migrateIds(JSON.parse(readFileSync(new URL('./fixtures-data/revenant-endgame-sample.json', import.meta.url), 'utf8')))
const words = (r: ReturnType<typeof sealResult>) => r.lines.filter((l) => l.word && l.tier !== 'mark').map((l) => l.word)

describe('seals', () => {
  it('Amatsu 2+2 (Zan, Riki, Jin, Retsu) = KIRI + HAYATE + IAI; no Focus or support', () => {
    const r = sealResult('ama', ['ZA', 'RI', 'JI', 'RE'])
    expect(words(r)).toEqual(['HAYATE 迅', 'KIRI 斬', 'IAI 居合'])
    const crit = r.mods.filter((x) => x.key === 'crit_rate').reduce((a, x) => a + x.value, 0)
    expect(crit).toBe(12) // HAYATE 5 + IAI 7
  })
  it('Amatsu 2+1+1 (Zan, Riki, Retsu, Ya) = KIRI + MUSÔ + Bow and Surge supports', () => {
    const r = sealResult('ama', ['ZA', 'RI', 'RE', 'YA'])
    expect(words(r)).toEqual(['KIRI 斬', 'MUSÔ 無想'])
    expect(r.lines.filter((l) => l.tier.startsWith('support'))).toHaveLength(2)
  })
  it('Valhalla 1+1+1+1 = URÐR (Balance) + 4 supports', () => {
    const r = sealResult('odin', ['AE', 'VD', 'LI', 'VG'])
    expect(words(r)).toEqual(['URÐR'])
    expect(r.lines.filter((l) => l.tier.startsWith('support'))).toHaveLength(4)
  })
  it('Valhalla Wall + Fate = SKJÖLDR: −3% damage taken, PD +5, move +3%, Flee +15', () => {
    const r = sealResult('odin', ['AE', 'VA', 'VG', 'KA'])
    expect(words(r)).toContain('SKJÖLDR')
    expect(r.mods).toEqual(expect.arrayContaining([{ key: 'dmg_taken', value: -3, pct: true }, { key: 'flee', value: 15, pct: false }]))
  })
  it('with fewer than 4 marks only the marks and the pairs', () => {
    const r = sealResult('ama', ['ZA', 'RI'])
    expect(words(r)).toEqual(['KIRI 斬'])
  })
  it('in the engine: STR +2 in both temples adds +4; without a rune Valhalla does not apply', () => {
    const b = sample() // has a rune (Othila) and a manual (Celestial Tome)
    const r = rulesFor('Revenant')
    const without = computeSheet(b, byId, null, r, {})
    b.seals = { ama: ['ZA'], odin: ['AE'] }
    expect(computeSheet(b, byId, null, r, {}).stats.str - without.stats.str).toBe(4)
    delete b.slots.rune
    const noRune = computeSheet(b, byId, null, r, {})
    expect(noRune.skipped.some((s) => /slot rune, which is empty/i.test(s.why))).toBe(true)
  })
})
