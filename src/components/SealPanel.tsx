'use client'
import { Build } from '@/lib/types'
import { byId } from '@/lib/data'
import { SealSystem, TEMPLES, sealResult } from '@/lib/rules/seals'

/**
 * Equipment seals tab: 8 marks, up to 4 engraved. Shows the sockets, the mark grid
 * (like the rtm-database.pages.dev/seals page) and what the engraving grants.
 */
export default function SealPanel({ build, system, onChange }: {
  build: Build
  system: SealSystem
  onChange: (ids: string[]) => void
}) {
  const t = TEMPLES[system]
  const sel = build.seals?.[system] ?? []
  const host = build.slots[t.slot]
  const hostItem = host ? byId.get(host.id) : undefined
  const res = sealResult(system, sel)
  const toggle = (id: string) => onChange(sel.includes(id) ? sel.filter((x) => x !== id) : sel.length < 4 ? [...sel, id] : sel)

  return (
    <div className={`seal-panel ${system}`}>
      <div className="seal-host">
        {hostItem
          ? <small>Engraved on <b>{hostItem.name}</b> ({t.slot === 'rune' ? 'rune' : 'manual/tome'})</small>
          : <small className="warn">No {t.slot === 'rune' ? 'rune' : 'manual/tome'} equipped: the engraving is not counted.</small>}
        {sel.length > 0 && <button className="link-btn" style={{ padding: 0 }} onClick={() => onChange([])}>clear</button>}
      </div>

      <div className="seal-socks">
        {[0, 1, 2, 3].map((i) => {
          const mk = t.marks.find((x) => x.id === sel[i])
          return (
            <button key={i} className={`sock ${mk ? 'filled' : ''}`} disabled={!mk} onClick={() => mk && toggle(mk.id)} title={mk ? `${mk.name} · remove` : 'empty'}>
              {mk?.glyph ?? ''}
            </button>
          )
        })}
      </div>

      <div className="seal-grid">
        {t.marks.map((mk) => (
          <button key={mk.id} className={`seal-mark ${sel.includes(mk.id) ? 'sel' : ''}`} onClick={() => toggle(mk.id)}
            disabled={!sel.includes(mk.id) && sel.length >= 4}>
            <span className="sm-g">{mk.glyph}</span>
            <span className="sm-n">{mk.name}</span>
            <span className="sm-s">{mk.stat}</span>
            <span className={`sm-d d-${mk.dom}`}>{t.domNames[mk.dom]}</span>
          </button>
        ))}
      </div>

      <div className="seal-out">
        {res.lines.length === 0 && <small>Engrave up to 4 marks. Two of the same domain = Pair Word · two complete domains = Legendary · one of each = Balance.</small>}
        {res.lines.map((l, i) => (
          <div key={i} className={`seal-line ${l.tier === 'Legendary' ? 'legend' : ''} ${l.applied ? '' : 'off'}`}>
            <span className="sl-tier">{l.tier}</span>
            {l.word && <b className="sl-word">{l.word}</b>}
            <span>{l.text}</span>
            {!l.applied && <span className="dim"> · not counted</span>}
          </div>
        ))}
        {sel.length > 0 && sel.length < 4 && <small className="dim">With 4 marks the crown (Focus, Legendary or Balance) and the support from the loose marks apply.</small>}
      </div>
    </div>
  )
}
