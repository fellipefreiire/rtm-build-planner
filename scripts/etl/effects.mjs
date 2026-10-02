// Effect parser: free text from the `desc` field -> Modifier[] | UnparsedEffect[]
// Invariant: every line becomes a modifier OR an unparsed entry.
// No line is ever dropped silently.

/** CLOSED vocabulary. An unknown key becomes unparsed, never a new stat. */
export const MOD_KEYS = new Set([
  'atk', 'matk', 'def', 'mdef', 'hp', 'sp',
  'str', 'agi', 'vit', 'int', 'dex', 'luk', 'all_stats',
  'crit_rate', 'crit_rate_mult', 'crit_dmg', 'perfect_dodge', 'perfect_hit',
  'def_pen', 'mdef_pen', 'leech_power', 'leech_rate',
  'move_speed', 'aspd', 'aspd_limit', 'after_cast_delay', 'cast_time',
  'sp_cost', 'sp_regen', 'hp_regen', 'healing_power', 'healing_received',
  'hit', 'flee', 'attack_range', 'splash_range', 'weight_limit', 'exp',
  'dmg_vs_race', 'dmg_vs_size', 'dmg_vs_element', 'dmg_vs_boss',
  'resist_element', 'resist_race', 'resist_boss',
  'skill_dmg', 'skill_lv', 'skill_sp_cost', 'skill_cooldown', 'skill_duration',
  'resist_status', 'dmg_vs_nonboss', 'resist_nonboss',
  'melee_dmg', 'ranged_dmg', 'magic_dmg', 'dmg_pct', 'shadow_parry', 'drop_rate',
  'dmg_taken', 'reflect_melee', 'double_attack_rate', 'auto_guard',
  'resist_melee', 'resist_long', 'resist_matk', 'resist_misc', 'fixed_cast',
  // 2026-09-29: "Resistance vs All Sizes" used to land in resist_race; "Damage Reduction +5%"
  // is the opposite sign of "Damage taken -5%", so it gets its own key (positive = less damage)
  'resist_size', 'dmg_reduction',
  // 2026-10-02: Maiden of Time set "ATK +1 every 20 flee" (combo: bonus bBaseAtk,readparam(bFlee)/20)
  'atk_per_flee_20',
  // 2026-09-30: End of Kings ("Adds ATK equal to 10% of your total DEF", "Soft DEF +1%") and the
  // MaxHP ceiling that Valhalla Knight Card / Heimdall's Legacy raise
  'atk_from_def', 'matk_from_mdef', 'soft_def', 'hp_limit',
  // 2026-10-01: Heir to the King ("Adds DEF equal to 10% of your total ATK"); flat SP/HP every second
  'def_from_atk', 'mdef_from_matk', 'sp_per_sec', 'hp_per_sec',
])

const STATS = ['str', 'agi', 'vit', 'int', 'dex', 'luk']
const ELEMENTS = ['neutral', 'water', 'earth', 'fire', 'wind', 'poison', 'holy', 'dark', 'ghost', 'undead']
const RACES = ['plant', 'insect', 'brute', 'fish', 'undead', 'demihuman', 'demon', 'formless', 'dragon', 'angel']
const SIZES = ['small', 'medium', 'large']

