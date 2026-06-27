import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useUi } from '../store/uiStore'
import { mcsr } from '../lib/clients'
import { analyzeRanked, analyzeSplits, analyzeTypeBreakdowns } from '@core/ranked-analytics'
import type { RankedInsight, SplitStat, TypeBreakdown } from '@core/ranked-analytics'
import type { MatchInfo } from '@services/mcsr-ranked'
import { eloToRank } from '@core/rank'
import { msToTime, signedElo } from '@core/format'
import { PlayerHead } from '../components/PlayerHead'
import { RankBadge } from '../components/RankBadge'
import { StatTile } from '../components/StatTile'

const KIND_COLOR: Record<RankedInsight['kind'], string> = {
  strength: 'var(--win)',
  weakness: 'var(--loss)',
  note: 'var(--muted)'
}

const KIND_LABEL: Record<RankedInsight['kind'], string> = {
  strength: 'Strength',
  weakness: 'Weakness',
  note: 'Note'
}

export function SelfReview() {
  const profile = useUi((s) => s.profile)
  const uuid = profile?.uuid

  if (!uuid) {
    return (
      <div className="mx-auto max-w-[980px] px-5 py-4">
        <div className="surface grid h-48 place-items-center text-muted">
          Sign in to see your review.
        </div>
      </div>
    )
  }

  return <Review uuid={uuid} name={profile?.name ?? ''} />
}

function Review({ uuid, name }: { uuid: string; name: string }) {
  const { data: matches, isLoading: matchesLoading } = useQuery({
    queryKey: ['review-matches', uuid],
    queryFn: () => mcsr.getMatches(uuid, { type: 2, count: 100 })
  })
  const { data: user } = useQuery({
    queryKey: ['user', uuid],
    queryFn: () => mcsr.getUser(uuid)
  })

  const analytics = useMemo(() => analyzeRanked(uuid, matches ?? []), [uuid, matches])

  // Splits live in each match's timeline (the detail endpoint), so fetch the recent matches'
  // details — politeFetch serializes the requests — and cache them for the session.
  const detailIds = useMemo(
    () =>
      (matches ?? [])
        .filter((m) => m.type === 2)
        .slice(0, 30)
        .map((m) => m.id),
    [matches]
  )
  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ['review-splits', uuid, detailIds],
    queryFn: async () => {
      const out: MatchInfo[] = []
      for (const id of detailIds) {
        try {
          out.push(await mcsr.getMatch(id))
        } catch {
          /* skip a failed detail fetch */
        }
      }
      return out
    },
    enabled: detailIds.length > 0,
    staleTime: Infinity,
    gcTime: Infinity
  })
  const splits = useMemo(() => analyzeSplits(uuid, details ?? []), [uuid, details])
  const breakdowns = useMemo(
    () => analyzeTypeBreakdowns(uuid, matches ?? [], details ?? []),
    [uuid, matches, details]
  )

  const rank = eloToRank(user?.eloRate)

  const loading = matchesLoading && !matches

  return (
    <div className="mx-auto max-w-[980px] space-y-4 px-5 py-4">
      <header className="flex flex-wrap items-center gap-4 animate-fade-up">
        <div
          className="rounded-xl p-1"
          style={{ boxShadow: `0 0 0 1.5px ${rank.color}55, 0 0 22px ${rank.glow}33` }}
        >
          <PlayerHead id={uuid} uuid={uuid} size={48} className="rounded-lg" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.22em] text-faint">Your numbers</div>
          <h1 className="font-display text-2xl tracking-wide text-text">
            {user?.nickname ?? name} · Ranked Review
          </h1>
        </div>
        <div className="ml-auto hidden sm:block">
          <RankBadge elo={user?.eloRate} size="md" />
        </div>
      </header>

      {loading ? (
        <ReviewSkeleton />
      ) : analytics.played === 0 ? (
        <div className="surface grid h-40 place-items-center text-muted">
          Not enough ranked matches yet.
        </div>
      ) : (
        <>
          <StatRow analytics={analytics} />
          <SplitsCard splits={splits} loading={detailsLoading && !details} />
          <div className="grid gap-4 lg:grid-cols-2">
            <TypeBreakdownCard
              title="Overworld by seed type"
              breakdown={breakdowns.overworld}
              loadingTimes={detailsLoading && !details}
            />
            <TypeBreakdownCard
              title="Bastion by type"
              breakdown={breakdowns.bastion}
              loadingTimes={detailsLoading && !details}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <InsightsCard insights={analytics.insights} />
            <OpponentSplit analytics={analytics} />
          </div>
          <CompletionHistogram times={analytics.completionTimes} />
        </>
      )}
    </div>
  )
}

