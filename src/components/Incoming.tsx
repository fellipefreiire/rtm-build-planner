'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Build } from '@/lib/types'
import { mobs } from '@/lib/data'
import { StatSheet } from '@/lib/engine/sheet'
import { IncomingOpts, defaultIncomingOpts, incoming } from '@/lib/engine/incoming'
import MobModal from './MobModal'

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const K_INCOMING = 'rtm-planner:incoming'

type Saved = { mobName: string; opts: IncomingOpts }

const load = (): Saved => {
  const d: Saved = { mobName: 'Ktullanux', opts: defaultIncomingOpts }
  try {
    const s = JSON.parse(localStorage.getItem(K_INCOMING) ?? 'null') as Partial<Saved> | null
    if (s && typeof s === 'object') return { mobName: s.mobName ?? d.mobName, opts: { ...d.opts, ...(s.opts ?? {}) } }
  } catch { /* no storage */ }
  return d
}

const sev = (pct: number | null) => pct == null ? '' : pct >= 50 ? 'bad' : pct >= 20 ? 'warn' : ''

/** Third tab: what each attack of a mob does to the active build, per hit. */
export default function Incoming({ build, sheet }: { build: Build; sheet: StatSheet }) {
  const [st, setSt] = useState<Saved | null>(null)
  const [mobOpen, setMobOpen] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  useEffect(() => { setSt(load()) }, [])
  useEffect(() => { if (st) try { localStorage.setItem(K_INCOMING, JSON.stringify(st)) } catch { /* no storage */ } }, [st])

  const mob = useMemo(() => mobs.find((m) => m.name === st?.mobName) ?? mobs.find((m) => m.name === 'Ktullanux') ?? mobs[0], [st?.mobName])
  const rep = useMemo(() => (st ? incoming(build, sheet, mob, st.opts) : null), [build, sheet, mob, st])
  if (!st || !rep) return <div style={{ padding: 20 }}><small>loading…</small></div>
  const setOpt = (o: Partial<IncomingOpts>) => setSt((s) => (s ? { ...s, opts: { ...s.opts, ...o } } : s))
  const sc = sheet.totals.scoped
  const pct = sheet.totals.pct
  const scopedRes = (k: string) => Object.entries(sc[k] ?? {}).map(([n, v]): [string, number] => [`resist ${n}`, v])
  const resists: [string, number][] = [
    ...scopedRes('resist_element'), ...scopedRes('resist_race'), ...scopedRes('resist_size'),
    ['resist boss', pct.resist_boss ?? 0], ['resist non-boss', pct.resist_nonboss ?? 0],
    ['melee received', pct.resist_melee ?? 0], ['ranged received', pct.resist_long ?? 0],
    ['magic received', pct.resist_matk ?? 0], ['misc received', pct.resist_misc ?? 0],
    ['damage taken', (pct.dmg_taken ?? 0) - (pct.dmg_reduction ?? 0)],
  ]
  const shownRes = resists.filter(([, v]) => v)

  return (
    <main className="cols sim">
      <section className="col left">
        <div className="eq-window sim-box">
          <div className="eq-title"><span>🛡</span> Your defense · active build</div>
          <div className="sim-in">
            <div className="sim-row"><span>HP</span><b>{rep.hp != null ? fmt(rep.hp) : '—'}</b></div>
            <div className="sim-row"><span>DEF</span>{fmt(sheet.def.v)} + {fmt(sheet.split.def.base ?? 0)}</div>
            <div className="sim-row"><span>MDEF</span>{fmt(sheet.mdef.v)} + {fmt(sheet.split.mdef.base ?? 0)}</div>
            <div className="sim-row"><span>Armor</span>{sheet.armorElement.v}</div>
            <div className="sim-row"><span>FLEE · PD</span>{fmt(sheet.flee.v)} · {sheet.perfectDodge.v.toFixed(1)}</div>
            {shownRes.map(([k, v]) => <div key={k} className="sim-row"><span>{k}</span>{v > 0 ? '+' : ''}{v}%</div>)}
            <small>From the Build Planner. Change gear there; this tab follows.</small>
          </div>
        </div>

        <div className="eq-window sim-box">
          <div className="eq-title"><span>◎</span> Mob</div>
          <div className="sim-in">
            <button className="mob-pick" onClick={() => setMobOpen(true)} title="pick another mob">
              <b>{mob.name}</b>{mob.mvp ? <span className="pill" style={{ marginLeft: 6 }}>MVP</span> : null}
              <small>Lv {mob.lv} · {mob.element} {mob.elv} · {mob.race} · {mob.size} · ATK {fmt(mob.atk)} · HIT {mob.hit} · delay {mob.adelay} ms</small>
            </button>
          </div>
        </div>

        <div className="eq-window sim-box">
          <div className="eq-title"><span>⚙</span> Scenario</div>
          <div className="sim-in">
            <label className="sim-row"><span>Roll</span>
              <select value={st.opts.roll} onChange={(e) => setOpt({ roll: e.target.value as IncomingOpts['roll'] })}>
                <option value="avg">average</option><option value="min">minimum</option><option value="max">maximum</option>
              </select>
            </label>
            <label className="sim-row"><span>Distance</span>
              <select value={st.opts.near ? 'near' : 'far'} onChange={(e) => setOpt({ near: e.target.value === 'near' })}>
                <option value="near">within 3 cells (melee)</option><option value="far">farther (ranged)</option>
              </select>
            </label>
            <label className="sim-row"><span>Targets in area</span>
              <input type="number" min={1} max={20} value={st.opts.targets} style={{ width: 60 }}
                onChange={(e) => setOpt({ targets: Math.max(1, Math.min(20, +e.target.value || 1)) })} />
            </label>
            <small>For mobs, melee or ranged depends on the distance, not on the skill (skill.conf skillrange_by_distance). Targets only matter for skills that split their damage (Earthquake).</small>
          </div>
        </div>
      </section>

      <section className="col center" style={{ flex: '1 1 auto' }}>
        <div className="eq-window sim-box">
          <div className="eq-title"><span>⚔</span> Attacks that deal damage · {mob.name}</div>
          <div className="sim-table-wrap">
            <table className="sim-table">
              <thead><tr><th>Attack</th><th>Type</th><th>Element</th><th>When</th><th>Raw</th><th>Final</th><th>% HP</th><th>Dead in</th><th>Hits you</th></tr></thead>
              <tbody>
                {rep.rows.map((r) => (
                  <Fragment key={r.key}>
                    <tr onClick={() => setOpen((o) => ({ ...o, [r.key]: !o[r.key] }))} style={{ cursor: 'pointer' }} title="click to see the layers">
                      <td>{open[r.key] ? '▾' : '▸'} <span title={r.skill ?? undefined}>{r.label}{r.lv ? ` Lv${r.lv}` : ''}</span>{r.hits > 1 ? <span className="tag" style={{ marginLeft: 6 }}>{r.hits} hits</span> : null}</td>
                      <td><span className="pill">{r.kind}{r.kind !== 'magical' ? ` · ${r.range}` : ''}</span></td>
                      <td>{r.element}</td>
                      <td className="dim" style={{ textAlign: 'left' }}>{r.when}</td>
                      <td>{fmt(r.raw)}</td>
                      <td className={sev(r.pctHp)} title={`min ${fmt(r.min)} · max ${fmt(r.max)}`}>{fmt(r.final)}</td>
                      <td className={sev(r.pctHp)}>{r.pctHp != null ? `${r.pctHp.toFixed(1)}%` : '—'}</td>
                      <td className={sev(r.pctHp)}>{r.toDie ?? '—'}</td>
                      <td>{r.hitChance != null ? `${(r.hitChance * 100).toFixed(0)}%` : 'always'}</td>
                    </tr>
                    {open[r.key] && (
                      <tr><td colSpan={9} style={{ textAlign: 'left', background: 'var(--panel)' }}>
                        <table className="sim-table">
                          <tbody>
                            {r.layers.map((l, i) => (
                              <tr key={i}><td style={{ paddingLeft: 24 }}>{l.label}</td><td className="dim" style={{ textAlign: 'left', whiteSpace: 'normal' }}>{l.why}</td>
                                <td>{i === 0 ? fmt(l.mult) : `× ${l.mult.toFixed(3)}`}</td></tr>
                            ))}
                          </tbody>
                        </table>
                        {r.notes.map((n, i) => <small key={i} style={{ display: 'block', paddingLeft: 24 }}>{n}</small>)}
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sim-in"><small>Final = per use, after your DEF/MDEF, armor element and resistances. Dead in = uses from full HP. Hits you = chance to connect (HIT vs FLEE; Perfect Dodge on normal attacks). Click a row for the layers.</small></div>
        </div>

        <div className="eq-window sim-box">
          <div className="eq-title"><span>✦</span> Skills without damage</div>
          <div className="sim-in">
            {rep.passive.length === 0 && <small>{rep.source === 'none' ? 'Unknown: no skill data for this mob.' : 'None.'}</small>}
            {rep.passive.map((p) => (
              <div key={p.key} className="sim-row"><span title={p.skill}>{p.label} Lv{p.lv}</span><small>{p.when} — {p.what}</small></div>
            ))}
          </div>
        </div>

        {rep.notes.map((n, i) => <div key={i} className="sim-note" style={{ marginBottom: 8 }}>{n}</div>)}
      </section>
      {mobOpen && <MobModal current={mob.name} onPick={(m) => setSt((s) => (s ? { ...s, mobName: m.name } : s))} onClose={() => setMobOpen(false)} />}
    </main>
  )
}
