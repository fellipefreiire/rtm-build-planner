'use client'
import { useMemo, useState } from 'react'
import { Build, ClassInfo, Skill } from '@/lib/types'
import { skills as allSkills } from '@/lib/data'
import { ALL_SKILLS_CLASSES } from '@/lib/rules/classes'
import { useTip } from './Tooltip'
import { SkillTip } from './tips'

type Props = {
  build: Build
  info: ClassInfo | undefined
  onAlloc: (key: string, lv: number) => void
  /** replaces every allocated level at once (the "all skills" button) */
  onSetAll: (skills: Record<string, number>) => void
}

/** Depth in the prerequisite tree — becomes the grid row. */
function depths(list: Skill[]) {
  const byName = new Map(list.map((s) => [s.name, s]))
  const cache = new Map<string, number>()
  const walk = (s: Skill, seen = new Set<string>()): number => {
    if (cache.has(s.key)) return cache.get(s.key)!
    if (seen.has(s.key)) return 0
    seen.add(s.key)
    let d = 0
    for (const n of s.needs) {
      const pre = byName.get(n.name)
      if (pre) d = Math.max(d, walk(pre, seen) + 1)
    }
    cache.set(s.key, d)
    return d
  }
  list.forEach((s) => walk(s))
  return cache
}

export default function SkillTree({ build, info, onAlloc, onSetAll }: Props) {
  const tip = useTip()
  const lineage = info?.lineage ?? []
  const caps = info?.tierCaps ?? []
  // the job change granted every skill of the lineage: no point budget and no tier locks
  const allFree = ALL_SKILLS_CLASSES.has(build.cls)
  const [tab, setTab] = useState<string | null>(null)

  /**
   * Each lineage tier yields `cap - 1` points (the cap is the job level at which
   * it ends, read from the classes page); the last one uses the current job level.
   *
   * There is **a single pool**: a point earned as Revenant can be spent on a
   * Trickster skill. The tier only controls unlocking — the next one opens once the
   * previous one has its quota spent, which is what led to the job change.
   */
  const tiers = useMemo(() => {
    const spentBy = (c: string) =>
      allSkills
        .filter((s) => s.cls === c && !s.classNote)
        .reduce((a, s) => a + (build.skills[s.key] ?? 0), 0)
    let prevQuota = 0
    let prevSpent = 0
    return lineage.map((c, i) => {
      const isLast = i === lineage.length - 1
      const cap = isLast ? build.jobLv : caps[i]
      const total = cap ? Math.max(0, cap - 1) : 0
      const spent = spentBy(c)
      const unlockedTier = allFree || i === 0 || prevSpent >= prevQuota
      prevQuota += total
      prevSpent += spent
      return { cls: c, total, spent, cap, unlockedTier, isLast }
    })
  }, [lineage, caps, build.skills, build.jobLv, allFree])

  const unlocked = tiers.filter((t) => t.unlockedTier)
  const target = tab && lineage.includes(tab) ? tab : (unlocked[unlocked.length - 1]?.cls ?? lineage[0] ?? '')
  const cls = target
  const currentTier = tiers.find((t) => t.cls === cls)

  const list = useMemo(() => allSkills.filter((s) => s.cls === cls), [cls])
  const rows = useMemo(() => {
    const d = depths(list)
    const map = new Map<number, Skill[]>()
    for (const s of list) {
      const k = d.get(s.key) ?? 0
      map.set(k, [...(map.get(k) ?? []), s])
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
      .map(([lvl, arr]) => [lvl, arr.sort((a, b) => a.name.localeCompare(b.name))] as const)
  }, [list])

  /** class note is granted at max level and costs no point */
  const levelOf = (s: Skill) => (s.classNote ? s.maxLv : build.skills[s.key] ?? 0)

  const inLineage = useMemo(
    () => allSkills.filter((s) => lineage.includes(s.cls)),
    [lineage],
  )
  const grandTotal = tiers.reduce((a, t) => a + t.total, 0)
  const spentTotal = tiers.reduce((a, t) => a + t.spent, 0)
  const remaining = allFree ? Infinity : grandTotal - spentTotal
  const learnAll = () => onSetAll(Object.fromEntries(inLineage.filter((s) => !s.classNote).map((s) => [s.key, s.maxLv])))

  const byNameInLineage = useMemo(() => {
    const m = new Map<string, Skill>()
    for (const s of inLineage) m.set(s.name, s)
    return m
  }, [inLineage])

  /** prerequisite met? looks up by name across the whole lineage */
  const prereqsMet = (s: Skill) =>
    s.needs.every((n) => {
      const pre = byNameInLineage.get(n.name)
      return pre ? levelOf(pre) >= n.lv : true
    })

  /** the minimum this skill must keep because of the skills that depend on it */
  const lockedAt = (s: Skill) =>
    inLineage.reduce((min, other) => {
      if (levelOf(other) === 0) return min
      const need = other.needs.find((n) => n.name === s.name)
      return need ? Math.max(min, need.lv) : min
    }, 0)

  if (!lineage.length) return null

  return (
    <div className="eq-window tree-window open">
      <div className="eq-title">
        <span>✦</span> Skill Tree
        <span style={{ marginLeft: 'auto', fontWeight: 400 }}>
          <small>{allFree ? `${spentTotal} points · all granted` : `${spentTotal}/${grandTotal} points`}</small>
        </span>
      </div>

      <>
      <div className="eq-tabs">
        {tiers.map((t) => (
          <button
            key={t.cls}
            aria-pressed={t.cls === cls}
            onClick={() => setTab(t.cls)}
            className={t.unlockedTier ? '' : 'tier-locked'}
            title={t.unlockedTier
              ? `${t.spent} points spent here · this tier grants ${t.total}`
              : `browsing is fine — spending needs ${lineage[lineage.indexOf(t.cls) - 1]}'s quota spent first`}
          >
            {t.cls} <span className={t.spent >= t.total && t.total > 0 ? 'ok' : 'dim'}>{t.spent}</span>
          </button>
        ))}
      </div>

      {allFree && (
        <div className="raw" style={{ margin: '10px 12px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>The job change to {build.cls} grants every skill of the lineage at max level: no skill points.</span>
          <button onClick={learnAll} style={{ marginLeft: 'auto' }}>Learn all</button>
        </div>
      )}
      {currentTier && !currentTier.unlockedTier && (
        <div className="raw" style={{ margin: '10px 12px 0' }}>
          You can browse this tree, but spending is locked: {lineage[lineage.indexOf(cls) - 1]} needs
          all {tiers[lineage.indexOf(cls) - 1]?.total} of its points spent first.
        </div>
      )}
      <div className="tree-body">
        {rows.map(([lvl, arr]) => (
          <div className="tree-row" key={lvl}>
            {arr.map((s) => {
              const lv = levelOf(s)
              const ok = prereqsMet(s)
              const floor = lockedAt(s)
              const spCost = Array.isArray(s.sp) ? s.sp[Math.max(0, lv - 1)] : s.sp
              return (
                <div
                  key={s.key}
                  className={`sk ${lv > 0 ? 'on' : ''} ${ok ? '' : 'locked'} ${s.classNote ? 'note' : ''}`}
                  {...tip(<SkillTip skill={s} lv={lv} />)}
                >
                  <div className="sk-top">
                    {s.icon
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img className="sk-icon" src={`skills/${s.icon}.png`} alt="" width={26} height={26} />
                      : <span className="sk-icon" />}
                    <span className="sk-name">{s.name}</span>
                  </div>

                  {s.classNote ? (
                    <div className="sk-bar note" title="granted by the job change — costs no point">
                      <span className="sk-lv">Lv {s.maxLv} · free</span>
                    </div>
                  ) : (
                    <div className="sk-bar">
                      <button
                        onClick={() => onAlloc(s.key, lv - 1)}
                        disabled={lv <= floor || lv === 0}
                        title={lv <= floor && lv > 0 ? 'another skill depends on this level' : 'remove 1'}
                      >◂</button>
                      <span className="sk-lv">{lv} / {s.maxLv}</span>
                      <button
                        onClick={() => onAlloc(s.key, lv + 1)}
                        disabled={!ok || lv >= s.maxLv || remaining <= 0 || !currentTier?.unlockedTier}
                        title={!ok ? 'prerequisite not met' : remaining <= 0 ? 'no points left' : 'add 1'}
                      >▸</button>
                    </div>
                  )}

                  {spCost ? <div className="sk-foot"><small>{spCost} SP</small></div> : null}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="st-foot">
        <span>Skill Points</span>
        {allFree ? (
          <span className="ok"><b>all</b><small> granted by the job change</small></span>
        ) : (
          <span className={remaining < 0 ? 'bad' : remaining === 0 ? 'ok' : ''}>
            <b>{remaining}</b>
            <small> of {grandTotal}</small>
          </span>
        )}
      </div>
      </>
    </div>
  )
}
