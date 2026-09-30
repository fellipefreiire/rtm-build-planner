import { describe, expect, it } from 'vitest'
import { buildToJson, emptyBuild } from '@/lib/build-url'
import {
  K_BUILD, K_BUILDS, activeBuild, addNew, duplicate, loadBuilds, remove, rename, saveBuilds, select, setActiveBuild, single,
} from '@/lib/build-store'

const mem = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, m }
}

describe('saved builds', () => {
  it('migrates the single build of the old key into a list with one active entry, named after the class', () => {
    const old = { ...emptyBuild('Dark Knight'), baseLv: 45 }
    const s = loadBuilds(mem({ [K_BUILD]: buildToJson(old) }))
    expect(s.list).toHaveLength(1)
    expect(s.list[0].name).toBe('Dark Knight')
    expect(activeBuild(s).baseLv).toBe(45)
  })

  it('saves the list and keeps the old key with the active build as a backup', () => {
    const st = mem()
    const s = addNew(single(emptyBuild('Revenant')), 'Dark Knight')
    saveBuilds(st, s)
    expect(loadBuilds(st).list.map((b) => b.name)).toEqual(['Revenant', 'Dark Knight'])
    expect(JSON.parse(st.m.get(K_BUILD)!).cls).toBe('Dark Knight')
    expect(JSON.parse(st.m.get(K_BUILDS)!).active).toBe(s.active)
  })

  it('duplicate makes an independent copy and activates it', () => {
    const a = single({ ...emptyBuild('Dark Knight'), slots: { weapon: { id: 1193, refine: 8, cards: [] } } })
    const b = duplicate(a)
    expect(b.active).not.toBe(a.active)
    expect(b.list[1].name).toBe('Dark Knight (copy)')
    const changed = setActiveBuild(b, { ...activeBuild(b), slots: { weapon: { id: 13411, refine: 0, cards: [] } } })
    expect(activeBuild(select(changed, a.active)).slots.weapon!.id).toBe(1193)
    expect(activeBuild(changed).slots.weapon!.id).toBe(13411)
  })

  it('removing the active build activates a neighbor; the last build is never removed', () => {
    const s = addNew(addNew(single(emptyBuild('Revenant')), 'Dark Knight'), 'Dark Knight')
    const [x, y, z] = s.list.map((b) => b.id)
    expect(s.list[2].name).toBe('Dark Knight 2')
    const r = remove(select(s, y), y)
    expect(r.list.map((b) => b.id)).toEqual([x, z])
    expect(r.active).toBe(z)
    const one = single(emptyBuild('Revenant'))
    expect(remove(one, one.active)).toBe(one)
  })

  it('rename ignores an empty name', () => {
    const s = single(emptyBuild('Dark Knight'))
    expect(rename(s, s.active, '  DK lv45  ').list[0].name).toBe('DK lv45')
    expect(rename(s, s.active, '   ').list[0].name).toBe('Dark Knight')
  })
})
