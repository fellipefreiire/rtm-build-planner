import { describe, expect, it } from 'vitest'
import { computeSheet } from '@/lib/engine/sheet'
import { simulate } from '@/lib/engine/simulate'
import { suggest } from '@/lib/engine/suggest'
import { rulesFor } from '@/lib/rules/classes'
import { byId, items, mobBy, referenceBuild, skillBy } from './fixtures'

const toggles = { darkside: true, trueSight: false }

describe('non-functional constraints', () => {
  it('recomputing a build stays well under 16 ms', () => {
    const b = referenceBuild()
    const skill = skillBy(b.skillKey!)
    const rules = rulesFor('Revenant')
    const mob = mobBy('Converted Zealot')
    const t0 = performance.now()
    for (let i = 0; i < 100; i++) {
      const s = computeSheet(b, byId, skill, rules, toggles)
      simulate(b, s, mob)
    }
    const ms = (performance.now() - t0) / 100
    console.log(`  recompute: ${ms.toFixed(2)} ms`)
    expect(ms).toBeLessThan(16)
  })

  it('the suggester sweep responds at interactive speed', () => {
    const b = referenceBuild()
    const t0 = performance.now()
    const list = suggest(b, {
      items, byId, skill: skillBy(b.skillKey!), rules: rulesFor('Revenant'), toggles, mob: mobBy('Converted Zealot'),
    })
    const ms = performance.now() - t0
    console.log(`  suggester: ${ms.toFixed(0)} ms · ${list.length} suggestions`)
    expect(ms).toBeLessThan(4000)
    expect(list.length).toBeGreaterThan(0)
  })
})
