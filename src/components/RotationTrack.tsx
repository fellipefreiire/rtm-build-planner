'use client'
import { Skill } from '@/lib/types'
import { RotationResult } from '@/lib/engine/rotation'
import { LaneDef, LaneSpan } from '@/lib/rules/rotation'

const PX = 90 // pixels per second
const HP_H = 44 // height of the HP lane
/** y of an HP % inside the HP lane (100% at the top) */
const yHp = (pct: number) => 3 + (1 - Math.max(0, Math.min(100, pct)) / 100) * (HP_H - 6)
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
// SP lane: the curve on top, the per-cast labels below on two alternating rows so they do not overlap
const SP_H = 78
const SP_CURVE = 40
const ySp = (v: number, max: number) => 3 + (1 - Math.max(0, Math.min(1, max > 0 ? v / max : 0))) * (SP_CURVE - 6)
const SH_H = 44
const ySh = (v: number, max: number) => 3 + (1 - Math.max(0, Math.min(1, max > 0 ? v / max : 0))) * (SH_H - 6)

/** which value lanes are shown */
export type ValueLanes = { hp: boolean; sp: boolean; shield: boolean }

/**
 * Rotation on a time axis: one lane with the skills (from start to end of cast + delay)
 * and the class's state lanes (Revenant: Combo Ready, Finisher Ready and Overslash stacks;
 * Dark Knight: Combo Ready), showing where each one starts and ends.
 */
export default function RotationTrack({ rot, skills, lanes, show, onRemove }: {
  rot: RotationResult
  skills: Map<string, Skill>
  lanes: LaneDef[]
  show: ValueLanes
  onRemove: (i: number) => void
}) {
  const showShield = show.shield && !!rot.shield
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
        {show.hp && <div className="tr-label hp">HP</div>}
        {show.sp && <div className="tr-label sp">SP</div>}
        {showShield && <div className="tr-label shield">Shield</div>}
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
                  title={`${e.name} Lv${e.lv} · ${e.start.toFixed(2)}s → ${e.end.toFixed(2)}s${e.damage ? ` · ${fmt(e.damage)}` : ''}${e.notes.length ? ` · ${e.notes.join(' · ')}` : ''}`}>
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
          {show.hp && <div className="tr-row hp" title={`HP over the rotation: skill costs, leech (power ${rot.hp.leechPower}%, chance ${Math.round(rot.hp.leechChance * 100)}%) and natural regen ${Math.round(rot.hp.regenPerSec)} HP/s`}>
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
          </div>}
          {show.sp && (
            <div className="tr-row sp" title={`SP over the rotation: cost of each skill and RTM regen — ${rot.sp.natural} SP every 1.2 s + ${rot.sp.isr} SP every 4.5 s (Increase SP Recovery) ≈ ${rot.sp.perSec.toFixed(1)} SP/s. MaxSP ${fmt(rot.sp.max)}`}>
              {ticks.map((t) => <span key={t} className="grid" style={{ left: x(t) }} />)}
              <svg width={width} height={SP_H} className="hp-svg">
                <line x1={0} x2={width} y1={SP_CURVE} y2={SP_CURVE} className="sp-base" />
                <polyline points={rot.sp.series.map((p) => `${x(p.t)},${ySp(p.v, rot.sp.max)}`).join(' ')} className="sp-line" />
                {rot.events.map((e, i) => {
                  const row = i % 2 === 0 ? SP_CURVE + 15 : SP_CURVE + 31
                  const why = `${e.name} at ${e.start.toFixed(2)}s · SP ${fmt(e.sp.before)} − ${fmt(e.sp.cost)}`
                    + (e.sp.pctPart ? ` (${fmt(e.sp.flat)} flat + ${fmt(e.sp.pctPart)} from % of current SP)` : '')
                    + ` = ${fmt(e.sp.after)}${e.waitedSp > 0 ? ` · waited ${e.waitedSp.toFixed(1)} s for SP` : ''}`
                  return (
                    <g key={i}>
                      <title>{why}</title>
                      <circle cx={x(e.start)} cy={ySp(e.sp.after, rot.sp.max)} r={3} className={`sp-dot ${e.waitedSp > 0 ? 'wait' : ''}`} />
                      <line x1={x(e.start)} x2={x(e.start)} y1={SP_CURVE} y2={row - 9} className="sp-tick" />
                      <text x={x(e.start) + 2} y={row} className="sp-txt">
                        <tspan className="sp-cost">−{fmt(e.sp.cost)}</tspan>
                        <tspan className="sp-left" dx={3}>{fmt(e.sp.after)}</tspan>
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          )}
          {showShield && rot.shield && (
            <div className="tr-row shield" title={`Absorb shield: leech beyond MaxHP, up to ${fmt(rot.shield.max)} (MaxHP + Ominous Presence). Decay over time is not modeled.`}>
              {ticks.map((t) => <span key={t} className="grid" style={{ left: x(t) }} />)}
              <svg width={width} height={SH_H} className="hp-svg">
                <polyline points={rot.shield.series.map((p) => `${x(p.t)},${ySh(p.v, rot.shield!.max)}`).join(' ')} className="sh-line" />
                {rot.events.map((e, i) => {
                  const prev = i > 0 ? rot.events[i - 1].shield : 0
                  if (e.shield === prev) return null
                  return (
                    <g key={i}>
                      <circle cx={x(e.start)} cy={ySh(e.shield, rot.shield!.max)} r={3} className="sh-dot" />
                      <text x={x(e.start) + 4} y={Math.max(9, ySh(e.shield, rot.shield!.max) - 3)} className="hp-txt">{fmt(e.shield)}</text>
                    </g>
                  )
                })}
              </svg>
            </div>
          )}
          {lanes.map((l) => <div key={l.id} className="tr-row">{bars(rot.lanes[l.id] ?? [], l.cls, l.short)}</div>)}
        </div>
      </div>
    </div>
  )
}
