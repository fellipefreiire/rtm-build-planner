// Any class without its own rotation module: the learned damage skills of its lineage,
// each at its base formula, with no states. Delays and hit counts come from the emulator by icon.
import { emuHits } from '@/lib/rules/server'
import { learned, RotationRules } from './types'

export const GENERIC_ROTATION: RotationRules<null> = {
  palette: (build, lineageSkills) => learned(build, lineageSkills),
  lanes: [],
  init: () => null,
  cast: (c) => ({ hits: emuHits(c.skill.icon), mult: 1, pctAdd: 0, notes: [] }),
  after: () => {},
}
