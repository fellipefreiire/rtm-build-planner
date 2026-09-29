'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Build, SlotId, StatKey } from '@/lib/types'
import { byId, classByName, classes, skillByKey } from '@/lib/data'
import { buildFromJson, buildToJson, decodeBuild, emptyBuild, isDecodeError, toggleSwitch } from '@/lib/build-url'

const STORAGE_KEY = 'rtm-planner:build'
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
import { K_TAB } from '@/lib/sim-store'

export default function Page() {
  const [build, setBuild] = useState<Build>(() => emptyBuild('Revenant'))
  /** slot open in the edit modal */
  const [editing, setEditing] = useState<SlotId | null>(null)
  const [tab, setTab] = useState<'planner' | 'sim'>('planner')
  useEffect(() => {
    try { if (localStorage.getItem(K_TAB) === 'sim') setTab('sim') } catch { /* no storage */ }
  }, [])
  const openTab = (t: 'planner' | 'sim') => { setTab(t); try { localStorage.setItem(K_TAB, t) } catch { /* no storage */ } }
  const [toggles, setToggles] = useState<Record<string, boolean>>({})

  // --- state saved in the browser as JSON (2026-09-28: replaces the URL) ---
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    // old link with a #hash: import once and clear the URL
    const h = window.location.hash.slice(1)
    let b: Build | null = null
    if (h) {
      const d = decodeBuild(h)
      if (isDecodeError(d)) console.warn('build in URL discarded:', d.detail)
      else b = d
      window.history.replaceState(null, '', window.location.pathname)
    }
    if (!b) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const d = buildFromJson(raw)
          if (isDecodeError(d)) console.warn('saved build discarded:', d.detail)
          else b = d
        }
      } catch { /* browser without storage: keep the empty build */ }
    }
    if (b) setBuild(b)
    setLoaded(true)
  }, [])
  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(STORAGE_KEY, buildToJson(build)) } catch { /* no storage */ }
  }, [build, loaded])

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
          <button onClick={exportJson} title="copy the build as JSON">Export JSON</button>
          <button onClick={importJson} title="paste a JSON or an old link">Import</button>
        </span>
      </header>

      {tab === 'sim' ? <Simulator build={build} onSwitch={(slot) => patch((b) => toggleSwitch(b, slot))} /> : (
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
          />
        </section>

        <section className="col center">
          <EquipWindow
            build={build}
            active={editing}
            onClear={(slot) => patch((b) => { delete b.slots[slot]; return b })}
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
