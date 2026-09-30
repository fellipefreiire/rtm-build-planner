'use client'
import { Skill } from '@/lib/types'
import { RotationResult } from '@/lib/engine/rotation'
import { LaneDef, LaneSpan } from '@/lib/rules/rotation'

const PX = 90 // pixels per second
const HP_H = 44 // height of the HP lane
/** y of an HP % inside the HP lane (100% at the top) */
const yHp = (pct: number) => 3 + (1 - Math.max(0, Math.min(100, pct)) / 100) * (HP_H - 6)
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

/**
 * Rotation on a time axis: one lane with the skills (from start to end of cast + delay)
 * and the class's state lanes (Revenant: Combo Ready, Finisher Ready and Overslash stacks;
 * Dark Knight: Combo Ready), showing where each one starts and ends.
 */
export default function RotationTrack({ rot, skills, lanes, onRemove }: {
  rot: RotationResult
  skills: Map<string, Skill>
  lanes: LaneDef[]
  onRemove: (i: number) => void
}) {
  const ends = [rot.duration, ...lanes.flatMap((l) => (rot.lanes[l.id] ?? []).map((x) => x.to))]
  const total = Math.max(1, ...ends) + 0.5
  const width = Math.ceil(total * PX)
  const x = (t: number) => t * PX
  const ticks = Array.from({ length: Math.floor(total) + 1 }, (_, i) => i)
  // autocasts fire at the start of the step that triggers them: same skill at the same moment becomes one icon "×N"
  const autos = rot.events.flatMap((e) => {
    const groups: { skill: string; name: string; start: number; n: number; damage: number; by: string }[] = []
    for (const a of e.autocasts) {
      const g = groups.find((x) => x.skill === a.skill)
      if (g) { g.n++; g.damage += a.damage }
      else groups.push({ skill: a.skill, name: a.name, start: a.start, n: 1, damage: a.damage, by: e.name })
    }
    // several skills from the same step sit side by side
    return groups.map((g, i) => ({ ...g, offset: i * 30 }))
  })

  // counted lanes (Overslash) get darker with more stacks
  const bars = (list: LaneSpan[], cls: string, label: (s: LaneSpan) => string) =>
    list.map((s, i) => (
      <div key={i} className={`tr-bar ${cls}`}
        style={{ left: x(s.from), width: Math.max(4, x(s.to - s.from)), ...(s.stacks != null ? { opacity: 0.45 + 0.11 * s.stacks } : {}) }}
        title={`${s.stacks != null ? `${s.stacks} stack(s)` : label(s)} · ${s.from.toFixed(1)}s → ${s.to.toFixed(1)}s (${(s.to - s.from).toFixed(1)}s)`}>
        <span>{label(s)}</span>
      </div>
    ))

  return (
    <div className="track">
      <div className="track-labels">
        <div className="tr-label ruler" />
        <div className="tr-label">Skills</div>
        {autos.length > 0 && <div className="tr-label">Autocast</div>}
        <div className="tr-label hp">HP</div>
        {lanes.map((l) => <div key={l.id} className="tr-label">{l.label}</div>)}
      </div>
      <div className="track-scroll">
        <div className="track-area" style={{ width }}>
          <div className="tr-row ruler">
            {ticks.map((t) => <span key={t} className="tick" style={{ left: x(t) }}>{t}s</span>)}
          </div>
          <div className="tr-row skills">
            {ticks.map((t) => <span key={t} className="grid" style={{ left: x(t) }} />)}
            {rot.events.map((e, i) => {
              const s = skills.get(e.skill)
              return (
                <div key={i} className={`tr-skill ${e.damage ? '' : 'zero'}`} style={{ left: x(e.start), width: Math.max(26, x(e.end - e.start)) }}
                  title={`${e.name} · ${e.start.toFixed(2)}s → ${e.end.toFixed(2)}s${e.damage ? ` · ${fmt(e.damage)}` : ''}${e.hits > 1 ? ` · ${e.hits} hits` : ''}${e.notes.length ? ` · ${e.notes.join(' · ')}` : ''}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s?.icon ? <img src={`skills/${s.icon}.png`} alt="" width={20} height={20} /> : <span className="dot" />}
                  <button className="tr-x" title="remove" onClick={() => onRemove(i)}>×</button>
                </div>
              )
            })}
          </div>
          {autos.length > 0 && (
            <div className="tr-row">
              {ticks.map((t) => <span key={t} className="grid" style={{ left: x(t) }} />)}
              {autos.map((a, i) => {
                const s = skills.get(a.skill)
                return (
                  <div key={i} className="tr-skill auto" style={{ left: x(a.start) + a.offset }}
                    title={`${a.name}${a.n > 1 ? ` ×${a.n}` : ''} · autocast by ${a.by} at ${a.start.toFixed(2)}s${a.damage ? ` · ${fmt(a.damage)}` : ''}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {s?.icon ? <img src={`skills/${s.icon}.png`} alt="" width={20} height={20} /> : <span className="dot" />}
                    {a.n > 1 && <span className="tr-n">×{a.n}</span>}
                  </div>
                )
              })}
            </div>
          )}
          <div className="tr-row hp" title={`HP over the rotation: skill costs, leech (power ${rot.hp.leechPower}%, chance ${Math.round(rot.hp.leechChance * 100)}%) and natural regen ${Math.round(rot.hp.regenPerSec)} HP/s`}>
            {ticks.map((t) => <span key={t} className="grid" style={{ left: x(t) }} />)}
            <svg width={width} height={HP_H} className="hp-svg">
              <line x1={0} x2={width} y1={yHp(50)} y2={yHp(50)} className="hp-mid" />
              <polyline points={rot.hp.series.map((p) => `${x(p.t)},${yHp(p.pct)}`).join(' ')} className="hp-line" />
              {rot.events.map((e, i) => {
                const pct = rot.hp.max ? (e.hp.hit / rot.hp.max) * 100 : 100
                return (
                  <g key={i}>
                    <circle cx={x(e.start)} cy={yHp(pct)} r={3} className="hp-dot" />
                    <text x={x(e.start) + 4} y={Math.max(9, yHp(pct) - 3)} className="hp-txt">{Math.round(pct)}%</text>
                  </g>
                )
              })}
            </svg>
          </div>
          {lanes.map((l) => <div key={l.id} className="tr-row">{bars(rot.lanes[l.id] ?? [], l.cls, l.short)}</div>)}
        </div>
      </div>
    </div>
  )
}
