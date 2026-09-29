import itemsJson from '@/data/items.json'
import skillsJson from '@/data/skills.json'
import mobsJson from '@/data/mobs.json'
import { Build, Item, Mob, Skill, SlotId } from '@/lib/types'
import { emptyBuild } from '@/lib/build-url'

export const items = itemsJson as unknown as Item[]
export const skills = skillsJson as unknown as Skill[]
export const mobs = mobsJson as unknown as Mob[]
export const byId = new Map(items.map((i) => [i.id, i]))

export const find = (name: string): Item => {
  const exact = items.find((i) => i.name === name)
  if (exact) return exact
  const pre = items.find((i) => i.name.startsWith(name))
  if (!pre) throw new Error(`item not found: ${name}`)
  return pre
}
const id = (n: string) => find(n).id

/** Reference Revenant build used by the golden tests (Tank Rachel set, Holy armor). */
export function referenceBuild(): Build {
  const b = emptyBuild('Revenant')
  b.baseLv = 150
  b.stats = { str: 66, agi: 1, vit: 90, int: 40, dex: 49, luk: 99 }
  b.skillKey = 'revenant/roaring-overslash'
  b.skillLv = 10
  b.weaponElement = 'Fire'
  b.armorElement = 'Holy'
  b.hpOverride = 16500
  const s = (slot: SlotId, item: string, refine: number, cards: string[] = []) => {
    b.slots[slot] = { id: id(item), refine, cards: cards.map(id) }
  }
  s('weapon', 'Pesta', 10, ['Hodremlin Card'])
  s('armor', 'Genesis Bright Armor', 10, ['Meteor Golem Card'])
  s('garment', 'Surt Shawl', 10, ['Sif Avatar Card'])
  s('upper', 'Caelum of the Sun', 10, ['Baphomet Jr. Card', 'Baphomet Jr. Card'])
  s('mid', 'Dandelion Eyepatch', 0, ['Veins Ghoul Card'])
  s('lower', 'Flaming Weaver', 10, ['Mind Vessel Card', "Baphomet's Shadow Card"])
  s('shoes', 'Emperium Boots', 10, ['Sedora Card'])
  s('accessory', 'Sage Ring', 10, ['Doomfist Card', 'Doomfist Card', 'Doomfist Card'])
  s('accessory2', 'Ring of Naght Sieger', 0, ['Doomfist Card', 'Doomfist Card'])
  s('shadowArmor', 'End of Kings Armor', 10)
  s('shadowShoes', 'End of Kings Boots', 10)
  s('shadowGloves', 'End of Kings Shield', 10)
  s('shadowAcc', 'End of Kings Pendant', 10)
  s('costume', 'Living Reaper', 0)
  return b
}

export const mobBy = (name: string): Mob => {
  const m = mobs.find((x) => x.name === name)
  if (!m) throw new Error(`mob not found: ${name}`)
  return m
}
export const skillBy = (key: string): Skill => {
  const s = skills.find((x) => x.key === key)
  if (!s) throw new Error(`skill not found: ${key}`)
  return s
}
