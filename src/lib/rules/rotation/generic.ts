// Any class without its own rotation module: the learned damage skills of its lineage,
// each at its base formula, with no states. Delays come from the emulator by icon.
import { learned, RotationRules } from './types'

export const GENERIC_ROTATION: RotationRules<null> = {
  palette: (build, lineageSkills) => learned(build, lineageSkills),
  lanes: [],
  init: () => null,
  cast: () => ({ hits: 1, mult: 1, pctAdd: 0, notes: [] }),
  after: () => {},
}
