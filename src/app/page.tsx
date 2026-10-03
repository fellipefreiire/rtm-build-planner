'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Build, SlotId, StatKey } from '@/lib/types'
import { byId, classByName, classes, skillByKey } from '@/lib/data'
import { buildFromJson, buildToJson, decodeBuild, emptyBuild, isDecodeError, toggleSwitch } from '@/lib/build-url'
import {
  BuildList, activeBuild, addNew, duplicate, freeName, loadBuilds, newBuildId, remove, rename, saveBuilds, select,
  setActiveBuild, single,
} from '@/lib/build-store'
import { computeSheet } from '@/lib/engine/sheet'
import { rulesFor } from '@/lib/rules/classes'
import { ELEMENTS } from '@/lib/rules/server'
import EquipWindow from '@/components/EquipWindow'
import { TooltipHost } from '@/components/Tooltip'
import StatusWindow from '@/components/StatusWindow'
import SkillTree from '@/components/SkillTree'
import Breakdown from '@/components/Breakdown'
import SlotModal from '@/components/SlotModal'
import Simulator from '@/components/Simulator'
import Incoming from '@/components/Incoming'
import { K_TAB } from '@/lib/sim-store'

type Tab = 'planner' | 'sim' | 'incoming'

export default function Page() {
  // several named builds; everything on the screen works on the active one (2026-09-30)
  const [builds, setBuilds] = useState<BuildList>(() => single(emptyBuild('Revenant')))
  const build = activeBuild(builds)
  const setBuild = useCallback((b: Build | ((b: Build) => Build)) =>
    setBuilds((s) => setActiveBuild(s, typeof b === 'function' ? b(activeBuild(s)) : b)), [])
  /** slot open in the edit modal */
  const [editing, setEditing] = useState<SlotId | null>(null)
  const [tab, setTab] = useState<Tab>('planner')
  useEffect(() => {
    try {
      const t = localStorage.getItem(K_TAB)
      if (t === 'sim' || t === 'incoming') setTab(t)
    } catch { /* no storage */ }
  }, [])
  const openTab = (t: Tab) => { setTab(t); try { localStorage.setItem(K_TAB, t) } catch { /* no storage */ } }
  const [toggles, setToggles] = useState<Record<string, boolean>>({})

  // --- state saved in the browser as JSON (2026-09-28: replaces the URL) ---
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let storage: Storage | null = null
    try { storage = localStorage } catch { /* browser without storage */ }
    // the saved list; the single build of before 2026-09-30 becomes its first entry
    let s = loadBuilds(storage)
    // old link with a #hash: import once as a new build (does not overwrite a saved one) and clear the URL
    const h = window.location.hash.slice(1)
    if (h) {
      const d = decodeBuild(h)
      if (isDecodeError(d)) console.warn('build in URL discarded:', d.detail)
      else { const id = newBuildId(); s = { active: id, list: [...s.list, { id, name: freeName(s.list, d.cls), build: d }] } }
      window.history.replaceState(null, '', window.location.pathname)
    }
    setBuilds(s)
    setLoaded(true)
  }, [])
  useEffect(() => {
    if (!loaded) return
    let storage: Storage | null = null
    try { storage = localStorage } catch { /* no storage */ }
    saveBuilds(storage, builds)
  }, [builds, loaded])

  const activeName = builds.list.find((b) => b.id === builds.active)?.name ?? ''
  const renameActive = () => {
    const n = window.prompt('Build name:', activeName)
    if (n) setBuilds((s) => rename(s, s.active, n))
  }
  const removeActive = () => {
    if (builds.list.length <= 1) return
    if (window.confirm(`Delete the build "${activeName}"? This cannot be undone.`)) setBuilds((s) => remove(s, s.active))
  }

  const exportJson = async () => {
    const txt = buildToJson(build)
    try { await navigator.clipboard.writeText(txt); alert('Build JSON copied.') }
    catch { window.prompt('Copy the build JSON:', txt) }
  }
  const importJson = () => {
    const txt = window.prompt('Paste the build JSON (or an old link with #):')
    if (!txt) return
    const t = txt.trim()
    const d = t.startsWith('{') ? buildFromJson(t) : decodeBuild(t.includes('#') ? t.slice(t.indexOf('#') + 1) : t)
    if (isDecodeError(d)) { alert(`Could not import: ${d.detail}`); return }
    setBuild(d)
  }

  const cls = build.cls
  const rules = useMemo(() => rulesFor(cls), [cls])
  const skill = build.skillKey ? skillByKey.get(build.skillKey) ?? null : null

  const sheet = useMemo(
    () => computeSheet(build, byId, skill, rules, toggles),
    [build, skill, rules, toggles],
  )
  // --- editing ---
  const patch = useCallback((f: (b: Build) => Build) => setBuild((b) => f(structuredClone(b))), [])

  const setItem = (slot: SlotId, itemId: number | null) =>
    patch((b) => {
      if (itemId == null) { delete b.slots[slot]; return b }
      // new item: cards and random options belonged to the old item and are dropped
      b.slots[slot] = { id: itemId, refine: b.slots[slot]?.refine ?? 0, cards: [] }
      // two-handed weapon takes both hands: the off-hand is removed
      if (slot === 'weapon' && byId.get(itemId)?.twoHanded) delete b.slots.offhand
      return b
    })
  const setCard = (slot: SlotId, ci: number, cardId: number | null) =>
    patch((b) => {
      const e = b.slots[slot]
      if (!e) return b
      const cards = [...e.cards]
      if (cardId == null) delete cards[ci]
      else cards[ci] = cardId
      e.cards = cards
      return b
    })
  const setRefine = (slot: SlotId, refine: number) =>
    patch((b) => {
      // server refine goes up to +10
      if (b.slots[slot]) b.slots[slot]!.refine = Math.max(0, Math.min(10, refine))
      return b
    })
  const setOpt = (slot: SlotId, line: number, pick: { key: string; v: number } | null) =>
    patch((b) => {
      const e = b.slots[slot]
      if (!e) return b
      const opts = [...(e.opts ?? [])]
      opts[line] = pick
      e.opts = opts
      return b
    })

  const setDream = (slot: SlotId, id: string | null) =>
    patch((b) => { if (b.slots[slot]) b.slots[slot]!.dream = id; return b })

  const closeModal = useCallback(() => setEditing(null), [])

  return (
    <TooltipHost><div className="app">
      <header className="bar">
        <nav className="tabs">
          <button aria-pressed={tab === 'planner'} onClick={() => openTab('planner')}>Build Planner</button>
          <button aria-pressed={tab === 'sim'} onClick={() => openTab('sim')}>Simulator</button>
          <button aria-pressed={tab === 'incoming'} onClick={() => openTab('incoming')} title="what each attack of a mob does to you">Incoming</button>
        </nav>
        {rules.toggles.map((t) => (
          <label key={t.id} title={t.why} style={{ marginLeft: 16 }}>
            <input
              type="checkbox"
              checked={toggles[t.id] ?? t.default}
              onChange={(e) => setToggles((o) => ({ ...o, [t.id]: e.target.checked }))}
            />{' '}{t.label}
          </label>
        ))}
        {sheet.emuJob.doubtful && (
          <small className="dim" style={{ marginLeft: 16 }} title={sheet.emuJob.doubtful}>
            uncertain emulator job: {sheet.emuJob.job}
          </small>
        )}
        <span className="bar-actions">
          <span className="build-pick">
            <select value={builds.active} onChange={(e) => { const id = e.target.value; setBuilds((s) => select(s, id)) }} title="saved builds">
              {builds.list.map((b) => <option key={b.id} value={b.id}>{b.name}{b.name.includes(b.build.cls) ? '' : ` · ${b.build.cls}`}</option>)}
            </select>
            <button onClick={() => setBuilds((s) => addNew(s, build.cls))} title={`new empty ${build.cls} build`}>New</button>
            <button onClick={() => setBuilds(duplicate)} title="copy of this build">Duplicate</button>
            <button onClick={renameActive} title="rename this build">Rename</button>
            <button onClick={removeActive} disabled={builds.list.length <= 1} title="delete this build">Delete</button>
          </span>
          <button onClick={exportJson} title="copy the build as JSON">Export JSON</button>
          <button onClick={importJson} title="paste a JSON or an old link">Import</button>
        </span>
      </header>

      {tab === 'incoming' ? <Incoming build={build} sheet={sheet} /> : tab === 'sim' ? <Simulator build={build} onSwitch={(slot) => patch((b) => toggleSwitch(b, slot))} /> : (
      <main className="cols">
        <section className="col left">
          <StatusWindow
            build={build}
            sheet={sheet}
            classes={classes}
            onStat={(s: StatKey, v) => patch((b) => { b.stats[s] = v; return b })}
            onPoints={(v) => patch((b) => { b.points = v; return b })}
            onPatch={patch}
          />
          <SkillTree
            build={build}
            info={classByName.get(cls)}
            onAlloc={(key, lv) => patch((b) => {
              if (lv <= 0) delete b.skills[key]
              else b.skills[key] = lv
              return b
            })}
            onSetAll={(skills) => patch((b) => { b.skills = { ...b.skills, ...skills }; return b })}
          />
        </section>

        <section className="col center">
          <EquipWindow
            build={build}
            active={editing}
            onClear={(slot) => patch((b) => { delete b.slots[slot]; return b })}
            onClearAll={() => patch((b) => { b.slots = {}; delete b.swaps; delete b.swapSide; return b })}
            onOpen={setEditing}
            onSwitch={(slot) => patch((b) => toggleSwitch(b, slot))}
            onSeals={(sys, ids) => patch((b) => { b.seals = { ...(b.seals ?? {}), [sys]: ids }; return b })}
          />
          <small className="dim" style={{ display: 'block', margin: '8px 0 10px' }}>Click a slot to change the item, cards and random options.</small>
          <div className="eq-window bd-window open">
            <div className="eq-title"><span>≡</span> Breakdown</div>
            <Breakdown build={build} sheet={sheet} />
          </div>
        </section>

      </main>
      )}
      {tab === 'planner' && editing && (
        <SlotModal
          build={build}
          slot={editing}
          onClose={closeModal}
          onItem={(id) => setItem(editing, id)}
          onCard={(ci, id) => setCard(editing, ci, id)}
          onRefine={(r) => setRefine(editing, r)}
          onOpt={(li, p) => setOpt(editing, li, p)}
          onDream={(id) => setDream(editing, id)}
        />
      )}
    </div></TooltipHost>
  )
}
