import { describe, expect, it } from 'vitest'
import { emptyBuild, migrateIds, toggleSwitch, buildFromJson, buildToJson, isDecodeError } from '@/lib/build-url'
import { computeSheet } from '@/lib/engine/sheet'
import { rulesFor } from '@/lib/rules/classes'
import { Build } from '@/lib/types'
import { byId, find } from './fixtures'

const withWeapon = (): Build => {
  const b = emptyBuild('Revenant')
  b.slots.weapon = { id: find('Ominous Lament').id, refine: 10, cards: [find('Baroness of Sorrow Card').id, find('Sarah Irine Card').id] }
  return b
}

describe('equipment switch', () => {
  it('first click: the item goes to the reserve and the slot is left empty (side B)', () => {
    const b = toggleSwitch(withWeapon(), 'weapon')
    expect(b.slots.weapon).toBeUndefined()
    expect(b.swaps?.weapon?.id).toBe(find('Ominous Lament').id)
    expect(b.swapSide?.weapon).toBe('B')
  })
  it('equip another on B and switch back: A returns with its cards, B becomes the reserve', () => {
    let b = toggleSwitch(withWeapon(), 'weapon')
    b.slots.weapon = { id: find('Ominous Lament').id, refine: 10, cards: [find('Baroness of Sorrow Card').id, find('Umbral Knight Card').id] }
    b = toggleSwitch(b, 'weapon')
    expect(b.swapSide?.weapon).toBe('A')
    expect(b.slots.weapon?.cards[1]).toBe(find('Sarah Irine Card').id)
    expect(b.swaps?.weapon?.cards[1]).toBe(find('Umbral Knight Card').id)
  })
  it('the engine only uses the active item: Sarah = Holy on A, Umbral = Dark on B', () => {
    let b = toggleSwitch(withWeapon(), 'weapon')
    b.slots.weapon = { id: find('Ominous Lament').id, refine: 10, cards: [find('Baroness of Sorrow Card').id, find('Umbral Knight Card').id] }
    const r = rulesFor('Revenant')
    expect(computeSheet(b, byId, null, r, {}).weaponElement.v).toBe('Dark')
    b = toggleSwitch(b, 'weapon')
    expect(computeSheet(b, byId, null, r, {}).weaponElement.v).toBe('Holy')
  })
  it('active and reserve both empty: the switch disappears', () => {
    const b = toggleSwitch(emptyBuild('Revenant'), 'weapon')
    expect(b.swaps && 'weapon' in b.swaps).toBe(false)
  })
  it('the switch survives saving to JSON and migrates old ids', () => {
    const b = toggleSwitch(withWeapon(), 'weapon')
    const back = buildFromJson(buildToJson(b))
    expect(isDecodeError(back)).toBe(false)
    expect((back as Build).swaps?.weapon?.id).toBe(find('Ominous Lament').id)
    const old = emptyBuild('Revenant'); old.swaps = { upper: { id: 900395, refine: 10, cards: [] } }
    expect(migrateIds(old).swaps?.upper?.id).toBe(31213)
  })
})

describe('who can equip', () => {
  it('"All except Orphan" shows up for Revenant and is hidden for Orphan', async () => {
    const { canEquip, itemsForSlot } = await import('@/lib/data')
    const rune = find('Anima Rune of Restoration')
    expect(canEquip(rune, 'Revenant')).toBe(true)
    expect(canEquip(rune, 'Orphan')).toBe(false)
    expect(itemsForSlot('rune', 'Revenant', true).some((i) => i.id === rune.id)).toBe(true)
  })
})
