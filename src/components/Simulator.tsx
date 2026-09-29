'use client'
import { useEffect, useMemo, useState } from 'react'
import { Build, Skill, SlotId, SLOTS, StatKey, STATS } from '@/lib/types'
import { byId, mobs, skillByKey } from '@/lib/data'
import { ROTATION_SKILLS, runRotation } from '@/lib/engine/rotation'
import { learnedToggles, rulesFor } from '@/lib/rules/classes'
import { SimState, loadSim, saveSim } from '@/lib/sim-store'
import MobModal from './MobModal'
import RotationTrack from './RotationTrack'
import SimStats from './SimStats'
import { computeSheet } from '@/lib/engine/sheet'

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const sec = (n: number) => `${n.toFixed(1)}s`

type Row = { id: string; name: string; build: Build }

function SkillIcon({ s, size = 26 }: { s?: Skill; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return s?.icon ? <img className="sk-icon" src={`skills/${s.icon}.png`} alt="" width={size} height={size} /> : <span className="sk-icon" />
}

export default function Simulator({ build, onSwitch }: { build: Build; onSwitch: (slot: SlotId) => void }) {
  const rules = useMemo(() => rulesFor(build.cls), [build.cls])
  const buffDefaults = useMemo(() => Object.fromEntries(rules.simBuffs.map((t) => [t.id, t.default])), [rules])
  const [sim, setSim] = useState<SimState | null>(null)
  const [mobOpen, setMobOpen] = useState(false)

  useEffect(() => { setSim(loadSim(buffDefaults)) }, [buffDefaults])
  useEffect(() => { if (sim) saveSim(sim) }, [sim])

  // only the Planner build (build comparison was removed from the screen on 2026-09-28)
  const rows: Row[] = useMemo(() => [{ id: 'current', name: 'Current (Build Planner)', build }], [build])

  // palette: rotation skills the current build has learned
  const palette = useMemo(
    () => ROTATION_SKILLS.map((k) => skillByKey.get(k)).filter((s): s is Skill => !!s && (build.skills[s.key] ?? 0) > 0),
    [build.skills],
  )

  const result = useMemo(() => {
    if (!sim) return null
    const mob = mobs.find((m) => m.name === sim.mobName) ?? mobs.find((m) => m.name === 'Average Dummy')!
    const food = sim.food.value ? sim.food : null
    // no calibration: the engine already gives estimated damage (ATK × % × layers), no variance
    const k: number | null = null
    const out = rows.map((r) => ({
      ...r,
      rot: runRotation({
        build: r.build, byId, steps: sim.rotation, skills: skillByKey, rules,
        toggles: learnedToggles(rules, r.build.skills, sim.buffs), food, mob, k,
      }),
    }))
    // current build attributes: bare × with the checked buffs and food
    const roar = skillByKey.get('revenant/roaring-overslash') ?? null
    const cur = { ...build, skillKey: roar?.key ?? null }
    const statsBase = computeSheet(cur, byId, roar, rules, {}, null)
    const statsBuffed = computeSheet(cur, byId, roar, rules, learnedToggles(rules, build.skills, sim.buffs), food)
    return { out, mob, statsBase, statsBuffed }
  }, [sim, rows, rules, build])

  if (!sim || !result) return <div style={{ padding: 20 }}><small>loading…</small></div>
  const set = (f: (s: SimState) => SimState) => setSim((s) => (s ? f(structuredClone(s)) : s))
  const { out, mob, statsBase, statsBuffed } = result
  const first = out[0]

  // slots with a reserve item (switch): the active one and the reserve, on side A or B
  // short name: first word of the item + the distinguishing card (the last one), e.g. "+10 Ominous [Sarah Irine]"
  const nameOf = (e?: { id: number; refine: number; cards: number[] } | null) => {
    const it = e ? byId.get(e.id) : undefined
    if (!it) return null
    const cards = (e!.cards ?? []).filter((c) => c != null).map((c) => byId.get(c)?.name.replace(/ Card$/, '')).filter(Boolean)
    const tag = cards.length ? ` [${cards[cards.length - 1]}]` : ''
    return `${it.refinable && e!.refine ? `+${e!.refine} ` : ''}${it.name.split(' ')[0]}${tag}`
  }
  const switchSlots = SLOTS.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i && build.swaps && m.id in build.swaps)
    .map((m) => ({ slot: m.id, label: m.label, side: build.swapSide?.[m.id] ?? 'A', active: nameOf(build.slots[m.id]), reserve: nameOf(build.swaps?.[m.id]) }))
  // Combo Ready is no longer a buff: it now comes from the rotation
  const buffsShown = rules.simBuffs.filter((t) => t.id !== 'comboReady' && (!t.skill || (build.skills[t.skill] ?? 0) > 0))
  // breakdown rows: every skill that appears in any build, in rotation order
  const skillRows = [...new Set(out.flatMap((r) => r.rot.bySkill.map((b) => b.skill)))]

  return (
    <main className="cols sim">
      {/* ============ inputs ============ */}
      <section className="col left">
        <div className="eq-window sim-box">
          <div className="eq-title"><span>◎</span> Target</div>
          <div className="sim-in">
            <button className="mob-pick" onClick={() => setMobOpen(true)} title="pick another mob">
              <b>{mob.name}</b>{mob.mvp ? <span className="pill" style={{ marginLeft: 6 }}>MVP</span> : null}
              <small>Lv {mob.lv} · {mob.element} {mob.elv} · {mob.race} · {mob.size} · DEF {mob.def} · HP {fmt(mob.hp)}</small>
            </button>
          </div>
        </div>

        <div className="eq-window sim-box">
          <div className="eq-title"><span>⇄</span> Switches</div>
          <div className="sim-in">
            {switchSlots.length === 0 && <small>No switches. In the Build Planner, use a slot's ⇄ to store a reserve item.</small>}
            {switchSlots.map(({ slot, label, side, active, reserve }) => (
              <div key={slot} className="sw-row">
                <span className="sw-slot">{label}</span>
                {(side === 'A' ? [['A', active, true], ['B', reserve, false]] : [['A', reserve, false], ['B', active, true]] as const).map(([l, it, on]) => (
                  <button key={String(l)} className={`sw-opt ${on ? 'on' : ''}`} disabled={!!on} onClick={() => onSwitch(slot)}
                    title={`${it ? String(it) : 'empty'} · ${on ? 'equipped now' : 'click to switch to this one'}`}>
                    <b>{String(l)}</b> {it ? String(it) : <span className="dim">empty</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="eq-window sim-box">
          <div className="eq-title"><span>☰</span> Attributes</div>
          <div className="sim-in" style={{ paddingBottom: 0 }}><small>With the checked buffs and food. On the right, the difference from the bare build.</small></div>
          <SimStats base={statsBase} buffed={statsBuffed} mob={mob} />
        </div>
      </section>

      {/* ============ timeline ============ */}
      <section className="col center">
        <div className="eq-window sim-box">
          <div className="eq-title"><span>✦</span> Buffs</div>
          <div className="sim-in buffs-row">
            {buffsShown.length === 0 && <small>No buff learned in the Skill Tree.</small>}
            {buffsShown.map((t) => (
              <label key={t.id} className="sim-chk" title={t.why}>
                <input type="checkbox" checked={!!sim.buffs[t.id]} onChange={(e) => { const v = e.target.checked; set((s) => { s.buffs[t.id] = v; return s }) }} />
                <span>{t.label}</span>
              </label>
            ))}
            <div className="sim-row">
              <span>Food</span>
              <select value={sim.food.stat} onChange={(e) => { const v = e.target.value as StatKey; set((s) => { s.food.stat = v; return s }) }}>
                {STATS.map((st) => <option key={st} value={st}>{st.toUpperCase()}</option>)}
              </select>
              <input type="number" min={0} max={20} value={sim.food.value} style={{ width: '4em' }}
                onChange={(e) => { const v = Math.max(0, Math.min(20, Number(e.target.value) || 0)); set((s) => { s.food.value = v; return s }) }} />
            </div>
          </div>
        </div>

        <div className="eq-window sim-box">
          <div className="eq-title"><span>✚</span> Skills <small style={{ marginLeft: 8 }}>click to add to the end of the rotation</small></div>
          <div className="palette">
            {palette.length === 0 && <small>No rotation skill learned in the Skill Tree.</small>}
            {palette.map((s) => (
              <button key={s.key} className="pal-skill" title={s.damage?.formulaRaw ?? s.name}
                onClick={() => set((st) => { st.rotation = [...st.rotation, s.key]; return st })}>
                <SkillIcon s={s} /> <span>{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="eq-window sim-box">
          <div className="eq-title">
            <span>⏱</span> Rotation {first ? `· ${first.name}` : ''}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
              {first && <small>{sec(first.rot.duration)} · {fmt(first.rot.total)} · DPS {fmt(first.rot.dps)}</small>}
              {sim.rotation.length > 0 && <button className="link-btn" style={{ padding: 0 }} onClick={() => set((s) => { s.rotation = []; return s })}>clear</button>}
            </span>
          </div>
          {first && sim.rotation.length > 0 && (
            <RotationTrack rot={first.rot} skills={skillByKey}
              onRemove={(i) => set((st) => { st.rotation = st.rotation.filter((_, j) => j !== i); return st })} />
          )}
          <div className="timeline">
            {sim.rotation.length === 0 && <small>Build the rotation by clicking the skills above.</small>}
            {sim.rotation.map((key, i) => {
              const s = skillByKey.get(key)
              const e = first?.rot.events[i]
              return (
                <div key={i} className={`tl-step ${e && !e.damage ? 'zero' : ''}`} title={e?.notes.join(' · ') || undefined}>
                  <div className="tl-head">
                    <span className="tl-t">{e ? sec(e.start) : '—'}</span>
                    <button className="eq-x" title="remove" onClick={() => set((st) => { st.rotation = st.rotation.filter((_, j) => j !== i); return st })}>×</button>
                  </div>
                  <div className="tl-main"><SkillIcon s={s} size={22} /><span>{s?.name ?? key}</span></div>
                  {e && (
                    <div className="tl-tags">
                      {e.comboReady && <span className="tag cr">CR</span>}
                      {e.finisherReady && <span className="tag fr">FR</span>}
                      {(e.stacksBefore > 0 || e.stacksAfter > 0) && <span className="tag st">◆ {e.stacksBefore}→{e.stacksAfter}</span>}
                      {e.hits > 1 && <span className="tag">{e.hits} hits</span>}
                      {e.waitedSp > 0 && <span className="tag sp">SP</span>}
                    </div>
                  )}
                  <div className="tl-dmg">{e ? (e.damage ? fmt(e.damage) : '—') : ''}</div>
                </div>
              )
            })}
          </div>
          <div className="sim-in"><small>CR = Combo Ready · FR = Finisher Ready · ◆ = Overslash stacks before → after · SP = waited to regenerate · time = cast + after cast delay (emu: ACD × (150 − AGI)/150 × gear ACD%). Hover a step to see the notes.</small></div>
        </div>

        <div className="eq-window sim-box">
          <div className="eq-title"><span>≡</span> Breakdown · {mob.name}</div>
          {out.length === 0 ? <div className="sim-in"><small>Select at least one build.</small></div> : (
            <div className="sim-table-wrap">
              <table className="sim-table">
                <thead>
                  <tr><th>Skill</th>{out.map((r) => <th key={r.id} colSpan={3} className="grp">{r.name}</th>)}</tr>
                  <tr><th></th>{out.map((r) => [<th key={r.id + 'c'}>Casts</th>, <th key={r.id + 'p'}>Per cast</th>, <th key={r.id + 't'}>Total</th>])}</tr>
                </thead>
                <tbody>
                  {skillRows.map((sk) => (
                    <tr key={sk}>
                      <td><span className="bd-skill"><SkillIcon s={skillByKey.get(sk)} size={18} /> {skillByKey.get(sk)?.name ?? sk}</span></td>
                      {out.map((r) => {
                        const b = r.rot.bySkill.find((x) => x.skill === sk)
                        const share = b && r.rot.total ? ` (${((b.total / r.rot.total) * 100).toFixed(0)}%)` : ''
                        return [
                          <td key={r.id + 'c'}>{b?.casts ?? 0}</td>,
                          <td key={r.id + 'p'}>{b && b.perCast ? fmt(b.perCast) : '—'}</td>,
                          <td key={r.id + 't'}>{b && b.total ? fmt(b.total) + share : '—'}</td>,
                        ]
                      })}
                    </tr>
                  ))}
                  <tr className="sum"><td>Rotation total</td>{out.map((r) => <td key={r.id} colSpan={3}>{fmt(r.rot.total)}</td>)}</tr>
                  <tr className="sum"><td>Duration</td>{out.map((r) => <td key={r.id} colSpan={3}>{sec(r.rot.duration)}</td>)}</tr>
                  <tr className="sum"><td>DPS</td>{out.map((r) => <td key={r.id} colSpan={3}>{fmt(r.rot.dps)}</td>)}</tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      {mobOpen && <MobModal current={mob.name} onPick={(m) => set((s) => { s.mobName = m.name; return s })} onClose={() => setMobOpen(false)} />}
    </main>
  )
}
