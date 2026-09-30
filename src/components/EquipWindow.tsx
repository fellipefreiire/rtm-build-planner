'use client'
import { useMemo, useState } from 'react'
import { Build, Item, SlotId, SLOTS } from '@/lib/types'
import { byId, itemsForSlot } from '@/lib/data'
import { effectivePicks, optionTableFor, optShort } from '@/lib/rules/random-options'
import { dreamById } from '@/lib/rules/dream-enchants'
import ItemIcon from './ItemIcon'
import { useTip } from './Tooltip'
import { ItemTip } from './tips'
import SealPanel from './SealPanel'
import { SealSystem } from '@/lib/rules/seals'

/** Alt+Q window layout: two columns with the character in the middle. */
const PRIMARY: { left: SlotId[]; right: SlotId[] } = {
  left: ['upper', 'lower', 'weapon', 'garment', 'accessory'],
  right: ['mid', 'armor', 'offhand', 'shoes', 'accessory2'],
}
const SECONDARY: { left: SlotId[]; right: SlotId[] } = {
  left: ['rune', 'costume', 'manual', 'pet'],
  right: ['shadowArmor', 'shadowGloves', 'shadowShoes', 'shadowAcc'],
}

type Props = {
  build: Build
  active: SlotId | null
  onClear: (slot: SlotId) => void
  /** unequip every slot, switch reserves included */
  onClearAll?: () => void
  onOpen: (slot: SlotId) => void
  /** swap the active item with the slot's reserve */
  onSwitch?: (slot: SlotId) => void
  /** engrave a temple's marks */
  onSeals?: (system: SealSystem, ids: string[]) => void
}

/**
 * Fixed-height slot: never grows with its content. Cards become icons and the
 * random options a single line; details go in the tooltip and editing in the modal.
 */
