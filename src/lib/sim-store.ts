// Simulator state and build variants, stored in the browser's localStorage.
import { Build, StatKey } from '@/lib/types'
import { fromObject, isDecodeError } from '@/lib/build-url'

export type Variant = { id: string; name: string; build: Build }

export type SimState = {
  /** ids of the builds being compared; 'current' = the one in the Build Planner */
  selected: string[]
  mobName: string
  buffs: Record<string, boolean>
  food: { stat: StatKey; value: number }
  /** timeline skill sequence (skill tree keys) — legacy, only read to migrate into `rotations` */
  rotation?: string[]
  /** timeline skill sequence (skill tree keys), per class */
  rotations: Record<string, string[]>
  /** HP at the start of the rotation, in % of MaxHP; the engine applies costs, leech and regen from there */
  hpPct: number
  /** skill level used in the rotation, per class and skill key (absent = learned level) */
  skillLv: Record<string, Record<string, number>>
  /** value lanes shown on the rotation track */
  lanesShown: { hp: boolean; sp: boolean; shield: boolean }
}

const K_VARIANTS = 'rtm-planner:variants'
const K_SIM = 'rtm-planner:sim'
export const K_TAB = 'rtm-planner:tab'

export const defaultSim = (buffDefaults: Record<string, boolean>): SimState => ({
  selected: ['current'],
  mobName: 'Average Dummy',
  buffs: buffDefaults,
  food: { stat: 'luk', value: 0 },
  rotations: {
    Revenant: ['trickster/scythe-reap', 'revenant/reaping-slash', 'revenant/reaping-slash', 'revenant/reaping-slash', 'revenant/roaring-overslash'],
    Trickster: ['trickster/scythe-reap', 'trickster/sweeping-slash', 'trickster/hellraiser', 'trickster/sweeping-slash'],
  },
  hpPct: 100,
  lanesShown: { hp: true, sp: true, shield: true },
  skillLv: {},
})

const read = (k: string): unknown => {
  try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : null } catch { return null }
}
const write = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* no storage */ }
}

export function loadVariants(): Variant[] {
  const v = read(K_VARIANTS)
  if (!Array.isArray(v)) return []
  const out: Variant[] = []
  for (const x of v) {
    const b = fromObject((x as Variant)?.build)
    if (!isDecodeError(b) && typeof (x as Variant).id === 'string') out.push({ id: (x as Variant).id, name: String((x as Variant).name || 'untitled'), build: b })
  }
  return out
}
export const saveVariants = (v: Variant[]) => write(K_VARIANTS, v)

export function loadSim(buffDefaults: Record<string, boolean>): SimState {
  const d = defaultSim(buffDefaults)
  const s = read(K_SIM) as Partial<SimState> | null
  if (!s || typeof s !== 'object') return d
  // before 2026-09-30 there was a single rotation, always Revenant's
  // classes with no saved rotation get the default one (Trickster, added 2026-10-01)
  const rotations = { ...d.rotations, ...(s.rotations ?? (Array.isArray(s.rotation) ? { Revenant: s.rotation } : {})) }
  // 2026-10-01: the per-step level ("key@lv") became one level per skill; the last step's level wins
  const skillLv: Record<string, Record<string, number>> = { ...(s.skillLv ?? {}) }
  for (const [cls, steps] of Object.entries(rotations)) {
    rotations[cls] = steps.map((st) => {
      const at = st.lastIndexOf('@')
      if (at < 0) return st
      const lv = Number(st.slice(at + 1))
      if (Number.isInteger(lv) && lv > 0) (skillLv[cls] ??= {})[st.slice(0, at)] = lv
      return st.slice(0, at)
    })
  }
  const { rotation: _legacy, ...rest } = s
  void _legacy
  return { ...d, ...rest, rotations, buffs: { ...d.buffs, ...(s.buffs ?? {}) }, food: { ...d.food, ...(s.food ?? {}) }, lanesShown: { ...d.lanesShown, ...(s.lanesShown ?? {}) }, skillLv }
}
export const saveSim = (s: SimState) => write(K_SIM, s)

export const newId = () => Math.random().toString(36).slice(2, 10)
