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
  spPct: new RegExp(String.raw`requires?\s+(?:an\s+)?extra\s+(?<n>${N})%\s+current\s+sp`, 'i'),
  hpPct: new RegExp(String.raw`requires?\s+(?:an\s+)?extra\s+(?<n>${N})%\s+current\s+hp`, 'i'),
  // "Skill can be critical" / "Skill can be a critical hit" (Scythe Reap)
  crit: /skill can be (?:a )?critical/i,
  // 2026-09-30: "Dark and elemental magic damage" (Conflagration) was read as physical; "magic damage bonus"
  // (Soul Destroyer) is a hybrid and stays physical
  magic: /damage is magical|magical damage|based on matk|\bmagic damage\b(?!\s+bonus)/i,
}

const num = (s) => Number(String(s).replace(',', '.'))

/**
 * @returns {null | {base, coefPerLevel, perStat: {stat, pct}[], cooldown, spPct, canCrit, magic, formulaRaw}}
 */
export function parseSkillFormula(desc) {
  const text = String(desc || '')
  const m = RE.coef.exec(text)
  if (!m) return null
  const line = text.split('\n').find((l) => /damage is/i.test(l)) || ''

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
    spPct: RE.spPct.test(text) ? num(RE.spPct.exec(text).groups.n) : null,
    hpPct: RE.hpPct.test(text) ? num(RE.hpPct.exec(text).groups.n) : null,
    canCrit: RE.crit.test(text),
    castVar: RE.castVar.test(text) ? num(RE.castVar.exec(text).groups.n) : 0,
    castFixed: RE.castFixed.test(text) ? num(RE.castFixed.exec(text).groups.n) : 0,
    magic: RE.magic.test(text),
    formulaRaw: line.trim(),
  }
}
