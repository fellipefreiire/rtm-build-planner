// Manual corrections to the dump, based on in-game observation.
// Every entry needs a `why`; without it, it becomes an unexplained number.
export const ITEM_OVERRIDES = {
  'Caelum of the Sun': {
    cardSlots: 2,
    refinable: true,
    why: 'in-game it is refinable and has 2 slots; the 900xxx record was incomplete [player report 2026-09-18]',
  },
  // Baphomet: the rework (Leech Power +3% on the set, Roaring -1 s on the card) is in the dump since 2026-09-28
  'Fanatic Servant Gloves': {
    desc: [['On hit: 1% chance\nper refine to leech HP,\nrecovering 1% of the\ndamage per refine', 'Leech Rate +1% per refine\nLeech Power +1% per refine']],
    why: 'the tooltip only mentions a leech chance; in-game it gives Leech Rate and Leech Power +1% per refine [measured in-game 2026-09-26]',
  },
  'Living Reaper': {
    desc: [['Boost Critical Damage by 5%.', 'Critical Damage +5%']],
    why: 'the text "Boost Critical Damage by 5%" does not match the parser format; the effect is Critical Damage +5% [db]',
  },
  'Sarah Irine Card': {
    desc: [
      ['Weapon Attack Power +3%', 'ATK +3%'],
    ],
    // 2026-10-01: the "Holy Weapon / +10% vs ..." block describes the element table, it is not a bonus (see weaponElementBlock)
    why: '"Weapon Attack Power" treated as ATK% (approximation) [db]',
  },
  'Heir to the King Boots': {
    desc: [['Physical and magical DMG\nvs all sizes +1% per refine', 'DMG vs All Sizes +1% per refine']],
    // 2026-10-02: kept in the size category (adds with vs Large/Medium; categories multiply in battle_calc_cardfix)
    why: '"vs all sizes" is the size category (bAddSize Size_All in the server script) [db]',
  },
  'Heir to the King Pendant': {
    desc: [['Physical and magical DMG\nvs all elements +1% per\nrefine', 'DMG vs All Elements +1% per refine']],
    why: '"vs all elements" is the element category (bAddEle Ele_All in the server script) [db]',
  },
  'Evil Wing Ears': {
    desc: [['15% chance to leech 3% physical damage done as HP', 'Leech Rate +15%\nLeech Power +3%']],
    why: '"15% chance to leech 3%": @battlestats on 2026-09-28 only adds up to Leech Power 33 with this +3 [measured in-game 2026-09-28]',
  },
  Tartaros: {
    desc: [['Leech: 100% chance, 5% of\nthe damage dealt', 'Leech Rate +100%\nLeech Power +5%']],
    why: '"Leech: 100% chance, 5% of the damage dealt" is Leech Rate 100% and Leech Power 5% [db]',
  },
  ...Object.fromEntries(['Armor', 'Shield', 'Boots', 'Pendant'].map((piece) => [`End of Kings ${piece}`, {
    desc: [
      ['Adds ATK equal to 10% of\nyour total DEF\nAdds MATK equal to 10% of\nyour total MDEF', 'ATK from DEF +10%\nMATK from MDEF +10%'],
      ['DEF +1% and Soft DEF\n+1%', 'DEF +1%\nSoft DEF +1%'],
      ['Neutral damage reduction\nfrom all sizes +1% per refine', 'Neutral Resistance +1% per refine'],
    ],
    why: 'the set text ("Adds ATK equal to 10% of your total DEF", "DEF +1% and Soft DEF +1%" per total set refine) and the boots piece ("Neutral damage reduction from all sizes") rewritten in the parser format; "total DEF" read as the equipment DEF the engine shows [db, estimated reading]',
  }])),
  'Valhalla Knight Card': {
    desc: [['raises your MaxHP limit by 5,000', 'MaxHP Limit +5000']],
    why: 'the comma in "5,000" split the line; the effect is MaxHP ceiling +5,000 with two copies [db]',
  },
  "Heimdall's Legacy": {
    desc: [['Raises your MaxHP limit\nby 10,000', 'MaxHP Limit +10000']],
    why: 'same MaxHP ceiling as Valhalla Knight Card, split across two lines with a comma [db]',
  },
  'Unknown Tech Armor': {
    desc: [['Critical +1, +1 per 5 base\nDEX.', 'Critical +1\nCritical +1 per 5 base DEX']],
    why: 'piece bonus "Critical +1, +1 per 5 base DEX." wraps mid-sentence; the second part repeats the stat [db]',
  },
  'Unknown Tech Boots': {
    desc: [['Move Speed +1%, +1% per\n10 base DEX.', 'Move Speed +1%\nMove Speed +1% per 10 base DEX']],
    why: 'piece bonus "Move Speed +1%, +1% per 10 base DEX." wraps mid-sentence [db]',
  },
  'Unknown Tech Pendant': {
    desc: [['Perfect Dodge +1, +1 per 10\nbase DEX.', 'Perfect Dodge +1\nPerfect Dodge +1 per 10 base DEX']],
    why: 'piece bonus "Perfect Dodge +1, +1 per 10 base DEX." wraps mid-sentence [db]',
  },
  'Unknown Tech Shield': {
    desc: [['Critical Damage +1%,\n+1% per 10 base DEX.', 'Critical Damage +1%\nCritical Damage +1% per 10 base DEX']],
    why: 'piece bonus "Critical Damage +1%, +1% per 10 base DEX." wraps mid-sentence [db]',
  },
  'Mind Vessel Card': {
    desc: [['SP Regen 10%+1% per 2 base LUK', 'SP Regen +10%\nSP Regen +1% per 2 base LUK']],
    why: '"10%+1% per 2 base LUK" on one line does not match the parser; split into the flat part and the per-base-LUK part [db]',
  },
  ...Object.fromEntries(['Armor', 'Gloves', 'Pendant', 'Shoes'].map((piece) => [`Prime Self ${piece}`, {
    desc: [["On kill, 0.05% chance\nper total set refine\nto activate\nMorroc's Mark for 30\nseconds.", "On kill, 0.05% chance per total set refine to activate Morroc's Mark for 30 seconds."]],
    why: 'the wrapped "per total set refine" was glued to the line above and made "All Stats +4" scale with the set refine; it belongs to the Morroc\'s Mark proc [db]',
  }])),
  Edge: {
    desc: [['If Refine is +7 or higher:\nDouble Effect', 'If Refine is +7 or higher:\nDelta Skyfall Cooldown -0.5s\nDelta Skyfall DMG+20%\nHP+2%']],
    // the Defense Penetration sits above a blank line, apart from the block being doubled: left single [estimated]
    why: '"Double Effect" at +7 repeats the block above it (Cooldown, DMG, HP); written out so the parser applies it [db]',
  },
  'Sage Ring': {
    refinable: false,
    why: 'in-game it is not refinable, even though the dump says refine=1 [player report 2026-09-18]',
  },
}

