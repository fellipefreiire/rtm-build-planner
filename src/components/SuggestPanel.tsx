'use client'
import { useState } from 'react'
import { Suggestion } from '@/lib/engine/suggest'

type Props = {
  run: () => { list: Suggestion[]; ms: number }
  onApply: (s: Suggestion) => void
}

export default function SuggestPanel({ run, onApply }: Props) {
  const [res, setRes] = useState<{ list: Suggestion[]; ms: number } | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <>
      <h2>Suggester</h2>
      <small>
        Scans the class catalog and measures the gain by recomputing the whole build, piece by piece.
        No heuristics — the ranking falls out of the recomputation.
      </small>
      <div style={{ margin: '8px 0' }}>
        <button
          className="primary"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            setTimeout(() => { setRes(run()); setBusy(false) }, 10)
          }}
        >
          {busy ? 'scanning…' : 'scan catalog'}
        </button>
        {res && <small> {res.list.length} swaps with gain · {res.ms} ms</small>}
      </div>
      {res?.list[0]?.partial && (
        <div className="raw">
          <b>Partial</b> list: the build has an effect the engine did not understand, so the
          estimated gain is incomplete.
        </div>
      )}
      {res && (
        <div className="scroll-list">
          <table>
            <thead>
              <tr><th>Slot</th><th>Swap for</th><th className="num">damage</th><th className="num">eHP</th></tr>
            </thead>
            <tbody>
              {res.list.slice(0, 40).map((s, i) => (
                <tr key={i} onClick={() => onApply(s)} style={{ cursor: 'pointer' }}>
                  <td><small>{s.slotLabel}</small></td>
                  <td>
                    {s.in}
                    {s.out && <><br /><small className="dim">out: {s.out}</small></>}
                  </td>
                  <td className={`num ${s.gainPct > 0 ? 'ok' : 'dim'}`}>
                    {s.gainPct > 0.05 ? `+${s.gainPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className={`num ${(s.ehpPct ?? 0) > 0 ? 'ok' : (s.ehpPct ?? 0) < 0 ? 'bad' : 'dim'}`}>
                    {s.ehpPct != null && Math.abs(s.ehpPct) > 0.05 ? `${s.ehpPct > 0 ? '+' : ''}${s.ehpPct.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
