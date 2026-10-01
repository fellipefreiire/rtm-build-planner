#!/usr/bin/env node
// ETL: dump/ (read-only) -> src/data/*.json (committed, reviewable as a diff)
// Usage: npm run data
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dump from './dump.mjs'
import { parseDesc } from './effects.mjs'
import { parseSkillFormula } from './skills.mjs'
import { classTree, jobCaps, lineage } from './classlines.mjs'
import { ITEM_OVERRIDES, SKILL_OVERRIDES, isRefinable } from './overrides.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '../../src/data')

/** dump `loc` -> builder slot */
const SLOT = {
  'Weapon': 'weapon', 'Weapon (two-handed)': 'weapon',
  'Off-hand': 'offhand', 'Shield': 'offhand',
  'Armor': 'armor', 'Garment': 'garment', 'Shoes': 'shoes',
  'Upper headgear': 'upper', 'Middle headgear': 'mid', 'Lower headgear': 'lower',
  'Accessory': 'accessory',
  'Shadow armor': 'shadowArmor', 'Shadow shoes': 'shadowShoes',
  'Shadow gloves': 'shadowGloves', 'Shadow accessory': 'shadowAcc',
  'Rune or orb': 'rune', 'Costume': 'costume', 'Ammunition': 'ammo',
  'Top': 'costume', 'Bottom': 'costume',
}

// Relic is excluded: all 81 are category `Usable`, with no refine, no card
// slots and no effects at all; they are quest/collection items, not equipment.
const EQUIP_GRP = new Set([
  'Weapon', 'Armor', 'Shield', 'Headgear', 'Accessory',
  'Shadow gear', 'Class gear', 'Costume', 'Ammunition', 'Other',
])

const asArray = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])

/** Manuals and tomes have their own slot, regardless of the dump's `loc`. */
const MANUAL_CAT = /^(manual|codex|cantrips book|mix cooking book)$/i
/** Pets: the dump only has them as eggs, with no effects. */
const PET_CAT = /^(monster egg|pet egg)$/i

function slotsOf(it) {
  // class gem: its own slot (the 2026-09-28 dump added all 107)
  if (it.cat === 'Class Gem') return ['gem']
  if (it.grp === 'Class gear' && MANUAL_CAT.test(it.cat)) return ['manual']
  if (PET_CAT.test(it.cat)) return ['pet']
  // costumes go in the costume slot, even when the dump gives a real gear loc (Living Reaper: Garment)
  if (it.grp === 'Costume') return ['costume']
  const locs = asArray(it.loc).map((l) => SLOT[l]).filter(Boolean)
  if (locs.length) return [...new Set(locs)]
  if (it.grp === 'Shadow gear') return ['shadowArmor', 'shadowShoes', 'shadowGloves', 'shadowAcc']
  if (it.grp === 'Class gear') return ['rune']
  if (it.grp === 'Headgear') return ['upper']
  return []
}

/**
 * Element the item gives to the weapon (endow) or to the armor. Reads the whole text,
 * because the dump splits the sentence across lines ("Endows weapon attacks\nwith Holy element.").
 * Resistance lines ("Holy Element Resist +10%") do not count.
 */
const ELEMS = ['Neutral', 'Water', 'Earth', 'Fire', 'Wind', 'Poison', 'Holy', 'Dark', 'Ghost', 'Undead']
const elem = (w) => ELEMS.find((e) => e.toLowerCase() === String(w || '').toLowerCase()) ?? null
function elementsOf(desc, slots) {
  const lines = String(desc || '').split('\n').map((l) => l.trim())
  const t = lines.join(' ')
  let m
  const W = [
    /endows? weapon(?: attacks)? with (\w+) element/i, /\b(\w+) element weapon\b/i,
    /\b(\w+) endow on weapon/i, /weapon element becomes (\w+)/i, /weapon attacks become (\w+) element/i,
  ]
  let endow = null
  for (const re of W) if ((m = re.exec(t)) && elem(m[1])) { endow = elem(m[1]); break }
  let armorEl = null
  for (const re of [/change[sd]? armor element to (\w+)/i, /\b(\w+) element armor\b/i]) {
    if ((m = re.exec(t)) && elem(m[1])) { armorEl = elem(m[1]); break }
  }
  // standalone "Holy Element" line: the item's own element. On a weapon it is the
  // attack element; on armor, the armor element. Items that already endow are skipped (Umbral Stars).
  const l = lines.find((x) => /^(\w+) element\.?$/i.test(x))
  if (l && !endow && !armorEl) {
    const e = elem(/^(\w+)/.exec(l)[1])
    if (slots.includes('weapon')) endow = e
    else armorEl = e
  }
  return { endow, armorEl }
}

