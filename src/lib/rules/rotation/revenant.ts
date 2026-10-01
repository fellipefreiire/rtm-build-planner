// Revenant rotation: Combo Ready, Finisher Ready and Overslash stacks.
// Moved out of engine/rotation.ts on 2026-09-30 without changing behavior.
import { learned, RotationRules } from './types'

export const REVENANT_SKILLS = [
  'trickster/scythe-reap', 'revenant/reaping-slash', 'revenant/roaring-overslash', 'trickster/sweeping-slash',
  'trickster/hellraiser', 'revenant/underworld-rainstorm', 'trickster/dark-message', 'revenant/flaming-wave',
  'revenant/phantom-slice', 'revenant/haunting-slice',
] as const

const SCYTHE_REAP = 'trickster/scythe-reap'
const REAPING = 'revenant/reaping-slash'
const ROARING = 'revenant/roaring-overslash'
const SWEEPING = 'trickster/sweeping-slash'
const HELLRAISER = 'trickster/hellraiser'
const UNDERWORLD = 'revenant/underworld-rainstorm'
const DARK_MESSAGE = 'trickster/dark-message'
const HAUNTING = 'revenant/haunting-slice'

const MAX_STACKS = 5
const STACK_TIME = 6

/**
 * After cast delay of each skill, in ms, from the emulator (`db/re/skill_db.yml`, names of the
 * Royal Guard skills that Revenant inherits). The actual delay is `skill_delayfix` (skill.cpp:18207):
 * ACD × (150 − AGI)/150 (delay_dependon_agi) × (1 − After Cast Delay% from gear), minimum 0.1 s.
 */
const ACD_MS: Record<string, (lv: number) => number> = {
  'revenant/roaring-overslash': () => 1000,     // LG_OVERBRAND
  'revenant/reaping-slash': () => 500,          // LG_MOONSLASHER
  'trickster/scythe-reap': (lv) => 1100 - 100 * lv, // LK_SPIRALPIERCE: 1000 at Lv1 … 100 at Lv10
  'revenant/underworld-rainstorm': () => 1000,  // WM_SEVERE_RAINSTORM
  'trickster/dark-message': () => 500,          // SL_STIN
  'trickster/sweeping-slash': () => 0,          // KN_PIERCE
  'trickster/hellraiser': () => 0,              // RK_IGNITIONBREAK
  'revenant/flaming-wave': () => 0,             // NC_FLAMELAUNCHER
}

type State = { stacks: number; stacksUntil: number }

export const REVENANT_ROTATION: RotationRules<State> = {
  palette: (build) => learned(build, REVENANT_SKILLS),
  lanes: [
    { id: 'comboReady', label: 'Combo Ready', cls: 'cr', short: () => 'CR' },
    { id: 'finisherReady', label: 'Finisher Ready', cls: 'fr', short: () => 'FR' },
    { id: 'stacks', label: 'Overslash', cls: 'st', short: (s) => `◆ ${s.stacks ?? 0}` },
  ],
  acdMs: (key, lv) => ACD_MS[key]?.(lv),
  init: () => ({ stacks: 0, stacksUntil: -1 }),
  stacks: (s) => s.stacks,

  cast: (c, s) => {
    if (c.start > s.stacksUntil) s.stacks = 0
    const cr = c.active('comboReady')
    const fr = c.active('finisherReady')
    const before = s.stacks
    const notes: string[] = []
    let hits = 1
    let mult = 1

    if (c.key === ROARING) {
      // +1 hit per stack; Roaring does not consume the stacks [player report 2026-09-28]
      hits = 1 + s.stacks
      if (!cr) notes.push('without Combo Ready: reduced damage')
      // Roaring consumes Finisher Ready [player report 2026-09-30]
      if (fr) c.consume('finisherReady')
    } else if (c.key === REAPING) {
      mult = 1 + 0.05 * before
      // Finisher Ready (Hellraiser): Reaping goes straight to 5 [player report 2026-09-28]
      if (fr) s.stacks = MAX_STACKS
      else s.stacks = s.stacks === 0 ? 1 : cr ? Math.min(MAX_STACKS, s.stacks + 1) : s.stacks
      s.stacksUntil = c.start + STACK_TIME
      // stack lane: the previous segment ends here; the new value holds until it expires (or the next Reaping)
      const lane = c.lanes.stacks
      const prev = lane[lane.length - 1]
      if (prev && prev.to > c.start) prev.to = c.start
      lane.push({ from: c.start, to: s.stacksUntil, stacks: s.stacks })
      if (!cr && before >= 1) notes.push('without Combo Ready: stays at 1 stack')
    } else if (c.key === SWEEPING) {
      hits = fr ? 3 : 2
      if (!cr) { mult = 0.5; notes.push('outside combo: ×0.5 [estimated]') }
    } else if (c.key === HAUNTING) {
      // "Damage is fixed based on ATK and Str": no number in the dump or in-game [in-game 2026-10-01]
      mult = 0
      notes.push('no damage formula ("fixed based on ATK and Str"): counted as 0')
      if (c.lv < 5) notes.push(`${20 * c.lv}% chance to autocast Scythe Reap: not counted (only Lv5 is a sure proc)`)
    } else if (c.key === UNDERWORLD) {
      hits = 15
      mult = 1 + 0.04 * before
    }

    return {
      hits, mult, pctAdd: 0, notes, stacksBefore: before,
      // Combo Ready changes Roaring's formula; for every other skill the sheet keeps it on
      sheetToggles: { comboReady: c.key === ROARING ? cr : true },
      ...(c.key === HELLRAISER ? { element: 'Fire' } : {}),
    }
  },

  // Haunting Slice: 20%/level chance to autocast Scythe Reap at Haunting's level [in-game 2026-10-01;
  // the dump's "numbers" says 5%]. Only a sure proc (Lv5) is cast; below that it is a note.
  autocasts: (c) => {
    if (c.key !== HAUNTING) return []
    const chance = 20 * c.lv
    return chance >= 100 ? [{ key: SCYTHE_REAP, lv: c.lv, times: 1, why: `${chance}% chance at Lv${c.lv}` }] : []
  },

  after: (c) => {
    const giveCr = c.key === SCYTHE_REAP ? 4
      : c.key === SWEEPING && (c.build.skills['revenant/advanced-scythe-mastery'] ?? 0) > 0 ? 3
      : c.key === DARK_MESSAGE ? c.lv : 0
    if (giveCr) c.grant('comboReady', giveCr)
    if (c.key === HELLRAISER) c.grant('finisherReady', 5)
  },
}
