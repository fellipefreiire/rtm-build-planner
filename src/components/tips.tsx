'use client'
import { Item, Skill } from '@/lib/types'
import ItemIcon from './ItemIcon'

const n = (v: number) => v.toLocaleString('en-US')

/**
 * Effect lines to display: the element the item grants (endow/armor) and the mods,
 * without repeating the same line ("HP/SP +5%" becomes 2 mods, hp and sp, but is a single line).
 */
export function effectLines(item: Item): { text: string; cond: string | null }[] {
  const out: { text: string; cond: string | null }[] = []
  if (item.endow) out.push({ text: item.slots.includes('weapon') && item.grp !== 'Card' ? `${item.endow} element weapon` : `Endow: weapon becomes ${item.endow}`, cond: null })
  if (item.armorEl) out.push({ text: `${item.armorEl} element armor`, cond: null })
  const seen = new Set<string>()
  for (const m of item.mods) {
    const cond = m.cond.t !== 'always' ? m.cond.t.replace(/_/g, ' ') : null
    const k = `${m.src.line}|${m.raw}|${cond}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ text: m.raw, cond })
  }
  return out
}

/** Everything the data knows about the item, including what the engine does NOT apply. */
export function ItemTip({ item, refine }: { item: Item; refine?: number }) {
  const applied = effectLines(item)
  return (
    <div className="tip-item">
      <div className="tip-head">
        <ItemIcon item={item} size={56} art />
        <div>
          <b>{item.name}{refine ? ` +${refine}` : ''}</b>
          <div><small>{item.cat} · {item.grp}{item.lv ? ` · lv ${item.lv}` : ''}</small></div>
          <div><small>
            {item.cardSlots ? `${item.cardSlots}× card · ` : ''}
            {item.refinable ? 'refinable · ' : ''}
            {item.twoHanded ? 'two-handed · ' : ''}
            weight {item.weight}
          </small></div>
        </div>
      </div>

      {(item.atk > 0 || item.matk > 0 || item.def > 0 || item.mdef > 0) && (
        <div className="tip-base">
          {item.atk > 0 && <span className="pill">ATK {n(item.atk)}</span>}
          {item.matk > 0 && <span className="pill">MATK {n(item.matk)}</span>}
          {item.def > 0 && <span className="pill">DEF {n(item.def)}</span>}
          {item.mdef > 0 && <span className="pill">MDEF {n(item.mdef)}</span>}
        </div>
      )}

      {applied.length > 0 && (
        <div className="tip-mods">
          {applied.map((m, i) => (
            <div key={i}>
              {m.text}
              {m.cond && <span className="dim"> · {m.cond}</span>}
            </div>
          ))}
        </div>
      )}

      {item.unparsed.length > 0 && (
        <div className="tip-out">
          <small className="warn">not applied by the engine</small>
          {item.unparsed.slice(0, 6).map((u, i) => <div key={i}>{u.raw}</div>)}
          {item.unparsed.length > 6 && <div className="dim">+{item.unparsed.length - 6} more</div>}
        </div>
      )}

      {item.jobs && <div className="tip-jobs"><small>{item.jobs.join(', ')}</small></div>}
    </div>
  )
}

export function SkillTip({ skill, lv }: { skill: Skill; lv: number }) {
  const spList = Array.isArray(skill.sp) ? skill.sp : null
  const sp = spList ? spList[Math.max(0, lv - 1)] : skill.sp
  const d = skill.damage
  return (
    <div className="tip-item">
      <div className="tip-head">
        {skill.icon
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="sk-icon" src={`skills/${skill.icon}.png`} alt="" width={40} height={40} />
          : <span className="sk-icon" style={{ width: 40, height: 40 }} />}
        <div>
          <b>{skill.name}</b>
          <div><small>{skill.cls} · {skill.tipo ?? 'skill'} · max Lv {skill.maxLv}</small></div>
          <div><small>{skill.classNote ? 'granted by the job change' : `level ${lv} of ${skill.maxLv}`}</small></div>
        </div>
      </div>

      {skill.needs.length > 0 && (
        <div className="tip-base">
          {skill.needs.map((r) => <span className="pill" key={r.name}>{r.name} Lv{r.lv}</span>)}
        </div>
      )}

      {sp ? <div className="tip-base"><span className="pill">{sp} SP{spList ? ` at Lv ${lv || 1}` : ''}</span></div> : null}

      {d && (
        <div className="tip-mods">
          <div><b>{d.formulaRaw}</b></div>
          <div className="dim">
            {d.cooldown != null && `cooldown ${d.cooldown}s · `}
            {d.spPct != null && `${d.spPct}% current SP · `}
            {d.hpPct != null && `${d.hpPct}% current HP · `}
            {d.canCrit ? 'can crit' : 'cannot crit'}{d.magic ? ' · magical' : ''}
          </div>
          {lv > 0 && (
            <div className="ok">
              at Lv {lv}: {n(d.base + d.coefPerLevel * lv)}%
              {d.perStat.map((p) => ` + ${p.pct}% per ${p.stat.toUpperCase()}`).join('')}
            </div>
          )}
        </div>
      )}

      {skill.prose && <div className="tip-out">{skill.prose}</div>}
    </div>
  )
}
