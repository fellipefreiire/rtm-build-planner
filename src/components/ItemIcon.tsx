'use client'
import { useState } from 'react'
import { Item } from '@/lib/types'

/**
 * Icons downloaded from rtm-database.pages.dev by `npm run icons` (2,700 of 3,461).
 * The dump's `icon` field is useless: it is a 4-value flag, not an image id.
 *
 * Order: `icons/<id>.png` -> `icons/card.png` for cards -> glyph by category.
 * The glyph never pretends to be the game sprite; it is a generic shape, and it
 * exists because 727 cards and 34 pieces (the "of the Sun" family, the one with
 * empty fields in the dump) have no icon on the server.
 */

type Glyph =
  | 'sword' | 'scythe' | 'dagger' | 'axe' | 'bow' | 'spear' | 'staff' | 'book'
  | 'gun' | 'katar' | 'shield' | 'armor' | 'helmet' | 'boots' | 'cloak'
  | 'ring' | 'card' | 'shadow' | 'rune' | 'costume' | 'arrow' | 'relic' | 'generic'

const BY_CAT: [RegExp, Glyph][] = [
  [/scythe|wyrm spear/i, 'scythe'],
  [/katar|claw/i, 'katar'],
  [/dagger|kunai|flying knife/i, 'dagger'],
  [/axe/i, 'axe'],
  [/bow$|heavy bow/i, 'bow'],
  [/spear|lance/i, 'spear'],
  [/staff|rod|wand/i, 'staff'],
  [/book|cantrips/i, 'book'],
  [/revolver|rifle|gatling|shotgun|grenade/i, 'gun'],
  [/sword|blade/i, 'sword'],
  [/shield|armguard|scabbard|orb/i, 'shield'],
  [/shoes|boots/i, 'boots'],
  [/garment|manteau|muffler|shawl/i, 'cloak'],
  [/headgear|helm|hat|crown/i, 'helmet'],
  [/accessor|ring|pendant|glove/i, 'ring'],
  [/armor|suit|robe|mail/i, 'armor'],
  [/shadow/i, 'shadow'],
  [/rune/i, 'rune'],
  [/costume|constume/i, 'costume'],
  [/arrow|bullet|ammunition/i, 'arrow'],
  [/card/i, 'card'],
]

function glyphOf(it: Item): Glyph {
  if (it.grp === 'Card') return 'card'
  if (it.grp === 'Relic') return 'relic'
  if (it.grp === 'Shadow gear') return 'shadow'
  for (const [rx, g] of BY_CAT) if (rx.test(it.cat) || rx.test(it.grp)) return g
  return 'generic'
}

const P: Record<Glyph, React.ReactNode> = {
  sword: <><path d="M14 3 5 12l3 3 9-9V3z" /><path d="M4 16l2 2" /><path d="M3 19l2-2" /></>,
  scythe: <><path d="M3 5c7-3 13 1 14 8" /><path d="M17 13c-3-5-7-7-11-6" /><path d="M14 4v14" /></>,
  dagger: <><path d="M12 3 7 10l2 2 5-6V3z" /><path d="M6 13l3 3" /></>,
  axe: <><path d="M5 4c4-2 8 0 9 4-3 2-7 2-9-1z" /><path d="M13 9 7 17" /></>,
  bow: <><path d="M6 3c6 3 6 12 0 15" /><path d="M6 3l0 15" /><path d="M3 10h12" /></>,
  spear: <><path d="M12 2l3 5-3 2-3-2z" /><path d="M12 9v9" /></>,
  staff: <><circle cx="13" cy="5" r="3" /><path d="M11 8 5 17" /></>,
  book: <><path d="M3 4h6a2 2 0 012 2v10a2 2 0 00-2-2H3z" /><path d="M17 4h-6a2 2 0 00-2 2v10a2 2 0 012-2h6z" /></>,
  gun: <><path d="M3 7h10v4H8l-2 4H4l1-4H3z" /><path d="M13 9h4" /></>,
  katar: <><path d="M6 3v8l3 3 3-3V3" /><path d="M9 14v4" /></>,
  shield: <><path d="M10 2l7 3v6c0 4-3 6-7 7-4-1-7-3-7-7V5z" /></>,
  armor: <><path d="M5 4l5-2 5 2v6c0 4-2 6-5 8-3-2-5-4-5-8z" /><path d="M10 2v16" /></>,
  helmet: <><path d="M3 12a7 7 0 0114 0v4H3z" /><path d="M3 16h14" /></>,
  boots: <><path d="M6 3v9l-2 5h7v-5l3-2V3z" /></>,
  cloak: <><path d="M10 3 4 7v10h12V7z" /><path d="M10 3v14" /></>,
  ring: <><circle cx="10" cy="12" r="5" /><path d="M8 5h4l-2 3z" /></>,
  card: <><rect x="4" y="3" width="12" height="15" rx="2" /><path d="M7 8h6M7 12h4" /></>,
  shadow: <><circle cx="10" cy="10" r="7" /><path d="M10 3a7 7 0 000 14z" fill="currentColor" stroke="none" /></>,
  rune: <><path d="M10 2l7 4v8l-7 4-7-4V6z" /><path d="M10 7v7M7 10h6" /></>,
  costume: <><path d="M4 6l6-3 6 3-2 3v8H6V9z" /></>,
  arrow: <><path d="M10 2v16" /><path d="M6 6l4-4 4 4" /><path d="M7 18h6" /></>,
  relic: <><path d="M10 2l2 5 5 1-3.5 3.5L14 17l-4-2-4 2 .5-5.5L3 8l5-1z" /></>,
  generic: <><rect x="4" y="4" width="12" height="12" rx="2" /></>,
}

export default function ItemIcon({ item, size = 26, art = false }: {
  item: Item | undefined
  size?: number
  /** use the large art (assets/icons/art) and fall back to the small icon if missing */
  art?: boolean
}) {
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(art ? 0 : 1)
  if (!item) {
    return (
      <span className="item-icon empty" style={{ width: size, height: size }} aria-hidden>
        <svg viewBox="0 0 20 20" width={size - 8} height={size - 8}>
          <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.2" fill="none" opacity=".4" />
        </svg>
      </span>
    )
  }
  // 0 = large art · 1 = item icon · 2 = generic card · 3 = glyph
  const src = stage === 0 ? `icons/art/${item.id}.png`
    : stage === 1 ? `icons/${item.id}.png`
    : stage === 2 ? 'icons/card.png'
    : null
  if (src) {
    return (
      <span className="item-icon" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={size - 4}
          height={size - 4}
          style={{ imageRendering: 'pixelated' }}
          onError={() => setStage(stage === 0 ? 1 : stage === 1 && item.grp === 'Card' ? 2 : 3)}
        />
      </span>
    )
  }
  return (
    <span className="item-icon" style={{ width: size, height: size }}>
      <svg viewBox="0 0 20 20" width={size - 6} height={size - 6}
        fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        {P[glyphOf(item)]}
      </svg>
    </span>
  )
}
