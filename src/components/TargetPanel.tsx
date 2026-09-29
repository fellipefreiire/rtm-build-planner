'use client'
import { Build, Mob } from '@/lib/types'
import { Encounter } from '@/lib/engine/simulate'
import { Num } from './Prov'

const int = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

type Props = {
  build: Build
  mobs: Mob[]
  mob: Mob
  enc: Encounter
  onMob: (id: number) => void
  onAnchor: (dmg: number | null) => void
}

export default function TargetPanel({ build, mobs, mob, enc, onMob, onAnchor }: Props) {
  return (
    <>
      <h2>Target</h2>
      <select value={mob.id} onChange={(e) => onMob(Number(e.target.value))} style={{ width: '100%' }}>
        {mobs.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} — lv {m.lv} · {m.element} {m.elv} · {m.race} {m.size}{m.mvp ? ' · MVP' : ''}
          </option>
        ))}
      </select>
      <table style={{ marginTop: 8 }}>
        <tbody>
          <tr><td>HP</td><td className="num">{int(mob.hp)}</td><td>DEF / MDEF</td><td className="num">{mob.def} / {mob.mdef}</td></tr>
          <tr><td>ATK</td><td className="num">{int(mob.atk)}</td><td>HIT / FLEE</td><td className="num">{mob.hit} / {mob.flee}</td></tr>
        </tbody>
      </table>

      <h2>Your damage</h2>
      {enc.damage ? (
        <div className="big ok"><Num q={enc.damage} fmt={int} /></div>
      ) : (
        <>
          <div className="big dim">index {enc.index.toFixed(1)}</div>
          <div className="raw">
            Without an anchor, the engine only compares builds — the damage model is proportional, not absolute.
            Enter the damage you <b>measured in-game</b> with this build and everything else is shown as
            an absolute number:{' '}
            <input
              type="number"
              placeholder="e.g. 39120"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onAnchor(Number((e.target as HTMLInputElement).value) || null)
              }}
              style={{ width: '6rem' }}
            />{' '}
            <small>press enter to set</small>
          </div>
        </>
      )}
      <table style={{ marginTop: 6 }}>
        <tbody>
          {enc.layers.map((l) => (
            <tr key={l.label}>
              <td>{l.label}</td>
              <td className="num">{l.mult.toLocaleString('en-US', { maximumFractionDigits: 3 })}</td>
              <td className="dim"><small>{l.why}</small></td>
            </tr>
          ))}
        </tbody>
      </table>
      {enc.castsToKill != null && (
        <div className="raw grey">
          Kill: <b>{enc.castsToKill} casts</b>
          {enc.leechPerCast && <> · leech <b>{int(enc.leechPerCast.v)}</b> HP per cast</>}
        </div>
      )}

      <h2>Its damage on you</h2>
      <div className="big"><Num q={enc.incoming.physical} fmt={int} /> <small>physical, from {int(mob.atk)}</small></div>
      <table style={{ marginTop: 6 }}>
        <thead><tr><th>Layer</th><th className="num">×</th><th>source</th></tr></thead>
        <tbody>
          {enc.incoming.layersPhysical.map((l) => (
            <tr key={l.label}>
              <td>{l.label}</td>
              <td className="num">{l.mult.toFixed(3)}</td>
              <td className="dim"><small>{l.why}</small></td>
            </tr>
          ))}
          <tr>
            <td><b>Total physical</b></td>
            <td className="num ok"><b>{(1 - enc.incoming.reductionPhysical).toFixed(3)}</b></td>
            <td className="ok">−{(enc.incoming.reductionPhysical * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td><b>Magical</b></td>
            <td className="num bad"><b>{(1 - enc.incoming.reductionMagical).toFixed(3)}</b></td>
            <td className="bad">−{(enc.incoming.reductionMagical * 100).toFixed(1)}% · PD and Parry do not apply</td>
          </tr>
        </tbody>
      </table>
      {enc.ehp && (
        <div className="row" style={{ marginTop: 8 }}>
          <span className="k"><b>eHP</b></span>
          <span className="num big ok"><Num q={enc.ehp} fmt={int} /></span>
        </div>
      )}
      {enc.notes.map((n, i) => <div className="raw" key={i}>{n}</div>)}
    </>
  )
}
