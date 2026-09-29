'use client'
import { Build, ClassInfo, StatKey, STATS } from '@/lib/types'
import { StatSheet } from '@/lib/engine/sheet'
import { pointBudget, statCost, STAT_LABEL } from '@/lib/rules/server'

const int = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

type Props = {
  build: Build
  sheet: StatSheet
  classes: ClassInfo[]
  onStat: (s: StatKey, v: number) => void
  onPoints: (v: number | null) => void
  onPatch: (f: (b: Build) => Build) => void
}

/** One cell in the game's status format: `base + gear`. */
function Pair({ k, v }: { k: string; v: { base: number | null; gear: number; why: string } }) {
  return (
    <div className="st-cell" title={v.why}>
      <span className="st-k">{k}</span>
      <span className="st-v">
        {v.base == null
          ? <span className="dim" title={v.why}>?</span>
          : int(v.base)}
        {v.gear ? <span className="st-plus"> + {int(v.gear)}</span> : null}
      </span>
    </div>
  )
}

export default function StatusWindow({ build, sheet, classes, onStat, onPoints, onPatch }: Props) {
  const auto = pointBudget(build.baseLv).v
  const cap = build.points ?? auto
  const remaining = cap - sheet.budget.spent

  const add = (s: StatKey, delta: number) => {
    const next = build.stats[s] + delta
    if (next < 1 || next > 99) return
    onStat(s, next)
  }

  return (
    <div className="eq-window st-window">
      <div className="eq-title"><span>◈</span> Status</div>

      <div className="st-who">
        <select
          className="st-class"
          value={build.cls}
          onChange={(e) => onPatch((b) => {
            b.cls = e.target.value
            b.skillKey = null
            return b
          })}
        >
          {classes.map((c) => (
            <option key={c.name} value={c.name}>{c.name}{c.calibrated ? ' ✓' : ''}</option>
          ))}
        </select>
        <label>
          <span className="bb-k">Base Lv</span>
          <input
            type="number" min={1} max={150} value={build.baseLv}
            onChange={(e) => onPatch((b) => { b.baseLv = Number(e.target.value); return b })}
            style={{ width: '4rem' }}
          />
        </label>
        <label title="recorded on the build; no formula in the knowledge base uses job level yet">
          <span className="bb-k">Job Lv</span>
          <input
            type="number" min={1} max={99} value={build.jobLv}
            onChange={(e) => onPatch((b) => { b.jobLv = Number(e.target.value); return b })}
            style={{ width: '4rem' }}
          />
        </label>
        <span className="st-pool" title={sheet.maxHp?.from.join(' · ') ?? 'class has no HP table in the emulator'}>
          <span className="bb-k">HP</span> <b>{sheet.maxHp ? int(sheet.maxHp.v) : '?'}</b>
        </span>
        <span className="st-pool" title={sheet.maxSp?.from.join(' · ') ?? 'class has no SP table in the emulator'}>
          <span className="bb-k">SP</span> <b>{sheet.maxSp ? int(sheet.maxSp.v) : '?'}</b>
        </span>
      </div>

      <div className="st-grid">
        {/* ---- primary stats ---- */}
        <div className="st-stats">
          {STATS.map((s) => {
            const base = build.stats[s]
            const gear = sheet.stats[s] - base
            const cost = base < 99 ? statCost(base + 1) : null
            const canRaise = cost != null && cost <= remaining
            return (
              <div className="st-row" key={s}>
                <span className="st-name">{STAT_LABEL[s]}</span>
                <input
                  className="st-base"
                  type="number"
                  min={1}
                  max={99}
                  value={base}
                  onChange={(e) => onStat(s, Math.max(1, Math.min(99, Number(e.target.value))))}
                />
                <span className={`st-gear ${gear < 0 ? 'neg' : ''}`}>{gear ? (gear > 0 ? `+${gear}` : `${gear}`) : ''}</span>
                <button
                  className="st-minus"
                  onClick={() => add(s, -1)}
                  disabled={base <= 1}
                  title="remove 1 point"
                >−</button>
                <button
                  className={`st-cost ${canRaise ? '' : 'off'}`}
                  onClick={() => add(s, 1)}
                  disabled={!canRaise}
                  title={cost == null ? 'maxed' : `next point costs ${cost}`}
                >{cost ?? '—'}</button>
              </div>
            )
          })}
        </div>

        {/* ---- derived: the same fields as the in-game status window ---- */}
        <div className="st-derived">
          <Pair k="Atk" v={sheet.split.atk} />
          <Pair k="Def" v={sheet.split.def} />
          <Pair k="Matk" v={sheet.split.matk} />
          <Pair k="Mdef" v={sheet.split.mdef} />
          <Pair k="Hit" v={sheet.split.hit} />
          <Pair k="Flee" v={sheet.split.flee} />
          <Pair k="Critical" v={sheet.split.crit} />
          <Pair k="Aspd" v={sheet.split.aspd} />
          <div className="st-cell wide">
            <span className="st-k">Status Point</span>
            <span className={`st-v ${remaining < 0 ? 'bad' : remaining === 0 ? 'ok' : ''}`}>
              <b>{remaining}</b>
              <small> of </small>
              <input
                className="st-cap"
                type="number"
                value={cap}
                onChange={(e) => onPoints(Number(e.target.value) === auto ? null : Number(e.target.value))}
              />
            </span>
          </div>
        </div>
      </div>
      {!sheet.calibrated && (
        <div className="raw" style={{ margin: '0 12px 12px' }}>
          <b className="bad">{sheet.cls} has no calibrated model.</b> These numbers come from the
          dump formulas, with no in-game measurement backing them.
        </div>
      )}

    </div>
  )
}