/** text alias -> one or more vocabulary keys */
const ALIAS = new Map(Object.entries({
  'all stats': ['all_stats'], 'all stat': ['all_stats'],
  hp: ['hp'], 'max hp': ['hp'], 'hp bonus': ['hp'], 'maxhp': ['hp'],
  sp: ['sp'], 'max sp': ['sp'], 'sp bonus': ['sp'], 'maxsp': ['sp'],
  'hp/sp': ['hp', 'sp'], 'hp and sp': ['hp', 'sp'],
  atk: ['atk'], attack: ['atk'], matk: ['matk'], 'atk/matk': ['atk', 'matk'],
  def: ['def'], 'total def': ['def'], defense: ['def'],
  mdef: ['mdef'], 'magic attack': ['matk'], 'magic def': ['mdef'], 'magic defense': ['mdef'],
  'move speed': ['move_speed'], 'movement speed': ['move_speed'], 'walk speed': ['move_speed'],
  'perfect dodge': ['perfect_dodge'], 'perfect hit': ['perfect_hit'],
  aspd: ['aspd'], 'aspd limit': ['aspd_limit'], 'attack speed': ['aspd'],
  'defense penetration': ['def_pen'], penetration: ['def_pen'], 'def penetration': ['def_pen'],
  'magic defense penetration': ['mdef_pen'], 'mdef penetration': ['mdef_pen'],
  'critical rate': ['crit_rate'], 'total critical rate': ['crit_rate_mult'], critical: ['crit_rate'],
  'crit rate': ['crit_rate'], 'critical hit rate': ['crit_rate'],
  'critical damage': ['crit_dmg'], 'critical damage bonus': ['crit_dmg'], 'crit damage': ['crit_dmg'],
  'leech power': ['leech_power'], 'leech rate': ['leech_rate'],
  'after cast delay': ['after_cast_delay'], 'after-cast delay': ['after_cast_delay'], 'cast delay': ['after_cast_delay'],
  'cast time': ['cast_time'], 'variable cast time': ['cast_time'], 'variable cast': ['cast_time'],
  'sp cost': ['sp_cost'], 'sp cost reduction': ['sp_cost'], 'skill sp cost': ['sp_cost'],
  'sp regen': ['sp_regen'], 'hp regen': ['hp_regen'], 'hp/sp regen': ['hp_regen', 'sp_regen'],
  'hp regeneration': ['hp_regen'], 'sp regeneration': ['sp_regen'], 'hp/sp regeneration': ['hp_regen', 'sp_regen'],
  'healing power': ['healing_power'], 'healing received': ['healing_received'],
  'heal power': ['healing_power'], 'healing effectiveness': ['healing_power'],
  hit: ['hit'], 'total hit': ['hit'], flee: ['flee'], 'total flee': ['flee'],
  'attack range': ['attack_range'], 'splash range': ['splash_range'],
  'weight limit': ['weight_limit'], weight: ['weight_limit'],
  exp: ['exp'], 'exp received': ['exp'], 'drop rate': ['drop_rate'],
  'melee damage': ['melee_dmg'], 'melee dmg': ['melee_dmg'],
  'ranged damage': ['ranged_dmg'], 'ranged dmg': ['ranged_dmg'],
  'shadow parry': ['shadow_parry'], damage: ['dmg_pct'], dmg: ['dmg_pct'],
  'healing done': ['healing_power'], 'potion healing power': ['healing_power'],
  'total defense': ['def'], 'all damage taken': ['dmg_taken'], 'damage taken': ['dmg_taken'],
  'all cast time': ['cast_time'], 'sp consumption': ['sp_cost'],
  'max hp/sp': ['hp', 'sp'], 'hp/sp bonus': ['hp', 'sp'],
  'double attack rate': ['double_attack_rate'], 'auto guard': ['auto_guard'],
  'atk per 20 flee': ['atk_per_flee_20'],
  'magic defense penetration': ['mdef_pen'],
  'reflect melee damage': ['reflect_melee'], 'exp received': ['exp'],
  'fixed cast': ['fixed_cast'], 'fixed cast time': ['fixed_cast'],
  'magic damage received': ['resist_matk'], 'magic damage taken': ['resist_matk'],
  'melee damage received': ['resist_melee'], 'melee damage taken': ['resist_melee'],
  'ranged damage received': ['resist_long'], 'ranged damage taken': ['resist_long'],
  'long range damage received': ['resist_long'],
  'miscelaneous/special damage taken': ['resist_misc'],
  'miscellaneous/special damage taken': ['resist_misc'],
  'misc damage taken': ['resist_misc'], 'all damage reduction': ['dmg_reduction'],
  'long range attack': ['ranged_dmg'], 'long range damage': ['ranged_dmg'],
  regeneration: ['hp_regen'], 'def/mdef penetration': ['def_pen', 'mdef_pen'],
  // Veins Ghoul, Dream Manteau, Muspelskoll, Surt Shoes, Piercing Protocard, Gambit Gem…
  'defense and magic defense penetration': ['def_pen', 'mdef_pen'],
  'defense/magic defense penetration': ['def_pen', 'mdef_pen'],
  'defense / magic defense penetration': ['def_pen', 'mdef_pen'],
  'magic penetration': ['mdef_pen'],
  'bonus damage': ['dmg_pct'], 'base damage reduction': ['dmg_reduction'],
  'damage reduction': ['dmg_reduction'], 'all element resistance': ['resist_element'],
  'zeny limit': ['exp'],
  // King's Suit/Mantle/Shoes: "Final Damage Received -10%" is the same stat as "Damage taken -10%"
  'final damage received': ['dmg_taken'], 'final damage taken': ['dmg_taken'],
  'atk from def': ['atk_from_def'], 'matk from mdef': ['matk_from_mdef'], 'soft def': ['soft_def'],
  'maxhp limit': ['hp_limit'], 'max hp limit': ['hp_limit'],
  // 2026-10-01: forms seen in the unparsed report
  range: ['attack_range'], 'atk and matk': ['atk', 'matk'], 'atk & matk': ['atk', 'matk'],
  'sp recovery': ['sp_regen'], 'hp recovery': ['hp_regen'], 'hp/sp recovery': ['hp_regen', 'sp_regen'], 'melee attack': ['melee_dmg'], 'ranged attack': ['ranged_dmg'],
  'long ranged attack': ['ranged_dmg'], 'long-range damage': ['ranged_dmg'],
  'flat defense': ['def'], 'final damage': ['dmg_pct'], 'flat def': ['def'], 'total mdef': ['mdef'],
  'max hp and sp': ['hp', 'sp'], 'max hp and max sp': ['hp', 'sp'], 'max hp/max sp': ['hp', 'sp'],
  'final damage reduction': ['dmg_reduction'], 'physical reduction': ['resist_melee', 'resist_long'],
  'long range damage taken': ['resist_long'], 'long range resistance': ['resist_long'],
  'melee physical damage taken': ['resist_melee'], 'double attack chance': ['double_attack_rate'],
  'weapon attack power': ['atk'], 'hit rate': ['hit'], 'natural hp regen': ['hp_regen'],
  'hp recov rate': ['hp_regen'], 'sp recov rate': ['sp_regen'], 'hp recovery rate': ['hp_regen'], 'sp recovery rate': ['sp_regen'],
  'healing power and healing received': ['healing_power', 'healing_received'], 'physical damage received': ['resist_melee', 'resist_long'],
  'physical damage taken': ['resist_melee', 'resist_long'], 'perfect hit rate': ['perfect_hit'],
  'healing done and received': ['healing_power', 'healing_received'], 'critical rate total': ['crit_rate_mult'],
  ...Object.fromEntries(STATS.map((s) => [s, [s]])),
}))

