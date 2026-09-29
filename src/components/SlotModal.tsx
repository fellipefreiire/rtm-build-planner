'use client'
import { useEffect, useState } from 'react'
import { Build, SlotId, SLOTS } from '@/lib/types'
import { byId } from '@/lib/data'
import { optionTableFor } from '@/lib/rules/random-options'
import { DREAM_ENCHANTS } from '@/lib/rules/dream-enchants'
import ItemIcon from './ItemIcon'
import ItemPicker from './ItemPicker'
import Stepper from './Stepper'

type Pick = { key: string; v: number } | null

type Props = {
  build: Build
  slot: SlotId
  onClose: () => void
  onItem: (itemId: number | null) => void
  onCard: (cardIndex: number, cardId: number | null) => void
  onRefine: (refine: number) => void
  onOpt: (line: number, pick: Pick) => void
  onDream: (id: string | null) => void
}

type Tab = 'item' | 'cards' | 'opts' | 'dream'

/** Slot editor: change the item, cards and random options. Closes with Esc or by clicking outside. */
export default function SlotModal({ build, slot, onClose, onItem, onCard, onRefine, onOpt, onDream }: Props) {
  const meta = SLOTS.find((s) => s.id === slot)!
  const entry = build.slots[slot]
  const item = entry ? byId.get(entry.id) : undefined
  const table = optionTableFor(item, slot)
  const [tab, setTab] = useState<Tab>(item ? 'cards' : 'item')
  const [socket, setSocket] = useState<number | null>(null)

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  // item changed: go back to the new item's card list
  useEffect(() => { setSocket(null) }, [entry?.id])

  const tabs: { id: Tab; label: string; off: boolean }[] = [
    { id: 'item', label: 'Item', off: false },
    { id: 'cards', label: `Cards${item ? ` (${item.cardSlots})` : ''}`, off: !item || item.cardSlots === 0 },
    { id: 'opts', label: 'Random options', off: !table },
    ...(item?.dreamEnchant ? [{ id: 'dream' as Tab, label: 'Dream Enchant', off: false }] : []),
  ]

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-label={`Edit ${meta.label}`}>
        <div className="modal-head">
          <ItemIcon item={item} size={34} />
          <div className="modal-title">
            <small>{meta.label}</small>
            <div>{item ? item.name : 'empty'}</div>
          </div>
          {item?.refinable && <Stepper value={entry?.refine ?? 0} max={10} prefix="+" onChange={onRefine} />}
          <button className="drawer-close" onClick={onClose} title="close (Esc)">×</button>
        </div>

        <div className="eq-tabs">
          {tabs.map((t) => (
            <button key={t.id} aria-pressed={tab === t.id} disabled={t.off} onClick={() => { setTab(t.id); setSocket(null) }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === 'item' && (
            <ItemPicker cls={build.cls} target={{ slot, cardIndex: null }} currentId={entry?.id ?? null}
              onChoose={(id) => { onItem(id); if (id != null) setTab('cards') }} />
          )}

          {tab === 'cards' && item && socket === null && (
            <div className="modal-list">
              {Array.from({ length: item.cardSlots }, (_, ci) => {
                const card = entry?.cards[ci] != null ? byId.get(entry!.cards[ci]) : undefined
                return (
                  <div key={ci} className="eq-card-row" role="button" onClick={() => setSocket(ci)}>
                    <ItemIcon item={card} size={22} />
                    <span className={card ? '' : 'dim'}>{card ? card.name : `socket ${ci + 1}: empty`}</span>
                    {card && <button className="eq-x" onClick={(e) => { e.stopPropagation(); onCard(ci, null) }} title="remove the card">×</button>}
                  </div>
                )
              })}
            </div>
          )}
          {tab === 'cards' && item && socket !== null && (
            <>
              <button className="link-btn" onClick={() => setSocket(null)}>← sockets</button>
              <ItemPicker cls={build.cls} target={{ slot, cardIndex: socket }} currentId={entry?.cards[socket] ?? null}
                onChoose={(id) => { onCard(socket, id); setSocket(null) }} />
            </>
          )}

          {tab === 'dream' && item?.dreamEnchant && (
            <div className="modal-list">
              <small>1 enchant per item. The +10 bonus adds to the base and only applies with the item at +10 (unverified reading).</small>
              <div className={`dream-row ${!entry?.dream ? 'on' : ''}`} role="button" onClick={() => onDream(null)}>
                <span className="dream-icon empty" />
                <div><b>No enchant</b></div>
              </div>
              {DREAM_ENCHANTS.map((d) => {
                const on = entry?.dream === d.id
                const at10 = (entry?.refine ?? 0) >= 10
                return (
                  <div key={d.id} className={`dream-row ${on ? 'on' : ''}`} role="button" onClick={() => onDream(d.id)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="dream-icon" src={`/icons/${d.iconId}.png`} alt="" width={24} height={24} />
                    <div className="dream-text">
                      <b>{d.name}</b>
                      <span>{d.text.base}</span>
                      <span className={at10 ? '' : 'dim'}>+10: {d.text.at10}{at10 ? '' : ' (item below +10)'}</span>
                      {d.text.base99 && <span className="dim">{d.text.base99}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {tab === 'opts' && table?.fixed && (
            <div className="modal-list">
              {table.lines.map((l, li) => (
                <div className="eq-opt-row" key={li}><span className="dim">line {li + 1}</span><span>{l[0].label}</span></div>
              ))}
              <small>Special item: these random options are always the same and are already counted.</small>
            </div>
          )}
          {tab === 'opts' && table && !table.fixed && (
            <div className="modal-list">
              {table.lines.map((opts, li) => {
                const pick = entry?.opts?.[li] ?? null
                const opt = pick ? opts.find((x) => x.id === pick.key) : undefined
                return (
                  <div className="eq-opt-row" key={li}>
                    <span className="dim">line {li + 1}</span>
                    <select value={opt?.id ?? ''} onChange={(e) => {
                      const o = opts.find((x) => x.id === e.target.value)
                      onOpt(li, o ? { key: o.id, v: o.max } : null)
                    }}>
                      <option value="">—</option>
                      {opts.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}{x.min !== x.max ? ` (${x.min}~${x.max})` : ''}{x.mods ? '' : ' ✕ not counted'}
                        </option>
                      ))}
                    </select>
                    {opt && opt.min !== opt.max && (
                      <Stepper value={pick!.v} min={opt.min} max={opt.max} onChange={(v) => onOpt(li, { key: opt.id, v })} />
                    )}
                  </div>
                )
              })}
              {table.prov === 'reported' && <small>Provisional range: the site does not publish the table for this item type.</small>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
