import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { paceman } from '../lib/clients'
import type { RecentRun, RunSplits } from '@services/paceman'
import { msToTime } from '@core/format'

interface Seg {
  key: string
  label: string
  from: keyof RunSplits | null
  to: keyof RunSplits
}

const SEGMENTS: Seg[] = [
  { key: 'ow', label: 'Overworld', from: null, to: 'nether' },
  { key: 'bastion', label: 'Bastion', from: 'nether', to: 'bastion' },
  { key: 'fortress', label: 'Fortress', from: 'bastion', to: 'fortress' },
  { key: 'blind', label: 'Blind', from: 'fortress', to: 'first_portal' },
  { key: 'sh', label: 'Stronghold travel', from: 'first_portal', to: 'stronghold' },
  { key: 'sh_in', label: 'In stronghold', from: 'stronghold', to: 'end' },
  { key: 'end', label: 'End fight', from: 'end', to: 'finish' }
]

function segDuration(run: RecentRun, seg: Seg): number | null {
  const to = run[seg.to]
  if (to == null) return null
  const from = seg.from == null ? 0 : run[seg.from]
  if (from == null) return null
  const d = to - from
  return d >= 0 ? d : null
}

/** Deep RSG split breakdown from paceman: best + average per segment, theoretical
 *  best (sum of bests), fort-to-finish, and time in the stronghold. */
export function RsgStats({ name }: { name: string | null }) {
  const { data: runs, isLoading } = useQuery({
    queryKey: ['rsg-stats', name],
    queryFn: () => paceman.getRecentRuns(name!, { limit: 100, hours: 24 * 365 }),
    enabled: !!name
  })

  if (!name) return <Empty>No paceman name — set it in Settings to see your RSG stats.</Empty>
  if (isLoading) return <Empty>Crunching your runs…</Empty>
  if (!runs || runs.length === 0) return <Empty>No paceman runs yet — play some RSG to start tracking.</Empty>

  const segStats = SEGMENTS.map((seg) => {
    const ds = runs.map((r) => segDuration(r, seg)).filter((d): d is number => d != null)
    return {
      ...seg,
      best: ds.length ? Math.min(...ds) : null,
      avg: ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null,
      count: ds.length
    }
  })
  const sumOfBests = segStats.every((s) => s.best != null)
    ? segStats.reduce((a, s) => a + (s.best as number), 0)
    : null
  const finished = runs.filter((r) => r.finish != null)
  const pb = finished.length ? Math.min(...finished.map((r) => r.finish as number)) : null
  const f2f = runs
    .map((r) => (r.finish != null && r.fortress != null ? r.finish - r.fortress : null))
    .filter((d): d is number => d != null && d >= 0)
  const bestF2F = f2f.length ? Math.min(...f2f) : null
  const shCount = runs.filter((r) => r.stronghold != null).length
  const clutch = shCount > 0 ? Math.round((finished.length / shCount) * 100) : null

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Big label="Personal best" value={pb != null ? msToTime(pb) : '—'} accent="var(--portal)" />
        <Big
          label="Sum of bests"
          value={sumOfBests != null ? msToTime(sumOfBests) : '—'}
          accent="var(--gold)"
          sub={pb != null && sumOfBests != null ? `${msToTime(pb - sumOfBests)} untapped` : undefined}
        />
        <Big label="Clutch" value={clutch != null ? `${clutch}%` : '—'} accent="var(--win)" sub="finish from stronghold" />
      </div>

      <section className="surface p-5">
        <h2 className="mb-3 font-display text-sm uppercase tracking-[0.16em] text-muted">
          Best splits &amp; time per segment
        </h2>
        <div className="space-y-0.5">
          <Row label="Segment" best="Gold" avg="Average" count="Runs" head />
          {segStats.map((s) => (
            <Row
              key={s.key}
              label={s.label}
              best={s.best != null ? msToTime(s.best) : '—'}
              avg={s.avg != null ? msToTime(s.avg) : '—'}
              count={String(s.count)}
              highlight={s.key === 'sh_in'}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-[var(--line)] bg-black/20 px-3 py-2">
          <span className="text-sm text-muted">Fort → Finish (best)</span>
          <span className="font-display tnum text-text">{bestF2F != null ? msToTime(bestF2F) : '—'}</span>
        </div>
        <p className="mt-2 text-[11px] text-faint">
          “In stronghold” = entering the stronghold → entering the End. Bastion-type and
          overworld-type bests aren’t available in paceman’s public data.
        </p>
      </section>
    </div>
  )
}

function Big({ label, value, accent, sub }: { label: string; value: string; accent: string; sub?: string }) {
  return (
    <div className="surface p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted">{label}</div>
      <div className="font-display tnum text-3xl leading-tight" style={{ color: accent }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
    </div>
  )
}

function Row({
  label,
  best,
  avg,
  count,
  head,
  highlight
}: {
  label: string
  best: string
  avg: string
  count: string
  head?: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={`grid grid-cols-[1.6fr_1fr_1fr_0.6fr] items-center gap-2 rounded-md px-3 py-1.5 ${
        head ? 'text-[10px] uppercase tracking-wider text-faint' : 'text-sm'
      }`}
      style={{ background: highlight ? 'rgba(159,107,255,.08)' : undefined }}
    >
      <span className={head ? '' : 'text-muted'}>{label}</span>
      <span className={head ? '' : 'font-display tnum text-[var(--gold)]'}>{best}</span>
      <span className={head ? '' : 'font-display tnum text-text'}>{avg}</span>
      <span className={head ? 'text-right' : 'tnum text-right text-faint'}>{count}</span>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <section className="surface grid h-32 place-items-center text-center text-sm text-muted">{children}</section>
}
