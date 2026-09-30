// Named builds saved in the browser: a list plus the active one.
// Before 2026-09-30 there was a single build under `rtm-planner:build`; it is migrated into the
// list on first load and kept up to date with the active build as a backup.
import { Build } from '@/lib/types'
import { buildFromJson, buildToJson, emptyBuild, fromObject, isDecodeError } from '@/lib/build-url'

export const K_BUILD = 'rtm-planner:build'
export const K_BUILDS = 'rtm-planner:builds'

export type SavedBuild = { id: string; name: string; build: Build }
export type BuildList = { active: string; list: SavedBuild[] }

export const newBuildId = () => Math.random().toString(36).slice(2, 10)

/** Name not yet used in the list: "Dark Knight", "Dark Knight 2", ... */
export function freeName(list: SavedBuild[], base: string): string {
  const used = new Set(list.map((b) => b.name))
  if (!used.has(base)) return base
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`)) return `${base} ${n}`
}

export const single = (build: Build, name = build.cls): BuildList => {
  const id = newBuildId()
  return { active: id, list: [{ id, name, build }] }
}

/** Parses the saved list; invalid entries are dropped, and an empty result becomes null. */
export function parseList(raw: unknown): BuildList | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<BuildList>
  if (!Array.isArray(o.list)) return null
  const list: SavedBuild[] = []
  for (const x of o.list) {
    const b = fromObject((x as SavedBuild)?.build)
    if (isDecodeError(b) || typeof (x as SavedBuild).id !== 'string') continue
    list.push({ id: (x as SavedBuild).id, name: String((x as SavedBuild).name || b.cls), build: b })
  }
  if (!list.length) return null
  return { active: list.some((b) => b.id === o.active) ? o.active! : list[0].id, list }
}

/** Reads the list; without it, migrates the single build of the old key (or starts empty). */
export function loadBuilds(storage: Pick<Storage, 'getItem'> | null): BuildList {
  try {
    const raw = storage?.getItem(K_BUILDS)
    const parsed = raw ? parseList(JSON.parse(raw)) : null
    if (parsed) return parsed
    const old = storage?.getItem(K_BUILD)
    if (old) {
      const b = buildFromJson(old)
      if (!isDecodeError(b)) return single(b)
    }
  } catch { /* browser without storage or broken JSON: start over */ }
  return single(emptyBuild('Revenant'))
}

export function saveBuilds(storage: Pick<Storage, 'setItem'> | null, s: BuildList) {
  try {
    storage?.setItem(K_BUILDS, JSON.stringify(s))
    // backup under the old key: an older version of the site still opens the active build
    storage?.setItem(K_BUILD, buildToJson(activeBuild(s)))
  } catch { /* no storage */ }
}

export const activeBuild = (s: BuildList): Build => (s.list.find((b) => b.id === s.active) ?? s.list[0]).build

export const setActiveBuild = (s: BuildList, build: Build): BuildList =>
  ({ ...s, list: s.list.map((b) => (b.id === s.active ? { ...b, build } : b)) })

export const select = (s: BuildList, id: string): BuildList => (s.list.some((b) => b.id === id) ? { ...s, active: id } : s)

/** New empty build of the given class, made active. */
export function addNew(s: BuildList, cls: string): BuildList {
  const id = newBuildId()
  return { active: id, list: [...s.list, { id, name: freeName(s.list, cls), build: emptyBuild(cls) }] }
}

/** Independent copy of the active build, made active. */
export function duplicate(s: BuildList): BuildList {
  const cur = s.list.find((b) => b.id === s.active) ?? s.list[0]
  const id = newBuildId()
  return { active: id, list: [...s.list, { id, name: freeName(s.list, `${cur.name} (copy)`), build: structuredClone(cur.build) }] }
}

export const rename = (s: BuildList, id: string, name: string): BuildList => {
  const n = name.trim()
  return n ? { ...s, list: s.list.map((b) => (b.id === id ? { ...b, name: n } : b)) } : s
}

/** Removes a build; the last one is never removed. Removing the active one activates its neighbor. */
export function remove(s: BuildList, id: string): BuildList {
  if (s.list.length <= 1) return s
  const i = s.list.findIndex((b) => b.id === id)
  if (i < 0) return s
  const list = s.list.filter((b) => b.id !== id)
  return { active: s.active === id ? list[Math.min(i, list.length - 1)].id : s.active, list }
}