/**
 * Skill text corrections, by skill key: `desc` = [[dump text, corrected text]] pairs applied
 * before parsing the formula. Every entry needs a `why`.
 */
export const SKILL_OVERRIDES = {
  'revenant/phantom-slice': {
    desc: [['Damage is 100+20% +2% per Vit.', 'Damage is 200+20% per level +2% per Vit.']],
    why: 'in-game tooltip says "Damage is 200+20% +2% per Vit." (dump says 100); the emulator has 200 + 20×lv + 2×VIT (battle.cpp:4541) [in-game 2026-10-01]',
  },
  'trickster/dark-messenger': {
    // hits = skill level and ×1.5 in Combo Ready are applied by the rotation (rules/rotation/revenant.ts)
    desc: [['Damage is 25+1% per STR, per hit', 'Damage is 25+0% per level +1% per STR, per hit']],
    why: '"Damage is 25+1% per STR, per hit" has no "per level", so the parser skipped it and the skill never showed up as a damage skill [db]',
  },
  'revenant/haunting-slice': {
    // no damage number anywhere: a 0% formula carries the cooldown; the rotation marks it "no formula"
    desc: [['Damage is fixed based on ATK and Str.', 'Damage is 0+0% per level.']],
    why: '"Damage is fixed based on ATK and Str." has no number; 0% keeps the skill in the rotation with its 7 s cooldown and SP cost [in-game 2026-10-01]',
  },
}

/**
 * The dump sets `refine: 0` on gear whose own description says "Per Refine".
 * Cards are excluded: their text refers to the refine of the host item.
 */
export function isRefinable(it) {
  const flag = !!it.refine
  if (flag || it.grp === 'Card') return flag
  return /per\s+(\d+\s+)?(total\s+set\s+)?refine/i.test(String(it.desc || ''))
}

