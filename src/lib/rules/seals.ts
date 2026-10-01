// Seals: Valhalla (Galdrastafir, engraved on the rune) and Amatsu (In 印, engraved on the Manual/Tome).
// Source: rtm-database.pages.dev/seals ("Draft for Review", fetched 2026-09-28) + the texts
// of Awakened Stufr ("engrave their Rune") and the Ink Table.
//
// Page rules: 8 marks per temple, up to 4. A domain with 2 marks = Pair Word.
// 4 marks: 2+1+1 = pair + Focus + support for each single · 2+2 = both full pairs + the
// Legendary signature · 1+1+1+1 = Balance + support for each. With fewer than 4, only marks and pairs.
// The two temples STACK with each other (different items; stat bonuses add up in the emulator) [likely].

export type SealSystem = 'odin' | 'ama'
export type Dom = 'W' | 'V' | 'M' | 'D'
export type SealMod = { key: string; value: number; pct: boolean }
type Effect = { text: string; mods: SealMod[] | null }

const m = (key: string, value: number, pct = false): SealMod => ({ key, value, pct })
const e = (text: string, mods: SealMod[] | null): Effect => ({ text, mods })

export type Mark = { id: string; glyph: string; name: string; stat: string; dom: Dom; mods: SealMod[] }

type Temple = {
  label: string
  /** slot where it is engraved */
  slot: 'rune' | 'manual'
  marks: Mark[]
  domNames: Record<Dom, string>
  pair: Record<Dom, [string, Effect]>
  focus: Record<Dom, [string, Effect]>
  support: Record<Dom, Effect>
  balance: [string, Effect]
  /** Legendary signature for each pair of domains (key in alphabetical order: 'DW', 'MV'…) */
  legend: Record<string, [string, Effect]>
}

const statMarks = (ids: [string, string, string][], dom: Dom[]): Mark[] => {
  const stats: [string, SealMod][] = [
    ['STR +2', m('str', 2)], ['MaxHP +2%', m('hp', 2, true)], ['VIT +2', m('vit', 2)], ['DEX +2', m('dex', 2)],
    ['INT +2', m('int', 2)], ['MaxSP +2%', m('sp', 2, true)], ['AGI +2', m('agi', 2)], ['LUK +2', m('luk', 2)],
  ]
  return ids.map(([id, glyph, name], i) => ({ id, glyph, name, stat: stats[i][0], dom: dom[i], mods: [stats[i][1]] }))
}
const DOMS: Dom[] = ['W', 'W', 'V', 'V', 'M', 'M', 'D', 'D']

