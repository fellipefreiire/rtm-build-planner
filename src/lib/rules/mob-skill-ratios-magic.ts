// Magic and Misc skill damage for monster casters. rAthena ~2024 battle.cpp, RENEWAL branch.
//
// Magic: the ratio switch lives inline in battle_calc_magic_attack (battle.cpp:6446), default path
// starts at skillratio = 100 (battle.cpp:6550) and applies MATK_RATE(skillratio) at 7178.
// Misc: battle_calc_misc_attack (battle.cpp:7359); `fixed` = md.damage before target reductions.
// Mob caster: sd == NULL, no status changes on the caster, pc_checkskill(NULL, ...) = 0.
// "Weapon" element skills take sstatus->rhw.ele (battle.cpp:6495), which is Neutral for mobs.
// RE_LVL_DMOD(val) (battle.hpp, RENEWAL): if caster lv > 100, skillratio = skillratio * lv / val.

import type { SkillCalc } from './mob-skill-calc'

const reLvlDmod = (ratio: number, lv: number, val: number) =>
  lv > 100 ? Math.floor((ratio * lv) / val) : ratio

const neutral = () => 'Neutral'

const NO_DAMAGE = 'NoDamage in skill_db: deals no damage'
const GROUND = 'ground skill: hits per tick while standing in it — shown as one hit'

const noCase = (note?: string): SkillCalc =>
  note ? { note, src: 'no case: default 100' } : { ratio: () => 100, src: 'no case: default 100' }

