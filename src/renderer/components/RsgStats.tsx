import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { paceman } from '../lib/clients'
import type { SessionStats } from '@services/paceman'

// paceman keys everything by MC username and segments by "sessions"; passing huge
// windows collapses the whole tracked history into one all-time view.
const ALLTIME = { hours: 999999, hoursBetween: 999999 }

const FUNNEL: { key: keyof SessionStats; label: string }[] = [
  { key: 'nether', label: 'Nether' },
  { key: 'bastion', label: 'Bastion' },
  { key: 'fortress', label: 'Fortress' },
  { key: 'first_portal', label: 'First Portal' },
  { key: 'stronghold', label: 'Stronghold' },
  { key: 'end', label: 'Enter End' },
  { key: 'finish', label: 'Finish' }
]

/** RSG stats mirrored from paceman's player page: the grind headline + split funnel. */
export function RsgStats({ name }: { name: string | null }) {
  const { data: session, isLoading } = useQuery({
    queryKey: ['rsg-session', name],
    queryFn: () => paceman.getSessionStats(name!, ALLTIME),
    enabled: !!name
  })
  const { data: nph } = useQuery({
    queryKey: ['rsg-nph', name],
    queryFn: () => paceman.getNetherStats(name!, ALLTIME),
    enabled: !!name
  })

  if (!name) return <Empty>No paceman name — set it in Settings to see your RSG stats.</Empty>
  if (isLoading) return <Empty>Crunching your paceman stats…</Empty>
  if (!session) return <Empty>No paceman data yet — play some RSG to start tracking.</Empty>

  const netherCount = session.nether?.count ?? 0
  const completions = session.finish?.count ?? 0

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Big label="Avg finish" value={session.finish?.avg ?? '—'} accent="var(--portal)" sub="all completions" />
        <Big label="Completions" value={completions ? String(completions) : '—'} accent="var(--win)" />
        <Big
          label="Nether / hour"
          value={nph?.rnph != null ? nph.rnph.toFixed(1) : '—'}
          accent="var(--gold)"
          sub="grind rate"
        />
        <Big
          label="Total resets"
          value={nph?.totalResets != null ? nph.totalResets.toLocaleString('en-US') : '—'}
          accent="var(--text)"
        />
      </div>

      <section className="surface p-5">
        <h2 className="mb-3 font-display text-sm uppercase tracking-[0.16em] text-muted">
          Split funnel — reached, average &amp; conversion
        </h2>
        <div className="space-y-0.5">
          <Row label="Split" reached="Reached" avg="Average" conv="Convert" head />
          {FUNNEL.map((s) => {
            const stat = session[s.key]
            const conv =
              netherCount > 0 && stat ? `${Math.round((stat.count / netherCount) * 100)}%` : '—'
            return (
              <Row
                key={s.key}
                label={s.label}
                reached={stat ? String(stat.count) : '—'}
                avg={stat?.avg ?? '—'}
                conv={conv}
                highlight={s.key === 'finish'}
              />
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-faint">
          All-time, from your tracked paceman runs. “Convert” is the share of your Nethers that reach
          each split; averages are paceman’s.
        </p>
      </section>
    </div>
  )
}

function Big({ label, value, accent, sub }: { label: string; value: string; accent: string; sub?: string }) {
  return (
    <div className="surface p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted">{label}</div>
      <div className="font-display tnum whitespace-nowrap text-2xl leading-tight" style={{ color: accent }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
    </div>
  )
}

function Row({
  label,
  reached,
  avg,
  conv,
  head,
  highlight
}: {
  label: string
  reached: string
  avg: string
  conv: string
  head?: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={`grid grid-cols-[1.4fr_1fr_1fr_1fr] items-center gap-2 rounded-md px-3 py-1.5 ${
        head ? 'text-[10px] uppercase tracking-wider text-faint' : 'text-sm'
      }`}
      style={{ background: highlight ? 'rgba(74,255,140,.08)' : undefined }}
    >
      <span className={head ? '' : 'text-muted'}>{label}</span>
      <span className={head ? '' : 'font-display tnum text-text'}>{reached}</span>
      <span className={head ? '' : 'font-display tnum text-[var(--gold)]'}>{avg}</span>
      <span className={head ? '' : 'tnum text-[var(--win)]'}>{conv}</span>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <section className="surface grid h-32 place-items-center text-center text-sm text-muted">{children}</section>
}
