// suggest: scans the class catalog and measures the real gain by recomputing the build.
// No pool heuristic — the order "empty pool > ATK% > skill% > crit" falls out
// of the recomputation on its own.
import { Build, Item, Mob, Skill, SLOTS, SlotId } from '@/lib/types'
import { ClassRules } from '@/lib/rules/classes'
import { computeSheet } from './sheet'
import { simulate } from './simulate'

export type Suggestion = {
  slot: SlotId
  slotLabel: string
  out: string | null
  in: string
  itemId: number
  isCard: boolean
  cardIndex?: number
  gainPct: number
  ehpPct: number | null
  /** true if the build has an effect that was not understood — the gain is incomplete */
  partial: boolean
}

export type SuggestDeps = {
  items: Item[]
  byId: Map<number, Item>
  skill: Skill | null
  rules: ClassRules
  toggles: Record<string, boolean>
  mob: Mob
}

const canEquip = (it: Item, cls: string) => !it.jobs || it.jobs.includes(cls)

function evaluate(b: Build, d: SuggestDeps) {
  const sheet = computeSheet(b, d.byId, d.skill, d.rules, d.toggles)
  const enc = simulate(b, sheet, d.mob)
  return { index: enc.index, ehp: enc.ehp?.v ?? null, unparsed: sheet.unparsed.length }
}

export function suggest(build: Build, d: SuggestDeps, maxPerSlot = 3): Suggestion[] {
  const base = evaluate(build, d)
  const partial = base.unparsed > 0
  const out: Suggestion[] = []

  for (const s of SLOTS) {
    const current = build.slots[s.id]
    const currentItem = current ? d.byId.get(current.id) : null
    const refine = current?.refine ?? 0

    // --- item swap ---
    const cands = d.items.filter(
      (it) => it.grp !== 'Card' && it.slots.includes(s.from) && canEquip(it, build.cls) && it.id !== current?.id,
    )
    const scored: Suggestion[] = []
    for (const it of cands) {
      const b: Build = {
        ...build,
        slots: { ...build.slots, [s.id]: { id: it.id, refine, cards: current?.cards ?? [] } },
      }
      const r = evaluate(b, d)
      const gain = base.index > 0 ? (r.index / base.index - 1) * 100 : 0
      const ehpPct = base.ehp && r.ehp ? (r.ehp / base.ehp - 1) * 100 : null
      if (gain > 0.05 || (ehpPct ?? 0) > 0.05) {
        scored.push({
          slot: s.id, slotLabel: s.label,
          out: currentItem?.name ?? null, in: it.name, itemId: it.id,
          isCard: false, gainPct: gain, ehpPct, partial,
        })
      }
    }
    scored.sort((a, b) => Math.max(b.gainPct, b.ehpPct ?? 0) - Math.max(a.gainPct, a.ehpPct ?? 0))
    out.push(...scored.slice(0, maxPerSlot))

    // --- card swap ---
    if (currentItem && currentItem.cardSlots > 0) {
      const cardCands = d.items.filter((it) => it.grp === 'Card' && it.slots.includes(s.from))
      const cards = current?.cards ?? []
      for (let ci = 0; ci < currentItem.cardSlots; ci++) {
        const scoredC: Suggestion[] = []
        for (const it of cardCands) {
          if (cards[ci] === it.id) continue
          const next = [...cards]
          next[ci] = it.id
          const b: Build = { ...build, slots: { ...build.slots, [s.id]: { id: currentItem.id, refine, cards: next } } }
          const r = evaluate(b, d)
          const gain = base.index > 0 ? (r.index / base.index - 1) * 100 : 0
          const ehpPct = base.ehp && r.ehp ? (r.ehp / base.ehp - 1) * 100 : null
          if (gain > 0.05 || (ehpPct ?? 0) > 0.05) {
            scoredC.push({
              slot: s.id, slotLabel: `${s.label} · card ${ci + 1}`,
              out: cards[ci] ? d.byId.get(cards[ci])?.name ?? null : null,
              in: it.name, itemId: it.id, isCard: true, cardIndex: ci,
              gainPct: gain, ehpPct, partial,
            })
          }
        }
        scoredC.sort((a, b) => Math.max(b.gainPct, b.ehpPct ?? 0) - Math.max(a.gainPct, a.ehpPct ?? 0))
        out.push(...scoredC.slice(0, maxPerSlot))
      }
    }
  }

  out.sort((a, b) => Math.max(b.gainPct, b.ehpPct ?? 0) - Math.max(a.gainPct, a.ehpPct ?? 0))
  return out
}
