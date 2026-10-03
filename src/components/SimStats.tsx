'use client'
import { Mob } from '@/lib/types'
import { StatSheet, skillBonus } from '@/lib/engine/sheet'

const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US')

/**
 * Read-only attributes: the value with the checked buffs and food, and how much it
 * changes compared to the bare build (green = up, red = down).
 */
export default function SimStats({ base, buffed, mob }: { base: StatSheet; buffed: StatSheet; mob: Mob }) {
  const luk = mob.stats?.[5] ?? 0
  // crit ≥ 140 = 100% on any target (RTM); below that, crit − target LUK ÷ 5 (emu)
  const chance = (s: StatSheet) => (s.critRate.v >= 140 ? 100 : Math.min(100, Math.max(0, s.critRate.v - luk / 5)))
  const shield = (s: StatSheet) => (s.shield?.v ?? 0) + (s.maxHp?.v ?? 0)
  const p = (s: StatSheet, k: string) => (s.totals.pct[k] ?? 0) + (s.totals.flat[k] ?? 0)
  // 2026-10-02: the rows used to say "Roaring" for every class; now they follow the class's reference skill
  const skill = (buffed.skillName ?? 'skill').replace(/\b\w/g, (c) => c.toUpperCase())
  const boost = (s: StatSheet) => skillBonus(s.totals.scoped.skill_dmg, s.skillName)
  const ranged = buffed.rangeType === 'ranged'
  const hasShield = !!(base.shield || buffed.shield)

  const rows: [string, (s: StatSheet) => number, string?][] = [
    ['STR', (s) => s.stats.str], ['AGI', (s) => s.stats.agi], ['VIT', (s) => s.stats.vit],
    ['INT', (s) => s.stats.int], ['DEX', (s) => s.stats.dex], ['LUK', (s) => s.stats.luk],
    ['ATK (window)', (s) => (s.split.atk.base ?? 0) + s.split.atk.gear],
    ['Damage ATK', (s) => s.atk.v],
    ['HIT', (s) => s.hit.v], ['FLEE', (s) => s.flee.v], ['Perfect Dodge', (s) => s.perfectDodge.v],
    ['Critical', (s) => s.critRate.v], [`Crit chance vs ${mob.name}`, chance, '%'],
    ['Crit damage', (s) => s.critDmg.v, '%'],
    ['ASPD', (s) => s.aspd?.v ?? 0],
    ['MaxHP', (s) => s.maxHp?.v ?? 0], ['MaxSP', (s) => s.maxSp?.v ?? 0],
    ['Leech Power', (s) => s.leechPower.v, '%'],
    ...(hasShield ? [['Max shield (with HP)', shield] as [string, (s: StatSheet) => number]] : []),
    [`${skill} %`, (s) => s.skillPct?.v ?? 0, '%'], [`${skill} skillboost`, boost, '%'],
    ranged ? ['Ranged', (s) => p(s, 'ranged_dmg'), '%'] : ['Melee', (s) => p(s, 'melee_dmg'), '%'],
    ['After Cast Delay', (s) => p(s, 'after_cast_delay'), '%'], ['Variable cast', (s) => p(s, 'cast_time'), '%'],
    ['SP Cost', (s) => p(s, 'sp_cost'), '%'],
  ]

  return (
    <table className="sim-table stats-table">
      <tbody>
        {rows.map(([label, f, unit]) => {
          const v = f(buffed)
          const d = v - f(base)
          return (
            <tr key={label}>
              <td>{label}</td>
              <td>{n1(v)}{unit ?? ''}</td>
              <td className={d > 0.05 ? 'best' : d < -0.05 ? 'worst' : 'dim'}>{Math.abs(d) > 0.05 ? `${d > 0 ? '+' : ''}${n1(d)}` : ''}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
