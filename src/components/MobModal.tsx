'use client'
import { useEffect, useMemo, useState } from 'react'
import { Mob } from '@/lib/types'
import { mobs } from '@/lib/data'

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

/** Mob list to pick the target. Search by name, MVP filter, sorted by level. */
export default function MobModal({ current, onPick, onClose }: {
  current: string
  onPick: (m: Mob) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [onlyMvp, setOnlyMvp] = useState(false)

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    return mobs
      .filter((m) => (!n || m.name.toLowerCase().includes(n)) && (!onlyMvp || m.mvp))
      .sort((a, b) => b.lv - a.lv || a.name.localeCompare(b.name))
      .slice(0, 300)
  }, [q, onlyMvp])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal mob-modal" role="dialog" aria-label="Pick target">
        <div className="modal-head">
          <div className="modal-title"><small>Target</small><div>{current}</div></div>
          <button className="drawer-close" onClick={onClose} title="close (Esc)">×</button>
        </div>
        <div className="mob-filters">
          <input autoFocus placeholder="search mob…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="sim-chk"><input type="checkbox" checked={onlyMvp} onChange={(e) => setOnlyMvp(e.target.checked)} /> MVP only</label>
          <small>{list.length}{list.length === 300 ? '+' : ''} mobs</small>
        </div>
        <div className="modal-body">
          <div className="scroll-list">
            <table className="sim-table mob-table">
              <thead><tr><th>Mob</th><th>Lv</th><th>Element</th><th>Race</th><th>Size</th><th>HP</th><th>DEF</th><th>LUK</th></tr></thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id} className={m.name === current ? 'on' : ''} onClick={() => { onPick(m); onClose() }}>
                    <td>{m.name}{m.mvp ? <span className="pill" style={{ marginLeft: 6 }}>MVP</span> : null}</td>
                    <td>{m.lv}</td>
                    <td>{m.element} {m.elv}</td>
                    <td>{m.race}</td>
                    <td>{m.size}</td>
                    <td>{fmt(m.hp)}</td>
                    <td>{m.def}</td>
                    <td>{m.stats?.[5] ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
