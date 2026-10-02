'use client'
import { useMemo, useState } from 'react'
import { Item, SlotId, SLOTS } from '@/lib/types'
import { cardsForSlot, itemsForSlot } from '@/lib/data'
import ItemIcon from './ItemIcon'
import { effectLines } from './tips'

type Props = {
  cls: string
  target: { slot: SlotId; cardIndex: number | null }
  currentId: number | null
  onChoose: (itemId: number | null) => void
}

export default function ItemPicker({ cls, target, currentId, onChoose }: Props) {
  const [q, setQ] = useState('')
  const slot = SLOTS.find((s) => s.id === target.slot)!
  const isCard = target.cardIndex !== null

  // always filtered by class — no reason to offer gear the class cannot use
  const pool: Item[] = useMemo(
    () => (isCard ? cardsForSlot(slot.from) : itemsForSlot(slot.from, cls, true, slot.id)),
    [isCard, slot.from, slot.id, cls],
  )

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const base = needle ? pool.filter((i) => i.name.toLowerCase().includes(needle)) : pool
    return [...base]
      .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name))
      .slice(0, 60)
  }, [pool, q])

  return (
    <>
      <h2>
        {isCard ? `Card ${target.cardIndex! + 1}` : 'Swap'}: {slot.label}
      </h2>
      <input
        placeholder="search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: '100%', marginBottom: 7 }}
      />
      <div className="scroll-list" style={{ marginTop: 8 }}>
        {currentId != null && (
          <div className="card pick-row" onClick={() => onChoose(null)}>
            <ItemIcon item={undefined} size={72} />
            <div className="pick-info">
              <div className="pick-name"><b>— leave empty —</b></div>
              <small>clears this {isCard ? 'card socket' : 'slot'}</small>
            </div>
          </div>
        )}
        {list.map((i) => (
          <div
            key={i.id}
            className={`card pick-row ${i.id === currentId ? 'on' : ''}`}
            onClick={() => onChoose(i.id)}
          >
            <ItemIcon item={i} size={72} art />
            <div className="pick-info">
              <div className="pick-name">
                <b>{target.slot === 'pet' ? i.name.replace(/ Egg$/, '') : i.name}</b>
                {i.id === currentId && <span className="pill">equipped</span>}
              </div>
              <small>
                {i.cat}{i.lv ? ` · lv ${i.lv}` : ''}
                {i.cardSlots ? ` · ${i.cardSlots}× card` : ''}
                {i.twoHanded ? ' · two-handed' : ''}
                {i.weight ? ` · weight ${i.weight}` : ''}
              </small>
              {(i.atk > 0 || i.def > 0 || i.mdef > 0) && (
                <div className="pick-base">
                  {i.atk > 0 && <span className="pill">ATK {i.atk}</span>}
                  {i.matk > 0 && <span className="pill">MATK {i.matk}</span>}
                  {i.def > 0 && <span className="pill">DEF {i.def}</span>}
                  {i.mdef > 0 && <span className="pill">MDEF {i.mdef}</span>}
                </div>
              )}
              {(() => {
                const lines = effectLines(i)
                return lines.length > 0 && (
                  <div className="pick-mods">
                    {lines.slice(0, 6).map((m, k) => (
                      <div key={k}>
                        {m.text}
                        {m.cond && <span className="dim"> · {m.cond}</span>}
                      </div>
                    ))}
                    {lines.length > 6 && <div className="dim">+{lines.length - 6} effect(s)</div>}
                  </div>
                )
              })()}
              {i.unparsed.length > 0 && (
                <small className="warn">{i.unparsed.length} effect(s) the engine does not apply</small>
              )}
            </div>
          </div>
        ))}
        {list.length === 0 && <small>Nothing found for this slot.</small>}
      </div>
      <small>
        {pool.length} {isCard ? 'cards' : `items ${cls} can equip`} in this slot · showing {list.length}, by type and name
        {list.length < pool.length && ' · use the search for the rest'}
      </small>
    </>
  )
}
