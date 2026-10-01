import { expect, it } from 'vitest'
import { computeSheet } from '@/lib/engine/sheet'
import { rulesFor } from '@/lib/rules/classes'
import { emptyBuild } from '@/lib/build-url'
import { byId, find } from './fixtures'
it('Heir to the King full set adds DEF from ATK', () => {
  const b = emptyBuild('Revenant'); b.baseLv = 150; b.stats = { str: 99, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 }
  const sh = (n: number) => { const x = structuredClone(b); ['Armor', 'Shield', 'Boots', 'Pendant'].slice(0, n).forEach((p, i) => { x.slots[(['shadowArmor', 'shadowGloves', 'shadowShoes', 'shadowAcc'] as const)[i]] = { id: find(`Heir to the King ${p}`).id, refine: 0, cards: [] } }); return computeSheet(x, byId, null, rulesFor('Revenant'), {}) }
  const full = sh(4), three = sh(3)
  expect(full.def.v - three.def.v).toBeGreaterThan(10)
})