export const TEMPLES: Record<SealSystem, Temple> = {
  odin: {
    label: 'Valhalla · Galdrastafir',
    slot: 'rune',
    marks: statMarks([
      ['AE', 'AE', 'Ægishjálmur'], ['VA', 'VA', 'Varnarstafur'], ['VD', 'VD', 'Veldismagn'], ['BJ', 'BJ', 'Bjargrúnar'],
      ['LI', 'LI', 'Limrúnar'], ['DR', 'DR', 'Draumstafir'], ['VG', 'VG', 'Vegvísir'], ['KA', 'KA', 'Kaupaloki'],
    ], DOMS),
    domNames: { W: '🛡 Wall', V: '❤ Vigor', M: '✨ Blessing', D: '🍀 Fate' },
    pair: {
      W: ['VÖRN', e('−3% all damage taken', [m('dmg_taken', -3, true)])],
      V: ['LÍF', e('MaxHP +5% & +20% HP regen', [m('hp', 5, true), m('hp_regen', 20, true)])],
      M: ['BÓT', e('+5% healing given & −5% SP cost', [m('healing_power', 5, true), m('sp_cost', -5, true)])],
      D: ['HEILL', e('Perfect Dodge +5 & +3% move speed', [m('perfect_dodge', 5), m('move_speed', 3, true)])],
    },
    focus: {
      W: ['STÁL', e('MaxHP +5%', [m('hp', 5, true)])],
      V: ['GRÓÐR', e('+10% healing received', [m('healing_received', 10, true)])],
      M: ['KYRRÐ', e('−7% variable cast', [m('cast_time', -7, true)])],
      D: ['HULD', e('Flee +15', [m('flee', 15)])],
    },
    support: {
      W: e('DEF +5', [m('def', 5)]), V: e('+10% HP regen', [m('hp_regen', 10, true)]),
      M: e('+10% SP regen', [m('sp_regen', 10, true)]), D: e('Flee +5', [m('flee', 5)]),
    },
    balance: ['URÐR', e('All Stats +1 & EXP +5%', [m('all_stats', 1), m('exp', 5, true)])],
    legend: {
      VW: ['VÖRÐR', e('DEF +15, MDEF +8', [m('def', 15), m('mdef', 8)])],
      MW: ['VÉ', e('−7% fixed cast', [m('fixed_cast', -7, true)])],
      DW: ['SKJÖLDR', e('Flee +15', [m('flee', 15)])],
      MV: ['LÍKN', e('+10% healing received', [m('healing_received', 10, true)])],
      DV: ['ÞRÓTTR', e('Fixed Cast −100 ms', [m('fixed_cast', -100)])],
      DM: ['GÆFA', e('LUK +5, Perfect Dodge +3', [m('luk', 5), m('perfect_dodge', 3)])],
    },
  },
  ama: {
    label: 'Amatsu · In 印',
    slot: 'manual',
    marks: statMarks([
      ['ZA', '斬', 'Zan · cut'], ['RI', '力', 'Riki · might'], ['SH', '射', 'Sha · shot'], ['YA', '矢', 'Ya · arrow'],
      ['JU', '呪', 'Ju · hex'], ['EN', '炎', 'En · flame'], ['JI', '迅', 'Jin · swift'], ['RE', '烈', 'Retsu · fury'],
    ], DOMS),
    domNames: { W: '⚔ Blade', V: '🏹 Bow', M: '🌀 Spell', D: '⚡ Surge' },
    pair: {
      W: ['KIRI 斬', e('+3% melee physical', [m('melee_dmg', 3, true)])],
      V: ['SHASEI 射', e('+3% ranged physical', [m('ranged_dmg', 3, true)])],
      M: ['JUEN 呪', e('+3% magic damage', [m('magic_dmg', 3, true)])],
      D: ['HAYATE 迅', e('+2% ASPD & Crit +5', [m('aspd', 2, true), m('crit_rate', 5)])],
    },
    focus: {
      W: ['MUSÔ 無想', e('Crit Damage +10%', [m('crit_dmg', 10, true)])],
      V: ['SHINGAN 心眼', e('Perfect Hit +10%', [m('perfect_hit', 10, true)])],
      M: ['KAJUTSU 火術', e('−7% variable cast', [m('cast_time', -7, true)])],
      D: ['SHUKUCHI 縮地', e('ASPD Limit +1', [m('aspd_limit', 1)])],
    },
    support: {
      W: e('Crit +3', [m('crit_rate', 3)]), V: e('Perfect Hit +3%', [m('perfect_hit', 3, true)]),
      M: e('+2% MATK', [m('matk', 2, true)]), D: e('−3% after-cast delay', [m('after_cast_delay', -3, true)]),
    },
    balance: ['ZANSHIN 残心', e('All Stats +1 & EXP +5%', [m('all_stats', 1), m('exp', 5, true)])],
    legend: {
      VW: ['HAYABUSA 隼', e('Crit +10', [m('crit_rate', 10)])],
      MW: ['MURAMASA 村正', e('ignore 10% DEF/MDEF', null)],
      DW: ['IAI 居合', e('ASPD +3%, Crit +7', [m('aspd', 3, true), m('crit_rate', 7)])],
      MV: ['FŪMA 風魔', e('Perfect Hit +5%', [m('perfect_hit', 5, true)])],
      DV: ['SHIPPŪ 疾風', e('−5% after-cast delay', [m('after_cast_delay', -5, true)])],
      DM: ['RAIJIN 雷神', e('−5% variable cast', [m('cast_time', -5, true)])],
    },
  },
}

export type SealLine = { tier: string; word?: string; text: string; applied: boolean }
export type SealResult = { lines: SealLine[]; mods: SealMod[] }

/** What an engraving gives: the marks, the pairs and, with 4 marks, the crown (Focus, Legendary or Balance) and the supports. */
export function sealResult(system: SealSystem, ids: string[]): SealResult {
  const t = TEMPLES[system]
  const picked = ids.map((id) => t.marks.find((x) => x.id === id)).filter((x): x is Mark => !!x).slice(0, 4)
  const lines: SealLine[] = []
  const mods: SealMod[] = []
  const add = (tier: string, eff: Effect, word?: string) => {
    lines.push({ tier, word, text: eff.text, applied: !!eff.mods })
    if (eff.mods) mods.push(...eff.mods)
  }
  for (const p of picked) { lines.push({ tier: 'mark', word: p.glyph, text: p.stat, applied: true }); mods.push(...p.mods) }

  const count: Partial<Record<Dom, number>> = {}
  for (const p of picked) count[p.dom] = (count[p.dom] ?? 0) + 1
  const pairs = (Object.keys(count) as Dom[]).filter((d) => count[d] === 2).sort()
  const singles = (Object.keys(count) as Dom[]).filter((d) => count[d] === 1).sort()

  for (const d of pairs) add(`pair ${t.domNames[d]}`, t.pair[d][1], t.pair[d][0])
  if (picked.length === 4) {
    if (pairs.length === 2) {
      const [w, eff] = t.legend[pairs.join('')]
      add('Legendary', eff, w)
    } else if (pairs.length === 1) {
      const [w, eff] = t.focus[pairs[0]]
      add('Focus', eff, w)
    } else {
      add('Balance', t.balance[1], t.balance[0])
    }
    for (const d of singles) add(`support ${t.domNames[d]}`, t.support[d])
  }
  return { lines, mods }
}
