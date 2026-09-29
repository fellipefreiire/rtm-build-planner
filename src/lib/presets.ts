// Example preset: Revenant reference build, the only set with numbers measured in-game.
import { Build, SlotId } from '@/lib/types'
import { emptyBuild } from '@/lib/build-url'
import { items } from '@/lib/data'

const id = (name: string) => items.find((i) => i.name === name)?.id

export function revenantHoly(): Build {
  const b = emptyBuild('Revenant')
  b.baseLv = 150
  b.stats = { str: 66, agi: 1, vit: 90, int: 40, dex: 49, luk: 99 }
  b.skillKey = 'revenant/roaring-overslash'
  b.skillLv = 10
  b.weaponElement = 'Fire'
  b.armorElement = 'Holy'
  b.hpOverride = 16500

  const put = (slot: SlotId, name: string, refine: number, cards: string[] = []) => {
    const i = id(name)
    if (i == null) return
    b.slots[slot] = { id: i, refine, cards: cards.map(id).filter((x): x is number => x != null) }
  }
  put('weapon', 'Pesta', 10, ['Hodremlin Card'])
  put('armor', 'Genesis Bright Armor', 10, ['Meteor Golem Card'])
  put('garment', 'Surt Shawl', 10, ['Sif Avatar Card'])
  put('upper', 'Caelum of the Sun', 10, ['Baphomet Jr. Card', 'Baphomet Jr. Card'])
  put('mid', 'Dandelion Eyepatch', 0, ['Veins Ghoul Card'])
  put('lower', 'Flaming Weaver', 10, ['Mind Vessel Card', "Baphomet's Shadow Card"])
  put('shoes', 'Emperium Boots', 10, ['Sedora Card'])
  put('accessory', 'Sage Ring', 10, ['Doomfist Card', 'Doomfist Card', 'Doomfist Card'])
  put('accessory2', 'Ring of Naght Sieger', 0, ['Doomfist Card', 'Doomfist Card'])
  put('shadowArmor', 'End of Kings Armor', 10)
  put('shadowShoes', 'End of Kings Boots', 10)
  put('shadowGloves', 'End of Kings Shield', 10)
  put('shadowAcc', 'End of Kings Pendant', 10)
  put('costume', 'Living Reaper', 0)
  return b
}
