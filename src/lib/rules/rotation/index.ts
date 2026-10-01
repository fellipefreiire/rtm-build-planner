// Per-class rotation rules. The engine (engine/rotation.ts) handles what every class shares —
// time, SP, cooldown, after cast delay, amotion, damage per cast — and asks the class module
// which skills exist, which states they grant and how each cast changes the damage.
import type { RotationRules } from './types'
import { REVENANT_ROTATION, TRICKSTER_ROTATION } from './revenant'
import { DARK_KNIGHT_ROTATION } from './dark-knight'
import { GENERIC_ROTATION } from './generic'

export * from './types'

// the class state is private to each module: the engine only passes it back
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRules = RotationRules<any>

const TABLE: Record<string, AnyRules> = {
  Revenant: REVENANT_ROTATION,
  Trickster: TRICKSTER_ROTATION,
  'Dark Knight': DARK_KNIGHT_ROTATION,
}

export const rotationRulesFor = (cls: string): AnyRules => TABLE[cls] ?? GENERIC_ROTATION