export const MAGIC: Record<string, SkillCalc> = {
  AB_ADORAMUS: { ratio: (lv, c) => reLvlDmod(300 + 250 * lv, c.lv, 100), src: 'battle.cpp:6905' },
  AB_HIGHNESSHEAL: {
    // skill_calc_heal (skill.cpp:543) halved (heal=false) at skill.cpp:590
    fixed: (lv, c) => Math.floor(Math.floor((c.int + c.lv) / 4) * 60 / 2),
    note: 'only damages Undead targets; + caster MATK added (not modeled)',
    src: 'battle.cpp:6566',
  },
  AB_JUDEX: { ratio: (lv) => 25 * lv, src: 'battle.cpp:6893' },
  AB_RENOVATIO: {
    fixed: (lv, c) => c.lv * 10 + c.int,
    note: 'only damages Undead targets',
    src: 'battle.cpp:6605',
  },
  AB_VITUPERATUM: noCase(NO_DAMAGE),
  AL_DECAGI: noCase(NO_DAMAGE),
  AL_HEAL: {
    // skill_calc_heal default branch (skill.cpp:560); lv >= max_heal_lv(11) returns max_heal 10000
    fixed: (lv, c) =>
      lv >= 11 ? 10000 : Math.floor(Math.floor(Math.floor((35 + c.lv * 2 + c.int) / 4) * 35 * lv / 10) / 2),
    note: 'only damages Undead targets; + caster MATK added below lv 11 (not modeled)',
    src: 'battle.cpp:6563',
  },
  AL_INCAGI: noCase(NO_DAMAGE),
  AL_PNEUMA: noCase(NO_DAMAGE),
  AL_RUWACH: { ratio: () => 145, src: 'battle.cpp:6691' },
  AL_TELEPORT: noCase(NO_DAMAGE),
  CR_GRANDCROSS: {
    base: 'atk+matk',
    ratio: (lv, c) => 150 + 20 * lv + Math.floor(c.int / 2),
    element: neutral,
    note: 'ratio applies to (ATK + MATK) summed, after element',
    src: 'battle.cpp:7303',
  },
  EL_WATER_SCREW: { ratio: () => 1000, src: 'battle.cpp:7079' },
  GN_DEMONIC_FIRE: { ratio: (lv, c) => 110 + lv + c.int, note: GROUND, src: 'battle.cpp:7068' },
  HP_ASSUMPTIO: noCase(NO_DAMAGE),
  HW_NAPALMVULCAN: { ratio: (lv, c) => 25 * lv + 2 * c.int, src: 'battle.cpp:6721' },
  KO_KAIHOU: { ratio: () => 50, src: 'battle.cpp:6758' },
  MG_COLDBOLT: { ratio: () => 100, src: 'battle.cpp:6668' },
  MG_FIREBALL: { ratio: (lv) => 200 + 20 * lv, src: 'battle.cpp:6652' },
  MG_FIREBOLT: { ratio: () => 100, src: 'battle.cpp:6667' },
  MG_FIREWALL: { ratio: (lv) => (lv >= 11 ? 450 : 50), note: GROUND, src: 'battle.cpp:6661' },
  MG_FROSTDIVER: { ratio: (lv) => 100 + 50 * lv, src: 'battle.cpp:6683' },
  MG_LIGHTNINGBOLT: { ratio: () => 100, src: 'battle.cpp:6669' },
  MG_NAPALMBEAT: {
    ratio: (lv, c) => 100 + 15 * lv + c.int + c.luk,
    element: neutral,
    splitAmongTargets: true,
    src: 'battle.cpp:6649',
  },
  MG_SAFETYWALL: noCase(NO_DAMAGE),
  MG_SIGHT: noCase(NO_DAMAGE),
  MG_SOULSTRIKE: { ratio: (lv, c) => 3 * lv + c.int, element: neutral, src: 'battle.cpp:6857' },
  MG_STONECURSE: noCase(NO_DAMAGE),
  MG_THUNDERSTORM: { ratio: () => 100, src: 'battle.cpp:6677' },
  MH_ERASER_CUTTER: { ratio: (lv) => 60 * lv, src: 'battle.cpp:7095' },
  NC_FLAMELAUNCHER: { ratio: (lv, c) => 25 * lv + 3 * c.int, src: 'battle.cpp:6742' },
  NJ_BAKUENRYU: { ratio: (lv, c) => 40 * lv + 3 * c.int, src: 'battle.cpp:6774' },
  NJ_HUUJIN: { ratio: () => 50, src: 'battle.cpp:6829' },
  NJ_HYOUSENSOU: { ratio: () => 50, src: 'battle.cpp:6783' },
  NJ_HYOUSYOURAKU: { ratio: (lv, c) => 40 * lv + 3 * c.int, src: 'battle.cpp:6798' },
  NJ_KAENSIN: { ratio: () => 50, note: GROUND, src: 'battle.cpp:6769' },
  // no break after NJ_KAMAITACHI: falls through into NJ_HUUJIN (-50)
  NJ_KAMAITACHI: { ratio: (lv, c) => 50 + 15 * lv + 2 * c.int, src: 'battle.cpp:6821' },
  NJ_KOUENKA: { ratio: () => 50, src: 'battle.cpp:6745' },
  NPC_DARKBLESSING: noCase(NO_DAMAGE),
  NPC_DARKBREATH: {
    fixed: (lv, c, t) => Math.floor((t.maxHp * (lv <= 5 ? Math.floor(100 / (12 - lv)) : 50)) / 100),
    note: "depends on target's current HP (shown at full HP)",
    src: 'battle.cpp:6599',
  },
  NPC_DARKSTRIKE: noCase(),
  NPC_DARKTHUNDER: noCase(),
  NPC_EARTHQUAKE: {
    base: 'atk',
    ratio: (lv) => 200 + 100 * lv + 100 * Math.floor(lv / 2) + (lv > 4 ? 100 : 0),
    element: neutral,
    splitAmongTargets: true,
    note: 'ratio applies to caster ATK (battle_calc_base_damage), not MATK',
    src: 'battle.cpp:6608',
  },
  NPC_ENERGYDRAIN: { ratio: (lv) => 100 + 100 * lv, src: 'battle.cpp:6844' },
  NPC_EVILLAND: {
    path: 'misc',
    // computed as BF_MISC (skill.cpp:15191): battle_calc_misc_attack -> skill_calc_heal, not halved
    fixed: (lv) => 200 * lv,
    note: GROUND,
    src: 'battle.cpp:7469',
  },
  NPC_FIRESTORM: { ratio: () => 300, src: 'battle.cpp:7128' },
  NPC_GRANDDARKNESS: {
    base: 'atk+matk',
    ratio: (lv, c) => 150 + 20 * lv + Math.floor(c.int / 2),
    note: 'ratio applies to (ATK + MATK) summed, after element',
    src: 'battle.cpp:7304',
  },
  NPC_HALLUCINATION: noCase(NO_DAMAGE),
  NPC_ICEMINE: {
    note: 'damage = caster weapon ATK × 10 × lv (weapon ATK not modeled)',
    src: 'battle.cpp:6624',
  },
  NPC_MAGICMIRROR: noCase(NO_DAMAGE),
  NPC_SUMMONSLAVE: noCase(NO_DAMAGE),
  NPC_WIDESIGHT: noCase(NO_DAMAGE),
  PF_FOGWALL: noCase(NO_DAMAGE),
  PF_SPIDERWEB: noCase(NO_DAMAGE),
  PR_KYRIE: noCase(NO_DAMAGE),
  PR_LEXAETERNA: noCase(NO_DAMAGE),
  PR_LEXDIVINA: noCase(NO_DAMAGE),
  PR_MAGNUS: {
    ratio: () => 100,
    note: '+30% vs Undead-element or Demon-race targets',
    src: 'battle.cpp:6870',
  },
  PR_SANCTUARY: {
    // skill_calc_heal (skill.cpp:537) halved (heal=false) at skill.cpp:590, no MATK part
    fixed: (lv) => Math.floor((lv * 50) / 2),
    note: 'only damages Undead targets; ' + GROUND,
    src: 'battle.cpp:6565',
  },
  PR_STRECOVERY: noCase(NO_DAMAGE),
  RK_DRAGONBREATH: {
    path: 'weapon',
    // skill.cpp:6100 calls skill_attack(BF_WEAPON): weapon ratio, not the magic path
    ratio: (lv, c) => 100 + 25 * lv + 5 * c.vit,
    note: 'dealt as a physical (BF_WEAPON) attack: ratio applies to ATK, not MATK',
    src: 'battle.cpp:4028',
  },
  SA_COMA: noCase(),
  SA_DISPELL: noCase(NO_DAMAGE),
  SA_LANDPROTECTOR: noCase(NO_DAMAGE),
  SC_MAELSTROM: noCase(NO_DAMAGE),
  SC_MANHOLE: noCase(NO_DAMAGE),
  SL_KAITE: noCase(NO_DAMAGE),
  SL_KAUPE: noCase(NO_DAMAGE),
  SO_CLOUD_KILL: { ratio: (lv, c) => 5 * lv + c.int, note: GROUND, src: 'battle.cpp:7055' },
  SO_DIAMONDDUST: { ratio: (lv, c) => 35 * lv + 6 * c.int, src: 'battle.cpp:7015' },
  SO_FIREWALK: { ratio: (lv, c) => 5 * lv + c.int, note: GROUND, src: 'battle.cpp:6995' },
  SO_POISON_BUSTER: { ratio: (lv, c) => 35 * lv + 2 * c.int, src: 'battle.cpp:7024' },
  SO_VACUUM_EXTREME: noCase(NO_DAMAGE),
  SO_VARETYR_SPEAR: {
    ratio: (lv, c) => 100 + 7 * lv + 2 * c.int + 2 * c.luk,
    element: neutral,
    src: 'battle.cpp:7063',
  },
  SP_SWHOO: { ratio: (lv, c) => 80 * lv + 2 * c.int, element: neutral, src: 'battle.cpp:7145' },
  WL_CHAINLIGHTNING: {
    ratio: (lv, c) => lv + c.int,
    note: 'damage dealt by WL_CHAINLIGHTNING_ATK (battle.cpp:6954), bounces between targets',
    src: 'battle.cpp:6954',
  },
  WL_COMET: { ratio: (lv, c) => 50 * lv + 6 * c.int, element: neutral, src: 'battle.cpp:6951' },
  WL_CRIMSONROCK: { ratio: (lv, c) => 10 * lv + 2 * c.int, src: 'battle.cpp:6943' },
  WL_DRAINLIFE: { ratio: (lv, c) => 100 + 30 * lv + 4 * c.int, src: 'battle.cpp:6935' },
  WL_FROSTMISTY: { ratio: (lv, c) => 10 * lv + c.int, src: 'battle.cpp:6916' },
  WL_JACKFROST: { ratio: (lv, c) => reLvlDmod(1000 + 300 * lv, c.lv, 100), src: 'battle.cpp:6928' },
  WL_SIENNAEXECRATE: noCase(NO_DAMAGE),
  WL_TETRAVORTEX_FIRE: { ratio: (lv, c) => 40 * lv + 4 * c.int, src: 'battle.cpp:6961' },
  WL_TETRAVORTEX_GROUND: { ratio: (lv, c) => 40 * lv + 4 * c.int, src: 'battle.cpp:6964' },
  WL_TETRAVORTEX_WATER: { ratio: (lv, c) => 40 * lv + 4 * c.int, src: 'battle.cpp:6962' },
  WL_TETRAVORTEX_WIND: { ratio: (lv, c) => 40 * lv + 4 * c.int, src: 'battle.cpp:6963' },
  // pc_checkskill(NULL, WM_LESSON) path: sd ? ... : 1
  WM_METALICSOUND: {
    ratio: (lv, c) => reLvlDmod(120 * lv + 60, c.lv, 100),
    element: neutral,
    src: 'battle.cpp:6984',
  },
  WM_REVERBERATION: { ratio: (lv, c) => reLvlDmod(700 + 300 * lv, c.lv, 100), src: 'battle.cpp:6990' },
  WZ_EARTHSPIKE: { ratio: () => 200, src: 'battle.cpp:6717' },
  WZ_FIREPILLAR: {
    ratio: (lv) => 40 + 20 * lv,
    note: '+ (100 + 50 × lv) flat per hit added after the ratio (battle.cpp:7182)',
    src: 'battle.cpp:6697',
  },
  WZ_FROSTNOVA: { ratio: (lv) => Math.floor(((100 + lv * 10) * 2) / 3), src: 'battle.cpp:6694' },
  WZ_HEAVENDRIVE: { ratio: (lv, c) => 40 * lv + 3 * c.int, src: 'battle.cpp:6848' },
  WZ_ICEWALL: noCase(NO_DAMAGE),
  WZ_JUPITEL: noCase(),
  WZ_METEOR: {
    ratio: () => 125,
    note: 'meteors fall at random in the area — shown as one meteor',
    src: 'battle.cpp:6862',
  },
  WZ_QUAGMIRE: noCase(NO_DAMAGE),
  WZ_SIGHTRASHER: { ratio: (lv) => 100 + 20 * lv, src: 'battle.cpp:6702' },
  WZ_STORMGUST: { ratio: (lv) => 70 + 50 * lv, note: GROUND, src: 'battle.cpp:6708' },
  WZ_VERMILION: { ratio: (lv, c) => 20 + 50 * lv + 5 * c.int, src: 'battle.cpp:6865' },
  WZ_WATERBALL: { ratio: (lv, c) => 20 + 5 * lv + c.int, src: 'battle.cpp:6705' },
}

