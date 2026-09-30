// How a mob skill turns into damage: ratio and special cases transcribed from the
// emulator (rAthena ~2024, src/map/battle.cpp), evaluated with a MOB as the caster
// (no `sd`, no status changes on the caster). Each entry cites its battle.cpp line.
// Tables live in mob-skill-ratios-*.ts; this file only declares the shape.

/** the mob as a caster: RTM stats (dump) */
export type Caster = {
  lv: number
  str: number; agi: number; vit: number; int: number; dex: number; luk: number
  hp: number
}

/** the target (you), for skills that scale with the target */
export type Victim = { lv: number; maxHp: number }

export type SkillCalc = {
  /**
   * Skill ratio in % as battle_calc_attack_skill_ratio / battle_calc_magic_skillratio
   * returns it for a mob caster (100 = plain ATK/MATK). Omit for Misc skills.
   */
  ratio?: (lv: number, c: Caster, t: Victim) => number
  /**
   * Damage that does not come from ATK/MATK × ratio (Misc skills, fixed or HP-based damage).
   * Returns the damage of ONE hit before the target's reductions.
   */
  fixed?: (lv: number, c: Caster, t: Victim) => number
  /** number of hits when battle.cpp overrides skill_db HitCount */
  hits?: (lv: number) => number
  /** element override when battle.cpp picks it at runtime (e.g. NPC_*ATTACK by skill level) */
  element?: (lv: number) => string
  /** damage is split among the targets in the area (skill_db SplashSplit or code) */
  splitAmongTargets?: boolean
  /** damage path in battle.cpp when it differs from skill_db Type (e.g. Dragon Breath is sent as BF_WEAPON) */
  path?: 'weapon' | 'magic' | 'misc'
  /** what the ratio multiplies on the magic path: MATK (default), the caster ATK, or ATK + MATK */
  base?: 'matk' | 'atk' | 'atk+matk'
  /** what the transcription could not model, shown in the UI */
  note?: string
  /** battle.cpp line(s) */
  src: string
}