/**
 * Runes: "Reaping Slash Damage +2%" followed by "Extra 3% damage/Upgrade": the extra belongs
 * to the SAME skill, per refine, not general damage. Rewrites it so the parser reads it that way (19 runes).
 */
function runeExtra(desc) {
  const lines = String(desc || '').split('\n')
  for (let i = 1; i < lines.length; i++) {
    const m = /^Extra (\d+)% damage\/Upgrade$/i.exec(lines[i].trim())
    const prev = /^(.+?)(?: Damage| DMG)?\s*\+\d+%$/i.exec(lines[i - 1].trim())
    if (m && prev) lines[i] = `${prev[1]} DMG +${m[1]}% per refine`
  }
  return lines.join('\n')
}

function main() {
  const items = dump.items()
  const mobs = dump.mobs()
  const skills = dump.skills()
  const mobSrc = dump.load('raw-db-mobs.json')

  // ---------- items ----------
  const cov = { lines: 0, numeric: 0, applied: 0, conditional: 0, unknown: 0, byReason: {}, byGroup: {} }
  const corrections = []
  const out = []
  for (const it of items) {
    const isCard = it.grp === 'Card'
    if (!isCard && !EQUIP_GRP.has(it.grp)) continue
    const slots = slotsOf(it)
    if (!slots.length && !isCard) continue

    const ov = ITEM_OVERRIDES[it.name] ?? {}
    let desc = String(it.desc || '')
    for (const [from, to] of ov.desc ?? []) desc = desc.replace(from, to)
    desc = runeExtra(desc)
    const { mods, unparsed, lines, numeric } = parseDesc(desc, it.id)
    const unknown = unparsed.filter((u) => u.reason === 'chave_desconhecida' || u.reason === 'forma_desconhecida').length
    const conditional = unparsed.filter((u) => u.reason === 'condicional').length
    cov.lines += lines; cov.numeric += numeric
    cov.unknown += unknown; cov.conditional += conditional
    cov.applied += numeric - unknown - conditional
    for (const u of unparsed) cov.byReason[u.reason] = (cov.byReason[u.reason] || 0) + 1
    const g = cov.byGroup[it.grp] ??= { numeric: 0, unknown: 0 }
    g.numeric += numeric; g.unknown += unknown

    if (ov.why) corrections.push(`${it.name}: ${ov.why}`)
    out.push({
      id: it.id,
      name: it.name,
      grp: it.grp,
      cat: it.cat,
      slots,
      cardSlots: ov.cardSlots ?? it.slots ?? 0,
      lv: it.lv || 0,
      atk: it.atk || 0,
      matk: it.matk || 0,
      def: it.def || 0,
      mdef: it.mdef || 0,
      weight: it.weight || 0,
      // gems go up to +10 in-game, but the dump says refine=0 [player report 2026-09-28]
      refinable: ov.refinable ?? (it.cat === 'Class Gem' ? true : isRefinable(it)),
      twoHanded: asArray(it.loc).includes('Weapon (two-handed)'),
      // weapon level (new column in the 2026-09-28 dump): determines refine ATK
      wlv: it.wlv || 0,
      // only dropped items (from mobs or coffers) roll random options; NPC, quest and trade items do not [player report 2026-09-28]
      dropped: (Array.isArray(it.src) && it.src.length > 0) || (Array.isArray(it.box) && it.box.length > 0),
      // accepts Dream Enchants at the Weaver of Dreams ("Dream Enchants [and Refining] available")
      dreamEnchant: /Dream Enchants (and Refining )?available/i.test(String(it.desc || '')),
      // element granted by the item: weapon endow and armor element (null = unchanged)
      ...(() => { const e = elementsOf(desc, slots); return { endow: e.endow, armorEl: e.armorEl } })(),
      // gems carry their class in the new `cls` column, with `jobs` empty
      jobs: it.jobs && String(it.jobs) ? String(it.jobs).split(', ').filter(Boolean)
        : Array.isArray(it.cls) && it.cls.length ? it.cls.map(String) : null,
      mods,
      unparsed: unparsed.filter((u) => u.reason !== 'sem_numero' || /[+-]\d|\d+%/.test(u.raw)),
    })
  }

  // ---------- ids that changed between dumps: old id -> new id, matched by name ----------
  // Saved builds store ids; when the dump renumbers items (the "of the Sun" family moved
  // from 900xxx to 312xx on 2026-09-28), the planner migrates by name instead of losing the item.
  const aliases = {}
  const byName = new Map()
  for (const it of out) { if (!byName.has(it.name)) byName.set(it.name, []); byName.get(it.name).push(it.id) }
  const currentIds = new Set(out.map((i) => i.id))
  for (const dir of readdirSync(dump.DUMP).filter((d) => d.startsWith('bak-')).sort()) {
    const old = dump.decode(JSON.parse(readFileSync(join(dump.DUMP, dir, 'raw-db-items.json'), 'utf8')))
    for (const o of old) {
      if (currentIds.has(o.id) || aliases[o.id]) continue
      const cands = byName.get(o.name)
      if (cands?.length === 1) aliases[o.id] = cands[0]
    }
  }

  // ---------- "Every level of <skill>": name -> skill tree key ----------
  const skillKey = new Map(skills.map((s) => [s.name.toLowerCase(), s.key]))
  for (const it of out) {
    for (const m of it.mods) {
      if (m.cond.t !== 'per_skill_lv') continue
      // the same cond object is shared by every line in the block: convert it once
      const keys = m.cond.skills.map((n) => (n.includes('/') ? n : skillKey.get(n)))
      if (keys.some((k) => !k)) throw new Error(`${it.name}: skill not found in ${m.cond.skills}`)
      m.cond.skills = keys
    }
  }

  // ---------- sets ----------
  // The dump has no set table: each piece repeats the bonus in its own text.
  // So a set's pieces are exactly the items that declare its bonus,
  // and the bonus only applies with all of them equipped.
  const setMembers = {}
  for (const it of out) {
    for (const m of it.mods) {
      // any line inside a set block names the set: a set whose bonuses are all "per stat" or "per total set
      // refine" (Unknown Tech) has no plain set_bonus line, and its pieces went unregistered
      const set = m.cond.t === 'set_bonus' ? m.cond.set : 'set' in m.cond ? m.cond.set : undefined
      if (set) (setMembers[set] ??= new Set()).add(it.name)
    }
  }
  // a set declared by a single item ("Full Shadow Card Set" on Rank S Shadow Card) has pieces the dump does not
  // name: it can never be verified complete, so it is kept as incomplete instead of applying on its own
  for (const [k, v] of Object.entries(setMembers)) if (v.size === 1) v.add('(pieces not listed in the db)')
  for (const it of out) {
    for (const m of it.mods) {
      if (m.cond.t === 'set_bonus') m.cond.members = [...setMembers[m.cond.set]].sort()
      // "Per total set refine" inside a set block: same pieces, and the refine that counts is their sum
      if ((m.cond.t === 'per_set_refine' || m.cond.t === 'set_refine' || m.cond.t === 'per_stat') && m.cond.set && setMembers[m.cond.set]) m.cond.members = [...setMembers[m.cond.set]].sort()
    }
  }
  const unnamedSets = setMembers.set?.size ?? 0
  if (unnamedSets) console.log(`unnamed sets ("Set Bonus:" without a preceding "X Set:"): ${unnamedSets} items`)

  // ---------- mobs ----------
  const mobsOut = mobs.map((m) => ({
    id: m.id,
    name: m.name,
    lv: m.lv,
    hp: m.hp,
    atk: m.atk,
    def: m.def,
    mdef: m.mdef,
    race: mobSrc.races[m.race],
    size: mobSrc.sizes[m.size],
    element: mobSrc.elements[m.element],
    elv: m.elv,
    hit: m.hit,
    flee: m.flee,
    adelay: m.adelay,
    mvp: !!m.mvp,
    stats: m.stats,
  }))

  // ---------- skills ----------
  // All skills, not just damage skills: the tree needs passives and
  // prerequisites for the point totals to add up.
  const rawSkills = dump.load('raw-db-skills.json')
  const TYPES = rawSkills.types || []
  const skillsOut = []
  for (const s of skills) {
    let desc = s.desc
    for (const [from, to] of SKILL_OVERRIDES[s.key]?.desc ?? []) {
      if (!String(desc).includes(from)) throw new Error(`${s.key}: override text not found: ${from}`)
      desc = String(desc).replace(from, to)
    }
    const f = parseSkillFormula(desc)
    const type = TYPES[s.type] ?? null
    skillsOut.push({
      key: s.key,
      name: s.name,
      cls: s.cls,
      maxLv: s.max || 1,
      icon: s.icon || null,
      tipo: type,
      /** job marker (Trickster Skills, Revenant Soul): granted for free, costs no points */
      classNote: type === 'Class note',
      sp: s.sp ?? null,
      needs: (s.needs || []).map(([n, lv]) => ({ name: n, lv })),
      prose: (s.prose || s.desc || '').trim(),
      /** range in cells per level; range >= 4 makes a skill a ranged attack (battle.cpp battle_range_type) */
      range: Array.isArray(s.range) ? s.range : s.range != null ? [s.range] : null,
      damage: f,
    })
  }
  const byClass = {}
  for (const s of skillsOut) if (s.damage) (byClass[s.cls] ??= []).push(s.key)
  const CALIBRATED = new Set(['Revenant'])
  const tree = classTree()
  const caps = jobCaps()
  const classes = [...new Set(skills.map((s) => s.cls))]
    .filter((c) => c && c !== 'Shadow set')
    .sort()
    .map((c) => ({
      name: c,
      damageSkills: byClass[c] || [],
      calibrated: CALIBRATED.has(c),
      lineage: lineage(c, tree),
      /** job level at which each lineage tier ends; the last one is the current job */
      tierCaps: lineage(c, tree).map((t, i, arr) => (i === arr.length - 1 ? null : caps[t] ?? null)),
    }))

  // ---------- elements ----------
  const elements = {
    order: mobSrc.attrorder,
    table: mobSrc.attr,
    names: mobSrc.elements,
    races: mobSrc.races,
    sizes: mobSrc.sizes,
  }

  mkdirSync(OUT, { recursive: true })
  const w = (f, o) => {
    const json = JSON.stringify(o)
    writeFileSync(join(OUT, f), json)
    return `${f.padEnd(14)} ${(json.length / 1024).toFixed(0).padStart(5)} KB`
  }
  const report = [
    w('items.json', out),
    w('mobs.json', mobsOut),
    w('skills.json', skillsOut),
    w('classes.json', classes),
    w('elements.json', elements),
    w('id-aliases.json', aliases),
  ]

  cov.pct = {
    applied: +(cov.applied / cov.numeric * 100).toFixed(1),
    conditional: +(cov.conditional / cov.numeric * 100).toFixed(1),
    unknown: +(cov.unknown / cov.numeric * 100).toFixed(1),
  }
  report.push(w('coverage.json', cov))

  console.log(report.join('\n'))
  console.log(`\nitems: ${out.length}  mobs: ${mobsOut.length}  skills: ${skillsOut.length} (${skillsOut.filter((s) => s.damage).length} with a damage formula)  classes: ${classes.length}`)
  console.log(`coverage (lines with a number): applied ${cov.pct.applied}% · conditional ${cov.pct.conditional}% · not understood ${cov.pct.unknown}%`)
  if (corrections.length) console.log(`\nmanual corrections applied:\n  ${corrections.join('\n  ')}`)
}

main()
