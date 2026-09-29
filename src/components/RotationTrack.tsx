'use client'
import { Skill } from '@/lib/types'
import { RotationResult, Span } from '@/lib/engine/rotation'

const PX = 90 // pixels per second
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

/**
 * Rotation on a time axis: one lane with the skills (from start to end of cast + delay)
 * and state lanes — Combo Ready, Finisher Ready and Overslash stacks — showing
 * where each one starts and ends.
 */
export default function RotationTrack({ rot, skills, onRemove }: {
  rot: RotationResult
  skills: Map<string, Skill>
  onRemove: (i: number) => void
}) {
  const ends = [rot.duration, ...rot.lanes.comboReady.map((x) => x.to), ...rot.lanes.finisherReady.map((x) => x.to), ...rot.lanes.stacks.map((x) => x.to)]
  const total = Math.max(1, ...ends) + 0.5
  const width = Math.ceil(total * PX)
  const x = (t: number) => t * PX
  const ticks = Array.from({ length: Math.floor(total) + 1 }, (_, i) => i)

  const bars = (list: Span[], cls: string, label: (s: Span) => string) =>
    list.map((s, i) => (
      <div key={i} className={`tr-bar ${cls}`} style={{ left: x(s.from), width: Math.max(4, x(s.to - s.from)) }}
        title={`${label(s)} · ${s.from.toFixed(1)}s → ${s.to.toFixed(1)}s (${(s.to - s.from).toFixed(1)}s)`}>
        <span>{label(s)}</span>
      </div>
    ))

  return (
    <div className="track">
      <div className="track-labels">
        <div className="tr-label ruler" />
        <div className="tr-label">Skills</div>
        <div className="tr-label">Combo Ready</div>
        <div className="tr-label">Finisher Ready</div>
        <div className="tr-label">Overslash</div>
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
          <div className="tr-row">{bars(rot.lanes.comboReady, 'cr', () => 'CR')}</div>
          <div className="tr-row">{bars(rot.lanes.finisherReady, 'fr', () => 'FR')}</div>
          <div className="tr-row">{rot.lanes.stacks.map((s, i) => (
            <div key={i} className="tr-bar st" style={{ left: x(s.from), width: Math.max(4, x(s.to - s.from)), opacity: 0.45 + 0.11 * s.stacks }}
              title={`${s.stacks} stack(s) · ${s.from.toFixed(1)}s → ${s.to.toFixed(1)}s`}>
              <span>◆ {s.stacks}</span>
            </div>
          ))}</div>
        </div>
      </div>
    </div>
  )
}