function StatRow({ analytics }: { analytics: ReturnType<typeof analyzeRanked> }) {
  const netColor =
    analytics.netElo > 0 ? 'var(--win)' : analytics.netElo < 0 ? 'var(--loss)' : undefined
  const streak = analytics.currentStreak
  const streakColor = streak > 0 ? 'var(--win)' : streak < 0 ? 'var(--loss)' : undefined
  const streakValue =
    streak === 0 ? '—' : `${Math.abs(streak)}${streak > 0 ? 'W' : 'L'}`

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatTile
        label="Win Rate"
        value={`${analytics.winRate}%`}
        hint={`${analytics.wins}W · ${analytics.losses}L`}
        accent="var(--gold)"
        delay={20}
      />
      <StatTile
        label="Record"
        value={`${analytics.wins}–${analytics.losses}`}
        hint={`${analytics.played} played${analytics.draws ? ` · ${analytics.draws} draw` : ''}`}
        delay={60}
      />
      <StatTile
        label="Net Elo"
        value={signedElo(analytics.netElo)}
        hint={`▲${analytics.biggestGain} · ▼${Math.abs(analytics.biggestLoss)}`}
        accent={netColor}
        delay={100}
      />
      <StatTile
        label="Best / Avg Win"
        value={msToTime(analytics.best)}
        hint={`avg ${msToTime(analytics.averageWin)}`}
        accent="var(--portal)"
        delay={140}
      />
      <StatTile
        label="Current Streak"
        value={streakValue}
        hint={`best ${analytics.bestWinStreak}W`}
        accent={streakColor}
        delay={180}
      />
    </div>
  )
}