function Slot({ id, build, active, onClear, onOpen, onSwitch, lockedBy }: Props & { id: SlotId; lockedBy?: Item }) {
  const tip = useTip()
  const meta = SLOTS.find((s) => s.id === id)!
  const entry = build.slots[id]
  const item: Item | undefined = lockedBy ?? (entry ? byId.get(entry.id) : undefined)
  const disponiveis = useMemo(() => itemsForSlot(meta.from, build.cls, true).length, [meta.from, build.cls])

  // with a two-handed weapon the off-hand mirrors the weapon and its cards
  const cardIds = lockedBy ? build.slots.weapon?.cards ?? [] : entry?.cards ?? []
  const cards = item ? Array.from({ length: item.cardSlots }, (_, ci) => (cardIds[ci] != null ? byId.get(cardIds[ci]) : undefined)) : []
  const table = lockedBy ? null : optionTableFor(item, id)
  const opts = table
    ? effectivePicks(table, entry?.opts).map((p, li) => {
        const o = p ? table.lines[li]?.find((x) => x.id === p.key) : undefined
        return o ? optShort(o, p!.v) : null
      }).filter(Boolean) as string[]
    : []
  const refine = entry?.refine ?? 0
  const dream = !lockedBy && item?.dreamEnchant && entry?.dream ? dreamById.get(entry.dream)?.name : undefined
  if (dream) opts.unshift(`✦ ${dream}`)

  const hasSwitch = !!build.swaps && id in build.swaps
  const altEntry = build.swaps?.[id] ?? null
  const altItem = altEntry ? byId.get(altEntry.id) : undefined
  const side = hasSwitch ? build.swapSide?.[id] ?? 'A' : null
  const open = () => { if (!lockedBy) onOpen(id) }
  return (
    <div
      className={`eq-slot fixed ${lockedBy ? 'locked' : 'clickable'} ${active === id ? 'on' : ''}`}
      onClick={open}
      role={lockedBy ? undefined : 'button'}
      tabIndex={lockedBy ? -1 : 0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open() }}
    >
      <div className="eq-label">
        <span>{meta.label}{side && <span className={`sw-side ${side}`} title={altItem ? `reserve: ${altItem.name}` : 'empty reserve'}>{side}</span>}</span>
        <span className="eq-actions">
          {!lockedBy && onSwitch && (
            <button className={`eq-sw ${hasSwitch ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onSwitch(id) }}
              title={hasSwitch ? `switch: swap to ${altItem ? altItem.name : 'the empty reserve'}` : 'switch: keep this item as reserve and equip another'}>⇄</button>
          )}
          {lockedBy ? <span className="dim">two-handed</span>
            : item ? <button className="eq-x" onClick={(e) => { e.stopPropagation(); onClear(id) }} title="unequip">×</button>
            : <span className="dim">{disponiveis}</span>}
        </span>
      </div>
      <div className="eq-main" {...(item ? tip(<ItemTip item={item} refine={entry?.refine} />) : {})}>
        <ItemIcon item={item} size={30} />
        <div className={`eq-item-name one ${item ? '' : 'dim'}`}>
          {item ? (item.refinable && refine > 0 ? `+${refine} ` : '') + (id === 'pet' ? item.name.replace(/ Egg$/, '') : item.name) : 'empty'}
        </div>
      </div>
      <div className="eq-foot">
        {cards.map((c, ci) => (
          <span key={ci} className="eq-card-dot" {...(c ? tip(<ItemTip item={c} />) : {})}>
            <ItemIcon item={c} size={16} />
          </span>
        ))}
        {opts.length > 0 && <span className="eq-opts-line" title={opts.join(' · ')}>{opts.join(' · ')}</span>}
      </div>
    </div>
  )
}

export default function EquipWindow(props: Props) {
  const [tab, setTab] = useState<'primary' | 'secondary' | 'odin' | 'ama'>('primary')
  const layout = tab === 'primary' ? PRIMARY : SECONDARY
  const sealTab = tab === 'odin' || tab === 'ama' ? tab : null
  const equipped = Object.keys(props.build.slots).length

  // a two-handed weapon also takes the off-hand (visual only; the engine discards the piece)
  const weaponEntry = props.build.slots.weapon
  const weapon = weaponEntry ? byId.get(weaponEntry.id) : undefined
  const twoHanded = weapon?.twoHanded ? weapon : undefined

  const col = (ids: SlotId[]) => (
    <div className="eq-col">
      {ids.map((id) => (
        <Slot key={id} id={id} {...props} lockedBy={id === 'offhand' ? twoHanded : undefined} />
      ))}
    </div>
  )

  return (
    <div className="eq-window">
      <div className="eq-title">
        <span>⛨</span> Equipment
        <span style={{ marginLeft: 'auto', fontWeight: 400 }}>
          <small>{equipped} equipped</small>
          {props.onClearAll && (
            <button
              className="eq-clear-all"
              disabled={equipped === 0 && !Object.keys(props.build.swaps ?? {}).length}
              onClick={() => { if (window.confirm('Unequip all items (switch reserves included)?')) props.onClearAll!() }}
              title="unequip every slot; stats, skills and seals stay"
            >clear all</button>
          )}
        </span>
      </div>
      <div className="eq-tabs">
        <button aria-pressed={tab === 'primary'} onClick={() => setTab('primary')}>Primary</button>
        <button aria-pressed={tab === 'secondary'} onClick={() => setTab('secondary')}>Secondary</button>
        <button aria-pressed={tab === 'odin'} onClick={() => setTab('odin')} title="engraved on the rune">Valhalla</button>
        <button aria-pressed={tab === 'ama'} onClick={() => setTab('ama')} title="engraved on the manual/tome">Amatsu</button>
      </div>
      {sealTab ? (
        <SealPanel build={props.build} system={sealTab} onChange={(ids) => props.onSeals?.(sealTab, ids)} />
      ) : (
      <div className="eq-grid">
        {col(layout.left)}
        <div className="eq-mid">
          {/* class gem: sits above the class panel, in the Secondary tab */}
          {tab === 'secondary' && <Slot id="gem" {...props} />}
          <div className="eq-avatar">
            <div className="sil">♛</div>
            <div>{props.build.cls}</div>
            <div>base {props.build.baseLv}</div>
          </div>
        </div>
        {col(layout.right)}
      </div>
      )}
    </div>
  )
}
