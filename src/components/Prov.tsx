'use client'
import { Prov, Qty } from '@/lib/types'

const LABEL: Record<Prov, string> = {
  measured: 'measured',
  db: 'db',
  derived: 'derived',
  emu: 'emulator',
  reported: 'player report',
  'uncalibrated': 'unvalidated',
}

export function ProvBadge({ p }: { p: Prov }) {
  return <span className={`prov ${p}`}>{LABEL[p]}</span>
}

export function Num({ q, fmt, unit }: { q: Qty | null; fmt?: (n: number) => string; unit?: string }) {
  if (!q) return <span className="dim">—</span>
  const f = fmt ?? ((n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 }))
  return (
    <span title={q.from.join(' · ')}>
      {f(q.v)}{unit ?? ''}
      <ProvBadge p={q.prov} />
    </span>
  )
}