function SplitsCard({ splits, loading }: { splits: SplitStat[]; loading: boolean }) {
  const hasAny = splits.some((s) => s.count > 0)
  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '90ms' }}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">Splits</h2>
        <span className="text-xs text-faint">best · avg · runs</span>
      </header>
      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-9 rounded-lg" />
          ))}
        </div>
      ) : !hasAny ? (
        <div className="grid h-24 place-items-center text-sm text-muted">
          No split data in your recent matches yet.
        </div>
      ) : (
        <div className="space-y-0.5">
          {splits.map((s) => (
            <div
              key={s.key}
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-3 py-2 odd:bg-white/[0.02]"
            >
              <span className="text-sm text-text">{s.label}</span>
              <div className="flex items-center gap-5">
                <span
                  className="tnum font-display w-[5.5rem] text-right text-sm"
                  style={{ color: s.best != null ? 'var(--gold)' : 'var(--faint)' }}
                >
                  {msToTime(s.best)}
                </span>
                <span className="tnum w-[5.5rem] text-right text-xs text-faint">
                  {s.average != null ? msToTime(s.average) : '—'}
                </span>
                <span className="w-7 text-right text-[10px] text-faint">{s.count || ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Win-rate color: green above 55%, red below 40%, muted in between. */
function winColor(rate: number | null): string {
  if (rate == null) return 'var(--faint)'
  if (rate >= 55) return 'var(--win)'
  if (rate <= 40) return 'var(--loss)'
  return 'var(--muted)'
}

function TypeBreakdownCard({
  title,
  breakdown,
  loadingTimes
}: {
  title: string
  breakdown: TypeBreakdown
  loadingTimes: boolean
}) {
  const rows = breakdown.rows
  const split = breakdown.splitLabel.toLowerCase()
  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '140ms' }}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">{title}</h2>
        <span className="text-xs text-faint">win% · best {split}</span>
      </header>
      {rows.length === 0 ? (
        <div className="grid h-24 place-items-center text-sm text-muted">
          No {breakdown.dimension === 'bastion' ? 'bastion' : 'seed'}-type data in your recent matches
          yet.
        </div>
      ) : (
        <div className="space-y-0.5">
          <div className="grid grid-cols-[1fr_auto] gap-3 px-3 pb-1">
            <span className="text-[10px] uppercase tracking-[0.14em] text-faint">Type</span>
            <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.14em] text-faint">
              <span className="w-8 text-right">runs</span>
              <span className="w-11 text-right">win%</span>
              <span className="w-[4.5rem] text-right">best</span>
              <span className="w-[4.5rem] text-right">avg</span>
            </div>
          </div>
          {rows.map((r) => (
            <div
              key={r.key}
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-3 py-2 odd:bg-white/[0.02]"
            >
              <span className="truncate text-sm text-text">{r.label}</span>
              <div className="flex items-center gap-4">
                <span className="tnum w-8 text-right text-xs text-muted">{r.count}</span>
                <span
                  className="tnum w-11 text-right text-xs font-medium"
                  style={{ color: winColor(r.winRate) }}
                >
                  {r.winRate != null ? `${r.winRate}%` : '—'}
                </span>
                <span
                  className="tnum font-display w-[4.5rem] text-right text-sm"
                  style={{ color: r.best != null ? 'var(--gold)' : 'var(--faint)' }}
                >
                  {r.best != null ? msToTime(r.best) : loadingTimes ? '···' : '—'}
                </span>
                <span className="tnum w-[4.5rem] text-right text-xs text-faint">
                  {r.average != null ? msToTime(r.average) : loadingTimes ? '···' : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function InsightsCard({ insights }: { insights: RankedInsight[] }) {
  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '120ms' }}>
      <h2 className="mb-3 font-display text-sm uppercase tracking-[0.16em] text-muted">Insights</h2>
      {insights.length === 0 ? (
        <div className="text-sm text-muted">No standout patterns yet.</div>
      ) : (
        <ul className="space-y-2.5">
          {insights.map((ins, i) => {
            const color = KIND_COLOR[ins.kind]
            return (
              <li key={`${ins.label}-${i}`} className="flex gap-3">
                <span
                  className="mt-[7px] h-2 w-2 shrink-0 rounded-full"
                  style={{ background: color, boxShadow: `0 0 8px ${color}66` }}
                />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-sm tracking-wide text-text">{ins.label}</span>
                    <span
                      className="text-[10px] uppercase tracking-[0.16em]"
                      style={{ color }}
                    >
                      {KIND_LABEL[ins.kind]}
                    </span>
                  </div>
                  <div className="text-sm text-muted">{ins.detail}</div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function OpponentSplit({ analytics }: { analytics: ReturnType<typeof analyzeRanked> }) {
  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '160ms' }}>
      <h2 className="mb-3 font-display text-sm uppercase tracking-[0.16em] text-muted">
        By opponent strength
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <SplitTile
          title="vs Stronger"
          subtitle="higher elo"
          winRate={analytics.vsHigher.winRate}
          decided={analytics.vsHigher.decided}
          accent="var(--loss)"
        />
        <SplitTile
          title="vs Weaker"
          subtitle="lower elo"
          winRate={analytics.vsLower.winRate}
          decided={analytics.vsLower.decided}
          accent="var(--win)"
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-faint">
        <span>Recent form (last {analytics.recentSample})</span>
        <span className="tnum text-muted">{analytics.recentWinRate}%</span>
      </div>
    </section>
  )
}

function SplitTile({
  title,
  subtitle,
  winRate,
  decided,
  accent
}: {
  title: string
  subtitle: string
  winRate: number
  decided: number
  accent: string
}) {
  return (
    <div className="surface-2 px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-sm tracking-wide text-text">{title}</span>
        <span className="text-[10px] uppercase tracking-[0.16em] text-faint">{subtitle}</span>
      </div>
      <div className="tnum mt-1 font-display text-2xl leading-none" style={{ color: accent }}>
        {decided > 0 ? `${winRate}%` : '—'}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-2)]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${decided > 0 ? winRate : 0}%`, background: accent }}
        />
      </div>
      <div className="mt-1.5 text-xs text-faint">{decided} decided</div>
    </div>
  )
}

interface Bucket {
  label: string
  count: number
}

/** Bucket winning times into fixed-width bins for the histogram. */
function bucketTimes(times: number[]): Bucket[] {
  const valid = times.filter((t) => typeof t === 'number' && t > 0)
  if (valid.length === 0) return []
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  // Round the lower edge down to a clean 30s boundary; 30s-wide buckets.
  const width = 30_000
  const start = Math.floor(min / width) * width
  const binCount = Math.max(1, Math.floor((max - start) / width) + 1)
  const buckets: Bucket[] = Array.from({ length: binCount }, (_, i) => {
    const lo = start + i * width
    return { label: msToTime(lo), count: 0 }
  })
  for (const t of valid) {
    const idx = Math.min(binCount - 1, Math.floor((t - start) / width))
    buckets[idx].count++
  }
  return buckets
}

function CompletionHistogram({ times }: { times: number[] }) {
  const buckets = useMemo(() => bucketTimes(times), [times])

  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '200ms' }}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">
          Completion times
        </h2>
        <span className="text-xs text-faint">{times.length} wins</span>
      </header>
      {buckets.length === 0 ? (
        <div className="grid h-[180px] place-items-center text-sm text-muted">
          No completed wins to chart yet.
        </div>
      ) : (
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#8b8b9e', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: '#8b8b9e', fontSize: 11 }}
                width={42}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<HistTooltip />} cursor={{ fill: 'rgba(245,200,66,0.08)' }} />
              <Bar
                dataKey="count"
                fill="#f5c842"
                radius={[3, 3, 0, 0]}
                isAnimationActive
                animationDuration={600}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

function HistTooltip({
  active,
  payload,
  label
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const count = payload[0].value
  return (
    <div className="surface-2 px-3 py-2 text-xs">
      <div className="font-display text-text">{label}+</div>
      <div className="text-muted">
        {count} win{count === 1 ? '' : 's'}
      </div>
    </div>
  )
}

function ReviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-[88px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="skeleton h-56 rounded-2xl" />
        <div className="skeleton h-56 rounded-2xl" />
      </div>
      <div className="skeleton h-[232px] rounded-2xl" />
    </div>
  )
}
