'use client'
import { Skill } from '@/lib/types'
import { RotationResult } from '@/lib/engine/rotation'
import { LaneDef, LaneSpan } from '@/lib/rules/rotation'

const PX = 90 // pixels per second
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
          {lanes.map((l) => <div key={l.id} className="tr-row">{bars(rot.lanes[l.id] ?? [], l.cls, l.short)}</div>)}
        </div>
      </div>
    </div>
  )
}
