'use client'
import { Build, Item } from '@/lib/types'
import { StatSheet } from '@/lib/engine/sheet'
import { penEffect } from '@/lib/rules/server'
import { byId } from '@/lib/data'

/**
 * Mirrors the game's `@battlestats`, section by section.
 * Where the data has no formula, the field shows `?` instead of a made-up
 * number — `[measured]` vs `[db]` is the only distinction that matters here.
 */

const n0 = (v: number) => Math.round(v).toLocaleString('en-US')
const n2 = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })

function Line({ k, v, dim }: { k: string; v: React.ReactNode; dim?: boolean }) {
  return (
    <div className={`bs-line ${dim ? 'dim' : ''}`}>
      <span className="bs-k">{k}</span>
      <span className="bs-v">{v}</span>
    </div>
  )
}
const Pct = ({ v }: { v: number }) => <>{n2(v)}%</>
const Unknown = ({ why }: { why: string }) => <span className="dim" title={why}>?</span>

export default function Breakdown({ build, sheet }: { build: Build; sheet: StatSheet }) {
  const flat = (k: string) => sheet.totals.flat[k] ?? 0
  const pct = (k: string) => sheet.totals.pct[k] ?? 0
  const both = (k: string) => flat(k) + pct(k)
  const weapon: Item | undefined = build.slots.weapon ? byId.get(build.slots.weapon.id) : undefined
  const wRefine = build.slots.weapon?.refine ?? 0

  const skillBoosts = Object.entries(sheet.totals.scoped.skill_dmg ?? {})
    .sort((a, b) => b[1] - a[1])
  const drops = Object.entries(sheet.totals.scoped.drop_rate ?? {})

  const defPen = sheet.defPen.v
  const mdefPen = both('mdef_pen')

  return (
    <div className="bd-body bs">
      <h3>Personal Info</h3>
      <Line k="Class" v={build.cls} />
      <Line k="Base Lv" v={build.baseLv} />
      <Line k="Job Lv" v={build.jobLv} />

      <h3>Battlestats</h3>
      <Line k="Base ATK" v={sheet.split.atk.base == null
        ? <Unknown why="no base ATK formula in the knowledge base" />
        : n0(sheet.split.atk.base)} />
      <Line k="Armor Element" v={<span title={sheet.armorElement.from}>{sheet.armorElement.v} Lv 1 <small>({sheet.armorElement.from})</small></span>} />
      <Line k="Size / Race" v="Medium · Player" />

      <h3>Right-Hand Weapon</h3>
      {weapon ? (
        <>
          <Line k="ATK / MATK" v={`${n0(weapon.atk)} / ${n0(weapon.matk)}`} />
          <Line k="Refine" v={`+${wRefine}`} />
          <Line k="Weapon Level" v={weapon.lv || <Unknown why="the dump does not carry weapon level" />} />
          <Line k="Element" v={<span title={sheet.weaponElement.from}>{sheet.weaponElement.v} <small>({sheet.weaponElement.from})</small></span>} />
          <Line k="Type" v={weapon.cat + (weapon.twoHanded ? ' · two-handed' : '')} />
        </>
      ) : <Line k="—" v="no weapon equipped" dim />}

      <h3>ASPD</h3>
      <Line k="Item ASPD Limit" v={`+${n0(flat('aspd_limit'))}`} />
      <Line k="Items Bonuses ASPD" v={`+${n0(flat('aspd'))}`} />
      <Line k="Items Bonuses ASPD %" v={<Pct v={pct('aspd')} />} />
      <Line k="Final ASPD" v={<Unknown why="no ASPD formula in the knowledge base — only the gear modifiers are known" />} />

      <h3>Skill Boosts</h3>
      {skillBoosts.length === 0 && <Line k="—" v="none" dim />}
      {skillBoosts.map(([name, v]) => (
        <Line key={name} k={`Increase the damage of '${name}'`} v={<Pct v={v} />} />
      ))}

      {drops.length > 0 && (
        <>
          <h3>Drop Boosts</h3>
          {drops.map(([name, v]) => <Line key={name} k={`Drop rate of '${name}'`} v={<Pct v={v} />} />)}
        </>
      )}

      <h3>Bonuses ~ ATK / DEF</h3>
      <div className="bs-two">
        <Line k="ATK %" v={<Pct v={pct('atk')} />} />
        <Line k="MATK %" v={<Pct v={pct('matk')} />} />
        <Line k="LONG ATK %" v={<Pct v={both('ranged_dmg')} />} />
        <Line k="MELEE ATK %" v={<Pct v={both('melee_dmg')} />} />
        {/* in @battlestats this is bCriticalRate: "Total Critical Rate +N%" (Baphomet Jr.), which multiplies crit */}
        <Line k="CRITICAL %" v={<Pct v={both('crit_rate_mult') + pct('crit_rate')} />} />
        <Line k="CRITICAL ATK %" v={<Pct v={both('crit_dmg')} />} />
        <Line k="HIT %" v={<Pct v={pct('hit')} />} />
        <Line k="FLEE %" v={<Pct v={pct('flee')} />} />
        <Line k="PERFECT DODGE" v={n2(both('perfect_dodge'))} />
        <Line k="MOV. SPEED %" v={<Pct v={both('move_speed')} />} />
        <Line k="EQUIP DEF %" v={<Pct v={pct('def')} />} />
        <Line k="MDEF %" v={<Pct v={pct('mdef')} />} />
        <Line k="REDUCT. MELEE ATK %" v={<Pct v={both('resist_melee')} />} />
        <Line k="REDUCT. LONG ATK %" v={<Pct v={both('resist_long')} />} />
        <Line k="REDUCT. MATK %" v={<Pct v={both('resist_matk')} />} />
        <Line k="REDUCT. MISC ATK %" v={<Pct v={both('resist_misc')} />} />
      </div>

      <h3>Penetration</h3>
      <Line k="Defense Penetration" v={`${n0(defPen)} — effective pierce ${n0(penEffect(defPen) * 100)}%`} />
      <Line k="Magic Defense Penetration" v={`${n0(mdefPen)} — effective pierce ${n0(penEffect(mdefPen) * 100)}%`} />
      <small>Race-specific penetration is not broken out, same as in-game.</small>

      <h3>Bonuses ~ Healing, HP/SP</h3>
      <div className="bs-two">
        <Line k="Healing Received %" v={<Pct v={both('healing_received')} />} />
        <Line k="Healing Power %" v={<Pct v={both('healing_power')} />} />
        <Line k="Leech Rate %" v={<Pct v={both('leech_rate')} />} />
        <Line k="Leech Power %" v={<Pct v={both('leech_power')} />} />
        <Line k="Regen HP %" v={<Pct v={both('hp_regen')} />} />
        <Line k="Regen SP %" v={<Pct v={both('sp_regen')} />} />
        <Line k="SP Consumption %" v={<Pct v={both('sp_cost')} />} />
        <Line k="Max HP" v={sheet.maxHp ? n0(sheet.maxHp.v) : '?'} />
        <Line k="Max SP" v={sheet.maxSp ? n0(sheet.maxSp.v) : '?'} />
      </div>

      <h3>Bonuses ~ Cast time / delay</h3>
      <div className="bs-two">
        <Line k="Variable Cast from items %" v={<Pct v={both('cast_time')} />} />
        <Line k="Fixed Cast %" v={<Pct v={both('fixed_cast')} />} />
        <Line k="After Cast Delay %" v={<Pct v={both('after_cast_delay')} />} />
      </div>

      {sheet.shield && (
        <>
          <h3>Class</h3>
          <Line k="Shield (max)" v={sheet.maxHp ? n0(sheet.maxHp.v + sheet.shield.v) : `MaxHP + ${n0(sheet.shield.v)}`} />
          <small>{sheet.shield.from.join(' · ')}</small>
        </>
      )}
      {sheet.skillPct && (
        <>
          <h3>Damage skill</h3>
          <Line k="Skill %" v={`${n0(sheet.skillPct.v)}%`} />
          <small>{sheet.skillParts.map((p) => `${p.label} ${p.value >= 0 ? '+' : ''}${Math.round(p.value)}`).join('  ·  ')}</small>
        </>
      )}
    </div>
  )
}