export const MISC: Record<string, SkillCalc> = {
  HT_ANKLESNARE: { note: NO_DAMAGE, src: 'no case: default 100' },
  // pc_checkskill(NULL, HT_STEELCROW) = 0
  HT_BLITZBEAT: { fixed: (lv) => lv * 50, src: 'battle.cpp:7432' },
  HT_CLAYMORETRAP: { fixed: (lv, c) => 50 + 5 * lv * (2 * c.str), src: 'battle.cpp:7417' },
  HT_SKIDTRAP: { note: NO_DAMAGE, src: 'no case: default 100' },
  NPC_RUN: { note: NO_DAMAGE, src: 'no case: default 100' },
  NPC_SELFDESTRUCTION: {
    fixed: (lv, c) => c.hp * 100,
    note: "uses caster's current HP (shown at full HP)",
    src: 'battle.cpp:7463',
  },
  RA_CLUSTERBOMB: {
    fixed: (lv, c) => 150 + lv * (c.int + c.dex),
    note: "+ caster's physical attack damage added after reductions (battle.cpp:7683, not modeled)",
    src: 'battle.cpp:7556',
  },
  RA_ICEBOUNDTRAP: {
    fixed: (lv, c) => 150 + 5 * lv * c.dex,
    note: "+ caster's physical attack damage added after reductions (battle.cpp:7680, not modeled)",
    src: 'battle.cpp:7562',
  },
  TF_THROWSTONE: { fixed: (lv, c) => c.dex + c.str, src: 'battle.cpp:7409' },
}
