// Skill damage formula, extracted from the dump text.
// 158 of the 187 skills that state damage match this grammar (36 of 43 classes).

const N = String.raw`\d+(?:[.,]\d+)?`
const RE = {
  // "Damage is 150+15% per level", "Damage is 40% per level", "Damage is 200%+10% per level"
  coef: new RegExp(String.raw`damage is\s+(?:fixed\s+)?(?:(?<base>${N})%?\s*\+\s*)?(?<coef>${N})%?\s*(?:damage\s*)?(?:atk\s*)?per\s+(?:skill\s+)?level`, 'i'),
  // "+2% per LUK", "+1% per 2 LUK and INT", "+3% per Int"
  perStat: /([+-]?\d+(?:[.,]\d+)?)%\s*per\s+(?:(\d+)\s+)?(str|agi|vit|int|dex|luk)(?:\s+and\s+(str|agi|vit|int|dex|luk))?/gi,
  cooldown: new RegExp(String.raw`(?:base\s+)?(?:starting\s+)?cooldown\s+is\s+(?<n>${N})\s*sec`, 'i'),
  castVar: new RegExp(String.raw`variable\s+cast\s+time\s+is\s+(?<n>${N})\s*s`, 'i'),
  castFixed: new RegExp(String.raw`fixed\s+cast\s+time\s+is\s+(?<n>${N})\s*s`, 'i'),
  spPct: new RegExp(String.raw`requires?\s+(?:an\s+)?(?:extra\s+(?<n>${N})%|(?<n2>${N})%\s+extra)\s+current\s+sp`, 'i'),
  hpPct: new RegExp(String.raw`requires?\s+(?:an\s+)?(?:extra\s+(?<n>${N})%|(?<n2>${N})%\s+extra)\s+current\s+hp`, 'i'),
  // "Skill can be critical" / "Skill can be a critical hit" (Scythe Reap)
  crit: /skill can be (?:a )?critical/i,
  // 2026-09-30: "Dark and elemental magic damage" (Conflagration) was read as physical; "magic damage bonus"
  // (Soul Destroyer) is a hybrid and stays physical
  magic: /damage is magical|magical damage|based on matk|\bmagic damage\b(?!\s+bonus)/i,
}

const num = (s) => Number(String(s).replace(',', '.'))
/** "Requires extra 10% current SP" or "Requires 10% extra current SP" (Dark Messenger) */
const pctOf = (re, text) => { const m = re.exec(text); return m ? num(m.groups.n ?? m.groups.n2) : null }

/**
 * @returns {null | {base, coefPerLevel, perStat: {stat, pct}[], cooldown, spPct, canCrit, magic, formulaRaw}}
 */
export function parseSkillFormula(desc) {
  const text = String(desc || '')
  const m = RE.coef.exec(text)
  if (!m) return parseBolt(text)
  // the line with the formula, not the first "damage is" (Dark Message: "Damage is very small…" comes first)
  const lines = text.split('\n')
  const line = lines.find((l) => RE.coef.test(l)) || lines.find((l) => /damage is/i.test(l)) || ''

  const perStat = []
  RE.perStat.lastIndex = 0
  let s
  while ((s = RE.perStat.exec(line))) {
    const pct = num(s[1]) / (s[2] ? Number(s[2]) : 1)
    perStat.push({ stat: s[3].toLowerCase(), pct })
    if (s[4]) perStat.push({ stat: s[4].toLowerCase(), pct })
  }

  return {
    base: m.groups.base ? num(m.groups.base) : 0,
    coefPerLevel: num(m.groups.coef),
    perStat,
    cooldown: RE.cooldown.test(text) ? num(RE.cooldown.exec(text).groups.n) : null,
    spPct: pctOf(RE.spPct, text),
    hpPct: pctOf(RE.hpPct, text),
    canCrit: RE.crit.test(text),
    castVar: RE.castVar.test(text) ? num(RE.castVar.exec(text).groups.n) : 0,
    castFixed: RE.castFixed.test(text) ? num(RE.castFixed.exec(text).groups.n) : 0,
    magic: RE.magic.test(text),
    formulaRaw: line.trim(),
  }
}

// 2026-10-10: Thief bolts (Flaming Petals, Freezing Spear, Wind Blade) had no formula and were missing from the
// palette: "Inflicts 50% MATK Fire magic damage per Hit / Hit amount increases by 1 per level", so 50% × level in total.
// Cast and cooldown grow with level: "Variable cast time increases with level: 0.25s to 7s", "Cooldown is 0.5+0.25s per level"
const BOLT = {
  hit: new RegExp(String.raw`inflicts\s+(?<n>${N})%\s+matk\b[^\n]*per\s+hit`, 'i'),
  hits: /hit amount increases by 1 per level/i,
  cast: (kind) => new RegExp(String.raw`${kind}\s+cast\s+time\s+increases\s+with\s+level:\s*(?<a>${N})s?\s+to\s+(?<b>${N})\s*s`, 'i'),
  cooldown: new RegExp(String.raw`cooldown\s+is\s+(?<a>${N})\s*s?\s*\+\s*(?<b>${N})\s*s\s+per\s+level`, 'i'),
}
const range = (re, text) => { const m = re.exec(text); return m ? [num(m.groups.a), num(m.groups.b)] : null }

function parseBolt(text) {
  const m = BOLT.hit.exec(text)
  if (!m || !BOLT.hits.test(text)) return null
  const cd = range(BOLT.cooldown, text)
  return {
    base: 0,
    coefPerLevel: num(m.groups.n),
    perStat: [],
    // cooldown at Lv L = a + b × L
    cooldown: cd ? cd[0] : null,
    cooldownPerLevel: cd ? cd[1] : undefined,
    spPct: null,
    hpPct: null,
    canCrit: false,
    castVar: 0,
    castFixed: 0,
    // Lv 1 to max level, linear in between (the text only gives the two ends) [db]
    castVarRange: range(BOLT.cast('variable'), text) ?? undefined,
    castFixedRange: range(BOLT.cast('fixed'), text) ?? undefined,
    magic: true,
    formulaRaw: text.split('\n').slice(0, 2).join(' / ').trim(),
  }
}
