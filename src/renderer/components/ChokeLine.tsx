import { useQuery } from '@tanstack/react-query'
import { paceman } from '../lib/clients'
import { SPLIT_ORDER } from '@services/paceman'

/**
 * "Choke Line" — a survival/attrition funnel + Clutch Score. Shows where a runner
 * bleeds runs and their late-game closing rate, P(finish | reached stronghold).
 * Neither MCSR Ranked nor paceman surfaces attrition; both are completion-only.
 */
export function ChokeLine({ name }: { name: string | null }) {
  const { data: runs, isLoading } = useQuery({
    queryKey: ['choke-line', name],
    queryFn: () => paceman.getRecentRuns(name!, { limit: 50, hours: 24 * 365 }),
    enabled: !!name
  })

  const total = runs?.length ?? 0
  const stages = [
    { key: 'start', label: 'Runs started', count: total },
    ...SPLIT_ORDER.map((s) => ({
      key: s.key,
      label: s.label,
      count: runs ? runs.filter((r) => r[s.key] != null).length : 0
    }))
  ]
  const rows = stages.map((st, i) => {
    const prev = i === 0 ? st.count : stages[i - 1].count
    const survival = prev > 0 ? st.count / prev : 0
    return { ...st, pct: total > 0 ? st.count / total : 0, drop: Math.max(0, 1 - survival) }
  })

  let killIdx = -1
  for (let i = 1; i < rows.length; i++) {
    if (killIdx === -1 || rows[i].drop > rows[killIdx].drop) killIdx = i
  }

  const sh = rows.find((r) => r.key === 'stronghold')?.count ?? 0
  const fin = rows.find((r) => r.key === 'finish')?.count ?? 0
  const clutch = sh > 0 ? Math.round((fin / sh) * 100) : null

  return (
    <section className="surface p-5 animate-fade-up">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">Choke Line</h2>
          <p className="text-xs text-faint">Where your runs die{total ? ` · last ${total} runs` : ''}</p>
        </div>
        {clutch !== null && (
          <div className="text-right">
            <div
              className="font-display text-3xl leading-none"
              style={{ color: clutch >= 50 ? 'var(--win)' : 'var(--gold)' }}
            >
              {clutch}%
            </div>
            <div className="text-[10px] uppercase tracking-wider text-faint">Clutch · finish from SH</div>
          </div>
        )}
      </header>

      {!name ? (
        <Empty>Sign in to see where your runs die.</Empty>
      ) : isLoading ? (
        <Empty>Crunching your runs…</Empty>
      ) : total === 0 ? (
        <Empty>No paceman runs yet — play some RSG and this fills in.</Empty>
      ) : (
        <div className="space-y-1">
          {rows.map((r, i) => {
            const isKill = i === killIdx && r.drop > 0
            return (
              <div key={r.key} className="flex items-center gap-2">
                <div className="w-24 shrink-0 text-right text-xs text-muted">{r.label}</div>
                <div className="relative h-6 flex-1 overflow-hidden rounded bg-black/30">
                  <div
                    className="absolute inset-y-0 left-0 rounded transition-all"
                    style={{
                      width: `${Math.max(3, r.pct * 100)}%`,
                      background: isKill
                        ? 'linear-gradient(90deg,var(--loss),#7a1f1f)'
                        : 'linear-gradient(90deg,var(--gold),#9a7a1e)',
                      opacity: i === 0 ? 0.45 : 1
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-between px-2 text-[11px]">
                    <span className="font-display text-[#0a0a10]">{r.count}</span>
                    {i > 0 && r.drop > 0 && (
                      <span
                        className="font-display"
                        style={{ color: isKill ? 'var(--loss)' : 'var(--faint)' }}
                      >
                        −{Math.round(r.drop * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {killIdx > 0 && total > 0 && rows[killIdx].drop > 0 && (
        <p className="mt-3 text-xs text-muted">
          Biggest leak: <span className="text-[var(--loss)]">{rows[killIdx].label}</span> — you lose{' '}
          <span className="text-text">{Math.round(rows[killIdx].drop * 100)}%</span> of runs that get
          there.
        </p>
      )}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="grid h-28 place-items-center text-center text-sm text-muted">{children}</div>
}