const RE = {
  // 2026-10-01: economy, drops, consumables, movement tricks, revival, item rental… They have a number but
  // no effect on damage or defense; kept apart from "not understood" so that list shows what is really broken
  notModeled: /\b(added effect|knock\w*|zeny|drops\b|dropping|shadow ores?|jewel ores?|\bores?\b|kafra|elixir|refine material|rental|slides? you|cells backwards|resurrect\w*|revive\w*|warp\w*|teleport\w*|prevents downgrade|random (?:card|class gem)|class gem|loot|per kill|on kill|per hit|item healing|magic vs|vengeance rate)\b/i,
  marker: /^(piece bonus|requirement|innate|bonus|effects?)\s*:?\s*$/i,
  setBonus: /^(?<set>.*?)\s*set bonus\s*:?\s*$/i,
  // "Baphomet Set:" names the generic "Set Bonus:" on cards
  setName: /^(?<set>[A-Za-z][A-Za-z0-9 .'&-]*?)\s+set\s*:\s*$/i,
  // "per 2 refines" WITHOUT a colon is a suffix of the previous line, not a marker
  retroPerRefine: /^per\s+(?:(\d+)\s+)?(?:total\s+set\s+)?refines?\.?$/i,
  // inside a set block, "Set refine 9+:" / "At set refine 9+ and again at 18+:" count the TOTAL refine of the set
  setRefine: /^(?:at\s+)?set\s+refine\s+(\d+)\+?(?:\s+and\s+again\s+at\s+(\d+)\+?)?\s*:?\s*$/i,
  refineIf: /^(?:if\s+)?(?:set\s+)?refine\s+(?:is\s+)?\+?(\d+)(?:\s+or\s+higher)?\s*:?\s*$/i,
  // "Every level of Ominous Presence or Advanced Scythe Mastery boosts:"
  perSkillLv: /^every\s+(?:skill\s+)?level\s+of\s+(?<s>.+?)\s+boosts?\s*:?\s*$/i,
  levelIf: /^base\s+level\s+(\d+)(?:\s+or\s+higher)?\s*:?\s*$/i,
  // "Base VIT 90:" · "If Base INT is over 108:" · "If base STR is 120 or above:" · "If Base VIT < 80:"
  // "If STR is above 98:" (Burning Fury) has no "base", but the script reads readparam(bStr), the allocated stat [emu]
  baseStatIf: /^(?:if\s+(?:base\s+)?|base\s+)(?<st>str|agi|vit|int|dex|luk)\s+(?:is\s+)?(?<op>over|above|>|<|>=|<=)?\s*(?<n>\d+)(?:\s+or\s+(?:above|higher|more))?\s*:\s*$/i,
  // "For each base stat over 98:" (Angel of Genesis, Demon of Apocalypse): × how many base stats pass
  perBaseStat: /^for\s+each\s+base\s+stat\s+(?:is\s+)?(?:over|above)\s+(?<n>\d+)\s*:\s*$/i,
  slotsMeta: /^\d+\s+slots?$/i,
  extraCont: /^\+?\s*(?:an\s+)?(?<lead>extra|plus)\s*(?<sign>[+-])?\s*(?<n>\d+(?:[.,]\d+)?)\s*(?<pct>%?)\s*(?:more\b)?(?<rest>.*)$/i,
  // continuation with no keyword: "+2% per Upgrade", "+10%", "5% Bonus Damage"
  bareCont: /^(?<sign>[+-])?\s*(?<n>\d+(?:[.,]\d+)?)\s*(?<pct>%?)\s*(?:more\s*)?(?<rest>bonus damage|damage)?$/i,
  piecesMarker: /^(\d+)\s+pieces?\s*:/i,
  // "With two of these equipped:" (Valhalla Knight Card): needs N copies of this same item
  copiesMarker: /^with\s+(two|three|four|\d+)\s+of\s+these\s+equipped\s*:?\s*$/i,
  skillColonLv: /^(?<s>[A-Za-z][A-Za-z '-]*?)\s*:\s*lv\s*(?<n>\d+)$/i,
  // "Reflects 5% short range damage taken", "Reflects 3% damage taken from melee attackers", "Reflects 5% of melee damage"
  reflect: /^reflects?\s+(?:all\s+)?(?<n>\d+(?:[.,]\d+)?)%\s+(?:of\s+)?(?:(?:melee|short[- ]range)\s+damage(?:\s+taken)?|damage\s+taken\s+from\s+melee\s+attackers)$/i,
  parenMeta: /^\(.*\)$/,
  // marker glued to the start of the line itself: "Set refine 9+: ASPD Limit +1"
  inlineMarker: /^(?<mk>(?:set\s+)?refine\s+\+?\d+\+?|\+\d+\s+refine|per\s+(?:\d+\s+)?(?:total\s+set\s+)?refines?|\d+\s+pieces?|set\s+bonus|piece\s+bonus|innate|bonus|base\s+level\s+\d+\+?)\s*:\s*(?<rest>.+)$/i,
  // "Damage against all races +10%" / "Resistance vs Boss -5%"
  // "Physical and magic damage vs Human and Demon +1%", "Defense vs All Sizes +5%", "Damage and Resistance vs All Sizes +5%"
  vsGeneric: /^(?<kind>damage\s+and\s+resistance|physical(?:\s+and\s+magic(?:al)?)?\s+(?:dmg|damage)|dmg|damage|attack|resistance|res|defen[cs]e)\s+(?:vs\.?|against|to)\s+(?<t>[A-Za-z ,/-]+?)\s*(?<sign>[+-])?\s*(?<n>\d+(?:[.,]\d+)?)\s*%?$/i,
  statusResist: /^(?<st>freeze|stun|stone|curse|silence|sleep|blind|bleed|poison|confusion|frozen|petrify|status)\s+resistance\s*(?<sign>[+-])?\s*(?<n>\d+(?:[.,]\d+)?)\s*%?$/i,
  fragment: /^(?:lv\s*\d+|\d+|[a-z][a-z ]{0,18}\s*[+-]\s*\d)/,
  perRefine: /^per\s+(?:(\d+)\s+)?(?:total\s+set\s+)?refines?\s*:?\s*$/i,
  perTotalSet: /^per\s+(?:(\d+)\s+)?total\s+set\s+refines?\s*:?\s*$/i,
  refineMin: /^(?:set\s+)?refine\s+(\d+)\+\s*:?\s*$/i,
  // ATK+10% | Perfect Dodge +7 | Move Speed: 003% | HP -25%
  keyed: /^(?<k>[A-Za-z][A-Za-z0-9 ,'/&()-]*?)\s*[:]?\s*(?<sign>[+-])?\s*(?<n>\d+(?:[.,]\d+)?)\s*(?<pct>%?)\s*(?:s|secs?|seconds?|cells?)?$/,
  // ... per refine / per upgrade
  suffixPerRefine: /\s+per\s+(?:(\d+)\s+)?(refines?|upgrades?)$/i,
  slashUpgrade: /\/\s*upgrade$/i,
  // HP +2 per VIT
  suffixPerStat: /\s+per\s+(?:(\d+)\s+)?(base\s+)?(str|agi|vit|int|dex|luk)$/i,
  chance: /^\s*(\d+(?:[.,]\d+)?)\s*%?\s*chance/i,
  situational: /\b(when|while|if|during|after|upon|every\s+\d+\s+sec|for\s+\d+\s+sec|chance)\b/i,
  dmgVs: /^(?:dmg|damage|atk)\s+(?:vs|against|to)\s+(?<t>[A-Za-z /]+?)\s*(?<sign>[+-])?\s*(?<n>\d+(?:[.,]\d+)?)\s*%?$/i,
  resist: /^(?<t>[A-Za-z ,/]+?)\s+(?:resistance|resist|res)\s*(?<sign>[+-])?\s*(?<n>\d+(?:[.,]\d+)?)\s*%?$/i,
  skillLv: /^(?<s>[A-Za-z][A-Za-z '-]*?)\s+lv\s*:?\s*(?<n>\d+)$/i,
  extraDmgUpgrade: /^extra\s+(\d+(?:[.,]\d+)?)%\s+damage\s*\/\s*upgrade$/i,
  // "Takes effect 15 seconds after equipping." (gems): activation notice, not a bonus
  lore: /^(?=(?:\S+\s+){3,})[A-Za-z][^+%:]*$/,
  // effects the engine does not model are not lore either: autocast, Lv3, "for 10 s", 5x5, Combo Ready, MaxHP limit…
  effectWord: /lv\s*\d|\d+\s*x\s*\d|\bfor\s+\d|\d+\s*(?:s|min)\b|\b(autocasts?|autospells?|combo|ready|seals?|maxhp|limit|spawns?|splash\w*|field|targets?|worn|refill|rewards?|exchange|mirror|barrier|warp\w*|opened|inventory|hp|sp|atk|matk|def|mdef|damage|dmg|hit|flee|cast|delay|speed|cooldown|crit\w*|range|cells?|chance|seconds?|secs?|minutes?|lv|level|refines?|upgrade|str|agi|vit|int|dex|luk|stats?|resist\w*|heal\w*|leech|aspd|exp|drop|dodge|penetration|reflect|autocast|element|pieces?|set|bonus|per|every|increases?|reduces?|summons?|grants?|enables?|skill|size|race|attack|weight|zeny|regen\w*|recovery|immune|status|duration|stack\w*|hits?|splash|target)\b/i,
  // base and per-refine bonus on the same line: "HP/SP Regeneration +10% +5% per Upgrade" (runes)
  twoStep: /^(?<k>[A-Za-z][A-Za-z '/&-]*?)\s*(?<s1>[+-])\s*(?<n1>\d+(?:[.,]\d+)?)\s*(?<p1>%?)\s+(?<s2>[+-])\s*(?<n2>\d+(?:[.,]\d+)?)\s*(?<p2>%?)\s+per\s+(?:refine|upgrade)$/i,
  activationDelay: /^takes\s+effect\s+\d+\s+seconds?\s+after\s+equipping$/i,
  // inverted form: "+4% Move Speed", "+1 Magic Defense Penetration"
  numFirst: /^(?<sign>[+-])\s*(?<n>\d+(?:[.,]\d+)?)\s*(?<pct>%?)\s+(?<k>[A-Za-z][A-Za-z0-9 '/&-]*)$/,
  // "Rolling Flames +2% Damage" / "Claymore Trap -20% Damage"
  skillDmgAfter: /^(?<s>[A-Za-z][A-Za-z ,'-]*?)\s+(?<sign>[+-])\s*(?<n>\d+(?:[.,]\d+)?)\s*%\s+damage$/i,
  // "Conflagration -0.5 s cooldown"
  skillCdAfter: /^(?<s>[A-Za-z][A-Za-z '-]*?)\s+(?<sign>[+-])\s*(?<n>\d+(?:[.,]\d+)?)\s*s(?:ec(?:onds?)?)?\s+cooldown$/i,
}

const SKILL_SUFFIX = [
  [/\s+cooldown\s+reduction$/i, 'skill_cooldown'],
  [/\s+(?:dmg|damage)$/i, 'skill_dmg'],
  [/\s+sp\s+cost$/i, 'skill_sp_cost'],
  [/\s+cooldown$/i, 'skill_cooldown'],
  [/\s+duration$/i, 'skill_duration'],
]

const num = (s) => Number(String(s).replace(',', '.'))
// "Leech Power +5% (no rate)": a trailing note WITHOUT a number does not change the effect. With a number ("(3s)") it is a duration: keep it
const clean = (l) => l.trim().replace(/%%/g, '%').replace(/^innate\s*:\s*/i, '').replace(/[.,;]+$/, '').replace(/(\d%?)\s*\((?![^)]*\d)[^)]*\)$/, '$1').trim()
const norm = (k) => k.toLowerCase().replace(/\s+/g, ' ').trim()

/** "Demi-Humans" / "Human" / "Bosses" -> the vocabulary's singular names */
const target1 = (p) => {
  const t = p.replace(/-/g, '').replace(/\s+(element|elemental|race|size|monsters?|enemies|enemy|targets?|type)$/, '')
  if (/^boss(es)?$/.test(t)) return 'boss'
  // singular only when it is a known name: "Formless" stays (it used to become "formles")
  const known = (x) => ELEMENTS.includes(x) || RACES.includes(x) || SIZES.includes(x)
  const one = [t, t.replace(/s$/, ''), t.replace(/es$/, '')].find(known) ?? t.replace(/s$/, '')
  return one === 'human' ? 'demihuman' : one
}

function scopeOf(target) {
  const t = norm(target).replace(/^(all\s+)?/, '').replace(/\s+(element|elemental|race|size|monsters?|type)$/g, '')
  const parts = t.split(/\s*\/\s*|\s*,\s*|\s+and\s+/).map(target1)
  const out = []
  for (const p of parts) {
    if (p === 'boss') out.push(['dmg_vs_boss', {}])
    else if (ELEMENTS.includes(p)) out.push(['dmg_vs_element', { element: p }])
    else if (RACES.includes(p)) out.push(['dmg_vs_race', { race: p }])
    else if (SIZES.includes(p)) out.push(['dmg_vs_size', { size: p }])
  }
  return out
}

/** Converts marker text ("Set refine 9+", "3 Pieces") into a Cond. */
function condFromMarker(txt) {
  const t = norm(txt)
  let m
  if ((m = /^(?:set\s+)?refine\s+\+?(\d+)/.exec(t)) || (m = /^\+(\d+)\s+refine/.exec(t))) return { t: 'refine_min', n: +m[1] }
  if ((m = /^per\s+(?:(\d+)\s+)?total\s+set\s+refines?/.exec(t))) return { t: 'per_set_refine', each: m[1] ? +m[1] : 1 }
  if ((m = /^per\s+(?:(\d+)\s+)?refines?/.exec(t))) return { t: 'per_refine', each: m[1] ? +m[1] : 1 }
  if ((m = /^(\d+)\s+pieces?/.exec(t))) return { t: 'set_pieces', n: +m[1] }
  if ((m = /^base\s+level\s+(\d+)/.exec(t))) return { t: 'level_min', n: +m[1] }
  return { t: 'always' }
}

function mk(key, value, pct, cond, scope, src, raw) {
  return { key, value, pct, ...(scope && Object.keys(scope).length ? { scope } : {}), cond, src, raw }
}

/**
 * Pre-pass: the dump splits effects mid-way ("Magic Defense Penetration" \n "+10")
 * and packs several into one line ("ATK+3%,MATK+3%"). Undo both before parsing.
 * Returns [{ text, line }], keeping the original line index.
 */
const GLUED = /(\d%?)(?=[A-Z][a-z]{2,}(?: [A-Za-z]+)* ?[+-]\d)/g

function unwrap(rawLines) {
  const out = []
  for (let i = 0; i < rawLines.length; i++) {
    let t = rawLines[i].trim()
    if (!t) continue
    // merge with the next line when this one has no number and the next starts with one
    const next = (rawLines[i + 1] || '').trim()
    if (!/\d/.test(t) && /^[+-]?\d/.test(next) && t.length <= 42 && !/[.!?]$/.test(t)) {
      t = `${t} ${next}`
      i++
    // 2026-09-30: a set header split in two ("Aggressive Orphan Set" / "Bonus:") was not seen as a header,
    // so the set bonus was applied by every piece
    } else if (/\bset$/i.test(t) && /^bonus\s*:?\s*$/i.test(next)) {
      t = `${t} ${next}`
      i++
    // "At set refine 9+ and again" / "at 18+:"
    } else if (/\band again$/i.test(t) && /^at\s+\d+\+?\s*:?\s*$/i.test(next)) {
      t = `${t} ${next}`
      i++
    // a line with no number continued in lower case ("Wind elemental magic" / "damage +2%"): the
    // second half alone read as "+2% damage" on anything
    } else if (!/\d/.test(t) && /^[a-z]/.test(next) && /\d/.test(next) && t.length <= 42 && !/[.!?:]$/.test(t)) {
      t = `${t} ${next}`
      i++
    }
    // 2026-10-01: the dump wraps at ~28 characters, anywhere in a sentence. Keep joining while the line
    // is visibly unfinished: "Critical +5, Critical Damage" / "+10%" (the last item has no number),
    // "DMG vs non-boss +1% per" / "refine", "Critical +1, +1 per 5 base" / "DEX."
    for (;;) {
      const nx = (rawLines[i + 1] || '').trim()
      if (!nx || /:\s*$/.test(t)) break
      // last item of the line (after the last "," or ":") has no number: "Critical +5, Critical Damage" / "+10%",
      // "Set refine 9+: After Cast" / "Delay -20%", "Per refine: HP +50, Move" / "Speed +1%"
      const tail = t.split(/[,:]|\s+and\s+/).pop().trim()
      const marker = /^(per\s|set\s|piece|innate|bonus|requirement)/i.test(nx) || /:\s*$/.test(nx)
      // ...but not a sentence ("…a 5% chance to leave a field on the target, on level learned" + "MATK -10%")
      const danglingKey = /\d/.test(t) && tail && !/\d/.test(tail) && tail.length <= 30 && /\d/.test(nx) && !marker && !/[).]$/.test(t)
        && !/\b(chance|when|while|upon|during|learned|your|you|has|have|is|are|within|consumes|valid)\b/i.test(t)
      const danglingPer = /\bper(\s+\d+)?$/i.test(t)
      const danglingWord = /\b(base|of|and|or|vs\.?|to|by|the|with|total(\s+set)?|set|for|from|every|each)$/i.test(t) && !marker
      // "+1% Resistance vs Dragon" / "and Undead"
      const andNext = /^(and|or)\s/i.test(nx) && !/\d/.test(nx) && /\d/.test(t)
      // "Physical and magic damage" / "vs Human" / "and Demon +1%": a heading with no number goes on
      const vsNext = !/\d/.test(t) && /^(vs\.?|and|or|against)\s/i.test(nx) && t.length <= 42
      if (!danglingKey && !danglingPer && !danglingWord && !andNext && !vsNext) break
      t = `${t} ${nx}`
      i++
    }
    // split compounds: "ATK+3%,MATK+3%"
    // ...but not a list of targets: "Fire, Water, Wind and Earth Resistance +5%" (a part with no number)
    // a part with no number is the head of a list and stays with the next part:
    // "Queen's Brand, Plague Impress and Dragon Breath DMG+20%"
    const split = []
    let head = ''
    for (const x of t.split(',').map((y) => y.trim()).filter(Boolean)) {
      if (/\d/.test(x)) { split.push(head ? `${head}, ${x}` : x); head = '' } else head = head ? `${head}, ${x}` : x
    }
    if (head) split.push(split.length ? `${split.pop()}, ${head}` : head)
    const joined0 = t.includes(',') && /\d/.test(t) && !RE.situational.test(t) ? split : [t]
    // "ATK +1 and MATK +1 per set refine": two effects sharing the suffix
    const joined = joined0.flatMap((x) => {
      // also after a marker: "Set refine 18+: ASPD +10% and Variable Cast -10%"
      const m = /^((?:[^:]*:\s*)?)([A-Za-z][A-Za-z '/-]*?\s*[+-]\s*\d+(?:[.,]\d+)?%?)\s+and\s+([A-Za-z][A-Za-z '/-]*?\s*[+-]\s*\d+(?:[.,]\d+)?\s*(?:s|%)?)\.?(\s+per\s+.+)?$/i.exec(x)
      return m ? [m[1] + m[2] + (m[4] ?? ''), m[1] + m[3] + (m[4] ?? '')] : [x]
    })
    // and two effects glued with no break: "Leech Power +10%Perfect Dodge +5"
    // and two sentences: "ATK -2. MATK -2."
    const parts = joined.flatMap((x) => x.replace(GLUED, '$1\n').replace(/(\d%?)\.\s+(?=[A-Z])/g, '$1\n').split('\n'))
    for (const part of parts.flatMap(everyBase)) out.push({ text: part, line: i })
  }
  return out
}

// 2026-10-02: "Every 9 base STR gives you 1 extra STR" (Megingjard and the other Asgard accessories),
// "Every 9 base AGI gives you 2 extra flat DEF and 1 Perfect Dodge" (Backwak), "Every 10 base INT increases ATK by 1"
// (Vine Willow Card) rewritten in the "X +n per N base S" form the parser already understands
const STAT_WORD = '(str|agi|vit|int|dex|luk)'
function everyBase(t) {
  let m = new RegExp(`^every\\s+(\\d+)\\s+base\\s+${STAT_WORD}\\s+gives\\s+you\\s+(.+?)\\.?$`, 'i').exec(t)
  if (m) {
    const [, n, stat, rest] = m
    return rest.split(/\s+and\s+/i).map((x) => {
      const g = /^(\d+)\s+(?:extra\s+)?(?:flat\s+)?(.+)$/i.exec(x.trim())
      return g ? `${g[2].replace(/^extra\s+/i, '')} +${g[1]} per ${n} base ${stat}` : x
    })
  }
  m = new RegExp(`^every\\s+(\\d+)\\s+base\\s+${STAT_WORD}\\s+increases\\s+(.+?)\\s+by\\s+(\\d+)\\.?$`, 'i').exec(t)
  if (m) return [`${m[3]} +${m[4]} per ${m[1]} base ${m[2]}`]
  return [t]
}

/**
 * @param {string} desc  raw `desc` field from the dump
 * @param {number} itemId
 * @returns {{mods, unparsed, lines, numeric}}
 */
export function parseDesc(desc, itemId) {
  const mods = []
  const unparsed = []
  let cond = { t: 'always' }
  let lastKeys = null
  let lastMods = []
  let setName = null
  /** name of the last "X Set Bonus:" block: set refine conditions belong to it */
  let curSet = null
  /** base stat requirement ("Base VIT 90:"): applies until the next marker */
  let gate = null
  const pieces = unwrap(String(desc || '').split('\n'))
  let numeric = 0

  for (const { text, line } of pieces) {
    const mark = mods.length
    ;(() => {
    const raw = text
    const src = { itemId, line }
    const hasNum = /\d/.test(raw)
    if (hasNum) numeric++
    // a line nothing could read that is about economy, drops, revival… is "not modeled", not "not understood"
    const drop = (reason) => unparsed.push({ itemId, line, raw,
      reason: reason !== 'sem_numero' && RE.notModeled.test(raw) ? 'nao_modelado' : reason })
    let l = clean(raw)
    let m

    // --- marker glued at the start: apply it and keep parsing the rest ---
    let inlineCond = null
    while ((m = RE.inlineMarker.exec(l))) {
      inlineCond = condFromMarker(m.groups.mk)
      if (inlineCond.t === 'per_set_refine' && cond.t === 'set_bonus') inlineCond.set = cond.set
      // "Set refine 9+: ASPD Limit +1" inside a set block: total refine of the set
      const sr = /^set\s+refine\s+\+?(\d+)/i.exec(m.groups.mk)
      if (sr && curSet) inlineCond = { t: 'set_refine', ns: [+sr[1]], set: curSet }
      l = m.groups.rest.trim()
    }

    // --- context markers ---
    // retroactive suffix: applies to the previous line(s), not the following ones
    if ((m = RE.retroPerRefine.exec(l))) {
      const each = m[1] ? +m[1] : 1
      const isSet = /total\s+set/i.test(l)
      for (const prev of lastMods) {
        const set = prev.cond.t === 'set_bonus' ? prev.cond.set : undefined
        prev.cond = isSet ? { t: 'per_set_refine', each, ...(set ? { set } : {}) } : { t: 'per_refine', each }
      }
      return
    }
    if ((m = RE.perSkillLv.exec(l))) {
      // "X or Y": the engine sums the levels of both [measured in-game 2026-09-28; supersedes the 2026-09-27 player report]
      cond = { t: 'per_skill_lv', skills: m.groups.s.split(/\s+or\s+/i).map(norm) }
      gate = null
      return
    }
    if ((m = RE.baseStatIf.exec(l))) {
      const n = +m.groups.n
      const op = (m.groups.op || '').toLowerCase()
      gate = op === '<' ? { stat: m.groups.st.toLowerCase(), max: n - 1 }
        : op === '<=' ? { stat: m.groups.st.toLowerCase(), max: n }
        : { stat: m.groups.st.toLowerCase(), min: op === 'over' || op === 'above' || op === '>' ? n + 1 : n }
      cond = { t: 'always' }
      return
    }
    if ((m = RE.perBaseStat.exec(l))) { cond = { t: 'per_base_stat_min', n: +m.groups.n + 1 }; gate = null; return }
    if ((m = RE.setBonus.exec(l))) {
      gate = null
      cond = { t: 'set_bonus', set: norm(m.groups.set) || setName || 'set' }
      curSet = cond.set
      return
    }
    // "Full Shadow Card Set" on a line of its own (no colon, no "Bonus:"): what follows is a set bonus
    if (!hasNum && l.length <= 40 && /^[A-Z][A-Za-z '&-]*\bSet$/.test(l)) {
      gate = null
      cond = { t: 'set_bonus', set: norm(l.replace(/\s*set$/i, '')) }
      curSet = cond.set
      return
    }
    if (curSet && (m = RE.setRefine.exec(l))) {
      cond = { t: 'set_refine', ns: [+m[1], ...(m[2] ? [+m[2]] : [])], set: curSet }; gate = null; return
    }
    if ((m = RE.setName.exec(l))) { setName = norm(m.groups.set); return }
    if ((m = RE.perTotalSet.exec(l))) {
      // inside "X Set Bonus:" the refine that counts is the sum over the set's pieces
      const set = cond.t === 'set_bonus' ? cond.set : cond.t === 'per_set_refine' ? cond.set : undefined
      cond = { t: 'per_set_refine', each: m[1] ? +m[1] : 1, ...(set ? { set } : {}) }; gate = null; return
    }
    if ((m = RE.copiesMarker.exec(l))) {
      const w = { two: 2, three: 3, four: 4 }[m[1].toLowerCase()] ?? +m[1]
      cond = { t: 'copies_min', n: w }; gate = null; return
    }
    if ((m = RE.perRefine.exec(l))) { cond = { t: 'per_refine', each: m[1] ? +m[1] : 1 }; gate = null; return }
    if ((m = RE.refineMin.exec(l)) || (m = RE.refineIf.exec(l))) { cond = { t: 'refine_min', n: +m[1] }; gate = null; return }
    if ((m = RE.levelIf.exec(l))) { cond = { t: 'level_min', n: +m[1] }; gate = null; return }
    if (RE.marker.test(l)) { cond = { t: 'always' }; gate = null; return }
    if (RE.slotsMeta.test(l)) return
    if (/^requirement\s*:/i.test(l) || /^\[.*\]$/.test(l) || /^shadow gear worn by/i.test(l)) return

    // --- condition in the line suffix ---
    let lineCond = inlineCond ?? cond
    // "Lashing Andromeda DMG +5% +2% per refine": the same two steps on a skill
    if ((m = RE.twoStep.exec(l)) && !ALIAS.has(norm(m.groups.k))) {
      const hit = SKILL_SUFFIX.find(([rx]) => rx.test(norm(m.groups.k)))
      if (hit) {
        const sk = norm(m.groups.k).replace(hit[0], '').trim()
        mods.push(mk(hit[1], (m.groups.s1 === '-' ? -1 : 1) * num(m.groups.n1), m.groups.p1 === '%', lineCond, { skill: sk }, src, raw))
        mods.push(mk(hit[1], (m.groups.s2 === '-' ? -1 : 1) * num(m.groups.n2), m.groups.p2 === '%', { t: 'per_refine', each: 1 }, { skill: sk }, src, raw))
        return
      }
    }
    if ((m = RE.twoStep.exec(l)) && ALIAS.has(norm(m.groups.k))) {
      const keys = ALIAS.get(norm(m.groups.k))
      for (const key of keys) {
        mods.push(mk(key, (m.groups.s1 === '-' ? -1 : 1) * num(m.groups.n1), m.groups.p1 === '%', lineCond, null, src, raw))
        mods.push(mk(key, (m.groups.s2 === '-' ? -1 : 1) * num(m.groups.n2), m.groups.p2 === '%', { t: 'per_refine', each: 1 }, null, src, raw))
      }
      lastKeys = keys
      return
    }
    if ((m = /\s+per\s+(?:(\d+)\s+)?(?:total\s+)?set\s+refines?$/i.exec(l))) {
      // "ATK +1 per set refine" inside a set block: total refine of the set
      const set = cond.t === 'set_bonus' ? cond.set : curSet ?? undefined
      lineCond = { t: 'per_set_refine', each: m[1] ? +m[1] : 1, ...(set ? { set } : {}) }
      l = l.slice(0, m.index).trim()
    } else if ((m = RE.suffixPerRefine.exec(l))) {
      lineCond = { t: 'per_refine', each: m[1] ? +m[1] : 1 }
      l = l.slice(0, m.index).trim()
    } else if (RE.slashUpgrade.test(l)) {
      lineCond = { t: 'per_refine', each: 1 }
      l = l.replace(RE.slashUpgrade, '').trim()
    } else if ((m = RE.suffixPerStat.exec(l))) {
      // inside "X Set Bonus:" it stays a set bonus: without the set it applied once per piece
      lineCond = { t: 'per_stat', stat: m[3].toLowerCase(), each: m[1] ? +m[1] : 1,
        ...(m[2] ? { base: true } : {}), ...(cond.t === 'set_bonus' ? { set: cond.set } : {}) }
      l = l.slice(0, m.index).trim()
    }

    // --- "Extra +1%" / "Extra 3% damage": continues the previous line's effect ---
    if ((m = RE.extraCont.exec(l))) {
      const rest = norm(m.groups.rest || '')
      // "Heal SP cost -9%, plus 9% more per refine": with no sign, "plus" goes the same way as the previous value
      const inherit = !m.groups.sign && /plus/i.test(m.groups.lead) && lastMods.length && lastMods[0].value < 0 ? -1 : 1
      const v = (m.groups.sign === '-' ? -1 : 1) * inherit * num(m.groups.n)
      const pct = m.groups.pct === '%'
      const keys = rest && ALIAS.has(rest) ? ALIAS.get(rest)
        : rest === 'damage' ? ['dmg_pct']
        : lastKeys
      // no keyword: repeats the previous line's effects WITH their target ("Fire and Earth Resistance +5%" / "Extra +1% per refine")
      if (!rest && lastMods.length && lastMods.some((x) => x.scope)) {
        for (const prev of lastMods) mods.push(mk(prev.key, v, pct, lineCond, prev.scope, src, raw))
        return
      }
      if (keys) {
        for (const key of keys) mods.push(mk(key, v, pct, lineCond, null, src, raw))
        return
      }
      drop('forma_desconhecida'); return
    }
    if ((m = RE.bareCont.exec(l))) {
      const rest = norm(m.groups.rest || '')
      const keys = rest ? ['dmg_pct'] : lastKeys
      if (keys) {
        const v = (m.groups.sign === '-' ? -1 : 1) * num(m.groups.n)
        for (const key of keys) mods.push(mk(key, v, m.groups.pct === '%', lineCond, null, src, raw))
        return
      }
      drop('forma_desconhecida'); return
    }

    if (RE.activationDelay.test(l)) { drop('sem_numero'); return } // informational, not a bonus
    // "Magic Damage +7%", "Dark Magic DMG+10%", "Fire, Water, Wind and Earth magic DMG +20%",
    // "Water-element magic damage +2% per refine": magic damage, overall or for the skill's element.
    // Used to fall into skillDmgAfter as a skill called "magic" / "fire magic" and count for nothing (2026-10-01)
    if ((m = /^(?<els>[a-z ,\/-]*?)\s*(?:-?element(?:al)?\s+)?magic(?:al)?\s+(?:dmg|damage)(?:\s+vs\s+all\s+sizes)?\s*(?<sign>[+-])\s*(?<n>\d+(?:[.,]\d+)?)\s*%(?<pr>\s+per\s+refine)?$/i.exec(l))) {
      const els = norm(m.groups.els).replace(/-$/, '').trim()
      const v = (m.groups.sign === '-' ? -1 : 1) * num(m.groups.n)
      const c = m.groups.pr ? { t: 'per_refine', each: 1 } : lineCond
      if (els === '' || els === 'final' || els === 'all elemental' || els === 'all') {
        mods.push(mk('magic_dmg', v, true, c, null, src, raw)); return
      }
      const list = els.split(/\s*,\s*|\s*\/\s*|\s+and\s+/).filter(Boolean)
      if (list.every((e) => ELEMENTS.includes(e))) {
        for (const e of list) mods.push(mk('magic_dmg', v, true, c, { element: e }, src, raw))
        return
      }
      // "Real Magic Damage" is the Real Magic Attack skill: falls through to skillDmgAfter
      if (els !== 'real') { drop('forma_desconhecida'); return }  // "Natural elements", "Other elements": which elements is not stated
    }
    if ((m = RE.skillDmgAfter.exec(l))) {
      const v = (m.groups.sign === '-' ? -1 : 1) * num(m.groups.n)
      for (const sk of norm(m.groups.s).split(/\s*,\s*|\s+and\s+/).filter(Boolean)) mods.push(mk('skill_dmg', v, true, lineCond, { skill: sk }, src, raw))
      lastKeys = ['skill_dmg']; return
    }
    if ((m = RE.skillCdAfter.exec(l))) {
      const v = (m.groups.sign === '-' ? -1 : 1) * num(m.groups.n)
      mods.push(mk('skill_cooldown', v, false, lineCond, { skill: norm(m.groups.s) }, src, raw)); return
    }
    if ((m = RE.numFirst.exec(l))) {
      const keys = ALIAS.get(norm(m.groups.k))
      if (keys) {
        const v = (m.groups.sign === '-' ? -1 : 1) * num(m.groups.n)
        for (const key of keys) mods.push(mk(key, v, m.groups.pct === '%', lineCond, null, src, raw))
        lastKeys = keys
        return
      }
    }
    if ((m = RE.piecesMarker.exec(l))) { cond = { t: 'set_pieces', n: +m[1] }; return }
    if (RE.parenMeta.test(l)) return
    if ((m = RE.reflect.exec(l))) {
      mods.push(mk('reflect_melee', num(m.groups.n), true, lineCond, null, src, raw)); lastKeys = ['reflect_melee']; return
    }
    if ((m = RE.skillColonLv.exec(l))) {
      mods.push(mk('skill_lv', +m.groups.n, false, lineCond, { skill: norm(m.groups.s) }, src, raw)); return
    }

    // prefixes that change nothing: "Special: ASPD +5%", "Dark Weapon +10% Damage vs Fire" (the endow is the item's)
    l = l.replace(/^special\s*:\s*/i, '').replace(/^(?:neutral|water|earth|fire|wind|poison|holy|dark|ghost|undead)\s+weapon\s+/i, '').replace(/\bresist\.\s/i, 'resist ')
    // "Holy damage taken -5% per upgrade": resistance to that element
    if ((m = /^(?<e>neutral|water|earth|fire|wind|poison|holy|dark|ghost|undead)\s+damage\s+(?:taken|received)\s*(?<sign>[+-])\s*(?<n>\d+(?:[.,]\d+)?)\s*%$/i.exec(l))) {
      mods.push(mk('resist_element', (m.groups.sign === '-' ? 1 : -1) * num(m.groups.n), true, lineCond, { element: m.groups.e.toLowerCase() }, src, raw)); return
    }
    // "Reduces all physical damage by 1% per refine" (Deathland Greaves, Deathbound Armor, Deathcover Mantle)
    if ((m = /^reduces\s+all\s+(?<k>physical|magic|special)\s+damage\s+by\s+(?<n>\d+(?:[.,]\d+)?)%$/i.exec(l))) {
      const keys = { physical: ['resist_melee', 'resist_long'], magic: ['resist_matk'], special: ['resist_misc'] }[m.groups.k.toLowerCase()]
      for (const key of keys) mods.push(mk(key, num(m.groups.n), true, lineCond, null, src, raw))
      return
    }
    // "Increase resistance to all elements except Neutral by 1% per refine" (Asgard's Broken Wall)
    if ((m = /^increase\s+resistance\s+to\s+all\s+elements\s+except\s+(?<x>\w+)\s+by\s+(?<n>\d+(?:[.,]\d+)?)%$/i.exec(l))) {
      for (const e of ELEMENTS.filter((x) => x !== m.groups.x.toLowerCase())) mods.push(mk('resist_element', num(m.groups.n), true, lineCond, { element: e }, src, raw))
      return
    }
    // "Regen 1 SP per refine every second", "Regenerates 5 SP per second", "Lose 5 HP per refine every second"
    if ((m = /^(?<verb>regen(?:erates?)?|recovers?|lose|loses)\s+(?<n>\d+)\s+(?<w>sp|hp)(?<pr>\s+per\s+refine)?\s+(?:per|every)\s+second$/i.exec(l))) {
      const v = (/^los/i.test(m.groups.verb) ? -1 : 1) * +m.groups.n
      mods.push(mk(`${m.groups.w.toLowerCase()}_per_sec`, v, false, m.groups.pr ? { t: 'per_refine', each: 1 } : lineCond, null, src, raw)); return
    }
    // "Adds DEF equal to 10% of your total ATK" (Heir to the King)
    if ((m = /^adds\s+(?<d>m?def)\s+equal\s+to\s+(?<n>\d+(?:[.,]\d+)?)%\s+of\s+your\s+total\s+(?<a>m?atk)$/i.exec(l))) {
      mods.push(mk(`${m.groups.d.toLowerCase()}_from_${m.groups.a.toLowerCase()}`, num(m.groups.n), true, lineCond, null, src, raw)); return
    }
    // inverted target form: "+1% Resistance vs Dragon and Undead", "-10% Damage vs Dark"
    if ((m = /^(?<n>[+-]?\s*\d+(?:[.,]\d+)?\s*%?)\s+(?<rest>(?:damage|dmg|resistance|attack|defen[cs]e)\s+(?:vs\.?|against|to)\s+.+)$/i.exec(l))) {
      l = `${m.groups.rest.replace(/\s+to\s+/i, ' vs ')} ${m.groups.n.replace(/\s+/g, '')}`
    }
    // "Bonus AGI +3 if Base Stat is 99" (stat gloves): the stat itself, gated on its allocated value
    if ((m = /^bonus\s+(?<st>str|agi|vit|int|dex|luk)\s*(?<sign>[+-])\s*(?<n>\d+)\s+if\s+base\s+stat\s+is\s+(?<min>\d+)$/i.exec(l))) {
      const st = m.groups.st.toLowerCase()
      const x = mk(st, (m.groups.sign === '-' ? -1 : 1) * +m.groups.n, false, lineCond, null, src, raw)
      x.req = { stat: st, min: +m.groups.min }
      mods.push(x); return
    }
    // "Double Attack Lv4 (40%)": the percentage is the rate
    if ((m = /^double\s+attack\s+lv\s*\d+\s*\((?<n>\d+)%\)$/i.exec(l))) {
      mods.push(mk('double_attack_rate', +m.groups.n, true, lineCond, null, src, raw)); return
    }
    if ((m = RE.statusResist.exec(l))) {
      const v = (m.groups.sign === '-' ? -1 : 1) * num(m.groups.n)
      mods.push(mk('resist_status', v, true, lineCond, { status: norm(m.groups.st) }, src, raw)); return
    }
    if ((m = RE.vsGeneric.exec(l))) {
      const kind = norm(m.groups.kind)
      // "Damage and Resistance vs X" is both; "Defense vs X" is resistance
      const sides = /and resistance/.test(kind) ? [false, true] : [/^(res|defen)/.test(kind)]
      const t = norm(m.groups.t)
      const v = (m.groups.sign === '-' ? -1 : 1) * num(m.groups.n)
      const before = mods.length
      for (const isRes of sides) {
        if (/^non-?boss(es)?$/.test(t)) {
          mods.push(mk(isRes ? 'resist_nonboss' : 'dmg_vs_nonboss', v, true, lineCond, null, src, raw)); continue
        }
        if (/^all\s+(races?|elements?|sizes?)$/.test(t)) {
          const k = /race/.test(t) ? 'race' : /element/.test(t) ? 'element' : 'size'
          const list = k === 'race' ? RACES : k === 'element' ? ELEMENTS : SIZES
          const key = isRes ? `resist_${k}` : `dmg_vs_${k}`
          for (const x of list) mods.push(mk(key, v, true, lineCond, { [k]: x }, src, raw))
          continue
        }
        for (const [key, scope] of scopeOf(t)) {
          mods.push(mk(isRes ? key.replace('dmg_vs', 'resist') : key, v, true, lineCond, scope, src, raw))
        }
      }
      if (mods.length > before) return
    }

    // --- shape rules ---
    if ((m = RE.dmgVs.exec(l))) {
      const pairs = scopeOf(m.groups.t)
      if (pairs.length) {
        const v = (m.groups.sign === '-' ? -1 : 1) * num(m.groups.n)
        for (const [key, scope] of pairs) mods.push(mk(key, v, true, lineCond, scope, src, raw))
        lastKeys = pairs.map(([k]) => k)
        return
      }
    }
    if ((m = RE.resist.exec(l))) {
      const t = norm(m.groups.t)
      const v = (m.groups.sign === '-' ? -1 : 1) * num(m.groups.n)
      const before = mods.length
      for (const p0 of t.split(/\s*[/,]\s*|\s+and\s+/)) {
        const p = /^all elements?$/.test(p0) ? 'all' : target1(p0)
        if (p === 'all') { for (const e of ELEMENTS) mods.push(mk('resist_element', v, true, lineCond, { element: e }, src, raw)); continue }
        if (ELEMENTS.includes(p)) mods.push(mk('resist_element', v, true, lineCond, { element: p }, src, raw))
        else if (RACES.includes(p)) mods.push(mk('resist_race', v, true, lineCond, { race: p }, src, raw))
        else if (p === 'boss') mods.push(mk('resist_boss', v, true, lineCond, {}, src, raw))
      }
      if (mods.length > before) { lastKeys = null; return }
    }

    // --- key + number ---
    if ((m = RE.keyed.exec(l))) {
      const k = norm(m.groups.k)
      const v = (m.groups.sign === '-' ? -1 : 1) * num(m.groups.n)
      const pct = m.groups.pct === '%'
      const keys = ALIAS.get(k)
      if (keys) { for (const key of keys) mods.push(mk(key, v, pct, lineCond, null, src, raw)); lastKeys = keys; return }
      let hit = null
      for (const [rx, key] of SKILL_SUFFIX) {
        if (rx.test(k)) { hit = [key, k.replace(rx, '').trim()]; break }
      }
      if (!hit && / lv$/.test(k)) hit = ['skill_lv', k.replace(/ lv$/, '')]
      if (hit) {
        // "Queen's Brand, Plague Impress and Dragon Breath DMG+20%": one modifier per skill
        for (const sk of hit[1].split(/\s*,\s*|\s+and\s+/).filter(Boolean)) mods.push(mk(hit[0], v, pct, lineCond, { skill: sk }, src, raw))
        lastKeys = [hit[0]]
        return
      }
      drop('chave_desconhecida'); return
    }
    if ((m = RE.skillLv.exec(l))) {
      mods.push(mk('skill_lv', +m.groups.n, false, lineCond, { skill: norm(m.groups.s) }, src, raw)); return
    }

    if (!hasNum) { drop('sem_numero'); return }
    // lore with a number ("Leader of the other 4 knighs of Schmidt", "One of the 3 living swords"):
    // a sentence with no sign, no %, no ':' and no effect term is not a bonus
    if (RE.lore.test(l) && !RE.effectWord.test(l)) { drop('sem_numero'); return }
    if (RE.chance.test(l) || RE.situational.test(l)) { drop('condicional'); return }
    drop('forma_desconhecida')
  })()
    if (gate) for (const x of mods.slice(mark)) x.req = gate
    if (mods.length > mark) lastMods = mods.slice(mark)
  }

  return { mods, unparsed, lines: pieces.length, numeric }
}
