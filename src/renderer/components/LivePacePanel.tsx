import { useQuery } from '@tanstack/react-query'
import { paceman } from '../lib/clients'
import { SPLIT_ORDER, type RecentRun } from '@services/paceman'
import { msToTime } from '@core/format'
import { PortalBlock } from './BlockArt'

/**
 * Reads the player's most recent paceman run and shows the split ladder.
 * Polls every 5s; the header glows green while the run is live.
 */
export function LivePacePanel({ name }: { name: string | null }) {
  const { data: runs } = useQuery({
    queryKey: ['pace-recent', name],
    queryFn: () => paceman.getRecentRuns(name!, { limit: 1 }),
    enabled: !!name,
    refetchInterval: 5000
  })
  const run = runs?.[0]

  const { data: world } = useQuery({
    queryKey: ['pace-world', run?.id],
    queryFn: () => paceman.getWorld(run!.id),
    enabled: !!run,
    refetchInterval: 5000
  })
  const live = !!world?.isLive

  return (
    <section
      className="surface p-5 animate-fade-up"
      style={{
        animationDelay: '90ms',
        boxShadow: live ? '0 0 0 1px rgba(74,255,140,.25), 0 0 36px rgba(74,255,140,.12)' : undefined
      }}
    >
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PortalBlock size={18} />
          <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">Live Pace</h2>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            live ? 'animate-pulse-glow' : ''
          }`}
          style={{
            color: live ? 'var(--win)' : 'var(--faint)',
            background: live ? 'rgba(74,255,140,.12)' : 'transparent',
            border: `1px solid ${live ? 'rgba(74,255,140,.3)' : 'var(--line)'}`
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: live ? 'var(--win)' : 'var(--faint)' }}
          />
          {live ? 'RUNNING' : 'IDLE'}
        </span>
      </header>

      {!name ? (
        <Empty>Sign in to track your pace.</Empty>
      ) : !run ? (
        <Empty>No recent runs. Launch RSG and your splits appear here.</Empty>
      ) : (
        <SplitLadder run={run} live={live} />
      )}
    </section>
  )
}

function SplitLadder({ run, live }: { run: RecentRun; live: boolean }) {
  // Last reached split is the current "front" of the run.
  const reachedIdx = SPLIT_ORDER.reduce((acc, s, i) => (run[s.key] != null ? i : acc), -1)
  return (
    <div className="space-y-1.5">
      {SPLIT_ORDER.map((s, i) => {
        const t = run[s.key]
        const reached = t != null
        const isFront = i === reachedIdx && live
        return (
          <div
            key={s.key}
            className="flex items-center justify-between rounded-md px-3 py-1.5"
            style={{
              background: isFront ? 'rgba(74,255,140,.08)' : reached ? 'rgba(245,200,66,.05)' : 'transparent',
              border: `1px solid ${isFront ? 'rgba(74,255,140,.25)' : 'var(--line)'}`
            }}
          >
            <span className="text-sm" style={{ color: reached ? 'var(--text)' : 'var(--faint)' }}>
              {s.label}
            </span>
            <span
              className="font-display tnum text-sm"
              style={{ color: isFront ? 'var(--win)' : reached ? 'var(--gold)' : 'var(--faint)' }}
            >
              {reached ? msToTime(t) : '–:––'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="grid h-28 place-items-center text-center text-sm text-muted">{children}</div>
}
