// Dream Enchants (Weaver of Dreams, Varmundt's Orphanage). Source: the 20 enchant
// items in the dump. Only items with "Dream Enchants available" in their text
// accept them.
// Reading of "+10": the bonus STACKS with the base (Mindweaver Striker = pen +15 at +10) [player report, not measured].
// How many fit per item is not documented; the planner uses 1 per item.
import { StatKey } from '@/lib/types'

export type DreamMod = { key: string; value: number; pct: boolean }
export type DreamEnchant = {
  id: string
  name: string
  /** enchant item id in the dump: the icon is public/icons/<iconId>.png */
  iconId: number
  /** what it does, as in the in-game tooltip: base and +10 bonus */
  text: { base: string; at10: string; base99?: string }
  base: DreamMod[]
  /** "If Refine +10": requires the host item at +10 */
  at10: DreamMod[]
  /** "If Base <STAT> is 99" (Dream of …) */
  base99?: { stat: StatKey; mods: DreamMod[] }
}

const m = (key: string, value: number, pct = false): DreamMod => ({ key, value, pct })
const STAT: Record<StatKey, string> = { str: 'STR', agi: 'AGI', vit: 'VIT', int: 'INT', dex: 'DEX', luk: 'LUK' }
const dreamOf = (id: string, name: string, stat: StatKey, iconId: number): DreamEnchant => ({
  id, name, iconId,
  text: { base: `${STAT[stat]} +5`, at10: 'All Stats +1', base99: `Base ${STAT[stat]} 99: HP/SP +2%` },
  base: [m(stat, 5)],
  at10: [m('all_stats', 1)],
  base99: { stat, mods: [m('hp', 2, true), m('sp', 2, true)] },
})

export const DREAM_ENCHANTS: DreamEnchant[] = [
  dreamOf('dream-of-power', 'Dream of Power', 'str', 7366),
  dreamOf('dream-of-speed', 'Dream of Speed', 'agi', 7367),
  dreamOf('dream-of-life', 'Dream of Life', 'vit', 7368),
  dreamOf('dream-of-wisdom', 'Dream of Wisdom', 'int', 7370),
  dreamOf('dream-of-skill', 'Dream of Skill', 'dex', 7369),
  dreamOf('dream-of-fate', 'Dream of Fate', 'luk', 7371),
  { id: 'nightmare-slayer', name: 'Nightmare Slayer', iconId: 7372, text: { base: 'ATK +3%', at10: 'ATK +5' }, base: [m('atk', 3, true)], at10: [m('atk', 5)] },
  { id: 'nightmare-piercer', name: 'Nightmare Piercer', iconId: 7373, text: { base: 'MATK +3%', at10: 'MATK +5' }, base: [m('matk', 3, true)], at10: [m('matk', 5)] },
  { id: 'nightmare-keeper', name: 'Nightmare Keeper', iconId: 7374, text: { base: 'Max HP +5%', at10: 'Total DEF +10%' }, base: [m('hp', 5, true)], at10: [m('def', 10, true)] },
  { id: 'nightmare-visitor', name: 'Nightmare Visitor', iconId: 7375, text: { base: 'Max SP +5%', at10: 'Total MDEF +10%' }, base: [m('sp', 5, true)], at10: [m('mdef', 10, true)] },
  { id: 'mindweaver-evasion', name: 'Mindweaver Evasion', iconId: 7376, text: { base: 'Flee +15', at10: 'Perfect Dodge +5' }, base: [m('flee', 15)], at10: [m('perfect_dodge', 5)] },
  { id: 'mindweaver-precision', name: 'Mindweaver Precision', iconId: 7377, text: { base: 'Hit +15', at10: 'Perfect Hit +10%' }, base: [m('hit', 15)], at10: [m('perfect_hit', 10, true)] },
  { id: 'mindweaver-efficiency', name: 'Mindweaver Efficiency', iconId: 7378, text: { base: 'SP Cost −5%', at10: 'SP Cost −10%' }, base: [m('sp_cost', -5, true)], at10: [m('sp_cost', -10, true)] },
  { id: 'mindweaver-striker', name: 'Mindweaver Striker', iconId: 7379, text: { base: 'Defense Penetration +5', at10: 'Defense Penetration +10' }, base: [m('def_pen', 5)], at10: [m('def_pen', 10)] },
  { id: 'mindweaver-piercer', name: 'Mindweaver Piercer', iconId: 7380, text: { base: 'Magic Defense Penetration +5', at10: 'Magic Defense Penetration +10' }, base: [m('mdef_pen', 5)], at10: [m('mdef_pen', 10)] },
  { id: 'sleepwalker-mobility', name: 'Sleepwalker Mobility', iconId: 7381, text: { base: 'Move Speed +5%', at10: 'Move Speed +10%' }, base: [m('move_speed', 5, true)], at10: [m('move_speed', 10, true)] },
  { id: 'sleepwalker-vitality', name: 'Sleepwalker Vitality', iconId: 7382, text: { base: 'HP Regen +50%', at10: 'HP regen while walking' }, base: [m('hp_regen', 50, true)], at10: [] },
  { id: 'sleepwalker-essence', name: 'Sleepwalker Essence', iconId: 7383, text: { base: 'SP Regen +25%', at10: 'SP Regen +50%' }, base: [m('sp_regen', 25, true)], at10: [m('sp_regen', 50, true)] },
  { id: 'awakened-orphan', name: 'Awakened Orphan', iconId: 7384, text: { base: 'All Stats +2', at10: 'ATK/MATK/HP/SP +1%' }, base: [m('all_stats', 2)], at10: [m('atk', 1, true), m('matk', 1, true), m('hp', 1, true), m('sp', 1, true)] },
  { id: 'eternal-orphan', name: 'Eternal Orphan', iconId: 7385, text: { base: 'EXP +10% · Shadow Ore +1%', at10: 'HP/SP +5%' }, base: [m('exp', 10, true)], at10: [m('hp', 5, true), m('sp', 5, true)] },
]

export const dreamById = new Map(DREAM_ENCHANTS.map((d) => [d.id, d]))
