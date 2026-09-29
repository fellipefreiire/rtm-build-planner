'use client'
import { Build, SLOTS } from '@/lib/types'
import { StatSheet } from '@/lib/engine/sheet'
import { Encounter } from '@/lib/engine/simulate'
import { byId } from '@/lib/data'

const int = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })
const pctDelta = (a: number, b: number) => (a === 0 ? null : (b / a - 1) * 100)

type Side = { build: Build; sheet: StatSheet; enc: Encounter }

export default function ComparePanel({ a, b, onSnapshot, onSwap }: {
  a: Side; b: Side | null; onSnapshot: () => void; onSwap: () => void
}) {
  if (!b) {
    return (
      <>
        <h2>Compare</h2>
        <small>Save the current build as “before”, change whatever you want and come back here to see the delta.</small>
        <div style={{ marginTop: 8 }}>
          <button className="primary" onClick={onSnapshot}>save current build as “before”</button>
        </div>
      </>
    )
  }

  const rows: [string, number, number, boolean][] = [
    ['Damage index', b.enc.index, a.enc.index, true],
    ['ATK', b.sheet.atk.v, a.sheet.atk.v, true],
    ['Skill %', b.sheet.skillPct?.v ?? 0, a.sheet.skillPct?.v ?? 0, true],
    ['Critical', b.sheet.critRate.v, a.sheet.critRate.v, true],
    ['Def Pen', b.sheet.defPen.v, a.sheet.defPen.v, true],
    ['Perfect Dodge', b.sheet.perfectDodge.v, a.sheet.perfectDodge.v, true],
    ['DEF', b.sheet.def.v, a.sheet.def.v, true],
    ['MDEF', b.sheet.mdef.v, a.sheet.mdef.v, true],
    ['Physical reduction %', b.enc.incoming.reductionPhysical * 100, a.enc.incoming.reductionPhysical * 100, true],
    ['eHP', b.enc.ehp?.v ?? 0, a.enc.ehp?.v ?? 0, true],
  ]

  const diffs = SLOTS.map((s) => {
    const x = b.build.slots[s.id]
    const y = a.build.slots[s.id]
    const nx = x ? byId.get(x.id)?.name : null
    const ny = y ? byId.get(y.id)?.name : null
    const same = nx === ny && (x?.refine ?? 0) === (y?.refine ?? 0)
        && JSON.stringify(x?.cards ?? []) === JSON.stringify(y?.cards ?? [])
    return same ? null : { slot: s.label, before: nx, after: ny, rx: x?.refine ?? 0, ry: y?.refine ?? 0 }
  }).filter(Boolean) as { slot: string; before: string | null; after: string | null; rx: number; ry: number }[]

  return (
    <>
      <h2>Compare</h2>
      <button onClick={onSnapshot}>redo the “before”</button>{' '}
      <button onClick={onSwap}>swap sides</button>

      <h2>Piece-by-piece difference <span className="dim">({diffs.length})</span></h2>
      {diffs.length === 0 && <small>The two builds are identical.</small>}
      <table>
        <tbody>
          {diffs.map((d) => (
            <tr key={d.slot}>
              <td className="slot-name">{d.slot}</td>
              <td><small className="dim">{d.before ?? 'empty'} +{d.rx}</small></td>
              <td><small>{d.after ?? 'empty'} +{d.ry}</small></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Result</h2>
      <table>
        <thead><tr><th /><th className="num">before</th><th className="num">now</th><th className="num">Δ</th></tr></thead>
        <tbody>
          {rows.map(([label, before, now]) => {
            const d = pctDelta(before, now)
            return (
              <tr key={label}>
                <td>{label}</td>
                <td className="num dim">{int(before)}</td>
                <td className="num">{int(now)}</td>
                <td className={`num ${d == null ? 'dim' : d > 0.05 ? 'ok' : d < -0.05 ? 'bad' : 'dim'}`}>
                  {d == null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
