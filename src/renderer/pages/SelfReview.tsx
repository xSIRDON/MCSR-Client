import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { useUi } from '../store/uiStore'
import { analyzeRanked, analyzeSplits, analyzeTypeBreakdowns, scorecardInsights, splitCallouts } from '@core/ranked-analytics'
import type { RankedInsight, SplitPerf, SplitStat, TypeBreakdown } from '@core/ranked-analytics'
import { msToTime } from '@core/format'
import { usePlayerAnalytics } from '../hooks/usePlayerAnalytics'
import type { SeasonSel } from '../hooks/usePlayerAnalytics'
import { nextTierAbove } from '../lib/baseline'
import { PlayerHead } from '../components/PlayerHead'
import { RankBadge } from '../components/RankBadge'
import { StatRow } from '../components/StatRow'
import { PlayStyleRadar } from '../components/PlayStyleRadar'
import { SplitPerformanceRadar } from '../components/SplitPerformanceRadar'
import { SeasonPicker } from '../components/SeasonPicker'

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
  const [seasonSel, setSeasonSel] = useState<SeasonSel>(undefined)
  const pa = usePlayerAnalytics(uuid, seasonSel)
  const {
    user,
    matches,
    details,
    analytics,
    season,
    scope,
    seasonWinRate,
    head,
    deaths,
    scorecard,
    perfWorld,
    playerSegs,
    rank,
    hasData,
    analyzedN,
    loading,
    detailsLoading
  } = pa

  const splits = useMemo(() => analyzeSplits(uuid, details), [uuid, details])
  const breakdowns = useMemo(
    () => analyzeTypeBreakdowns(uuid, matches ?? [], details),
    [uuid, matches, details]
  )

  // Split callouts (best / weakest split, and the biggest gap to the next tier) rank each of
  // your splits against the whole-world baseline and the tier above you.
  const nextTier = useMemo(() => nextTierAbove(rank.tier.toLowerCase()), [rank.tier])
  const insights = useMemo(
    () =>
      [
        ...splitCallouts(perfWorld, playerSegs, nextTier),
        ...scorecardInsights(
          scorecard,
          {
            winRate: seasonWinRate,
            played: season.played,
            bestTime: season.bestTime,
            bestStreak: season.bestStreak
          },
          deaths
        )
      ].slice(0, 8),
    [perfWorld, playerSegs, nextTier, scorecard, deaths, seasonWinRate, season.played, season.bestTime, season.bestStreak]
  )

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
        <div className="ml-auto flex items-center gap-3">
          <SeasonPicker value={seasonSel} onChange={setSeasonSel} />
          <div className="hidden sm:block">
            <RankBadge elo={head.elo} size="md" />
          </div>
        </div>
      </header>

      {loading ? (
        <ReviewSkeleton />
      ) : !hasData ? (
        <div className="surface grid h-40 place-items-center text-muted">
          Not enough ranked matches yet.
        </div>
      ) : (
        <>
          <StatRow head={head} scope={scope} />
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(360px,1fr))]">
            <PlayStyleRadar dims={scorecard} />
            <SplitPerformanceRadar
              uuid={uuid}
              details={details}
              tierKey={rank.tier.toLowerCase()}
              tierLabel={rank.tier}
              loading={detailsLoading}
            />
          </div>
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
            <InsightsCard insights={insights} />
            <WinRateBars analytics={analytics} />
          </div>
          {analyzedN > 0 && (
            <div className="px-1 text-[11px] uppercase tracking-[0.16em] text-faint">
              Split detail below from your last {analyzedN} ranked{' '}
              {analyzedN === 1 ? 'match' : 'matches'}
            </div>
          )}
          <TargetSplitsGrid splits={splits} perf={perfWorld} nextTier={nextTier} loading={detailsLoading} />
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
            <TypeBars
              title="Overworld by seed type"
              breakdown={breakdowns.overworld}
              loadingTimes={detailsLoading}
            />
            <TypeBars
              title="Bastion by type"
              breakdown={breakdowns.bastion}
              loadingTimes={detailsLoading}
            />
          </div>
          <CompletionHistogram times={analytics.completionTimes} />
        </>
      )}
    </div>
  )
}

/** Splits card next to the "how to rank up" targets when a next tier exists; full-width otherwise. */
function TargetSplitsGrid({
  splits,
  perf,
  nextTier,
  loading
}: {
  splits: SplitStat[]
  perf: SplitPerf[]
  nextTier?: { label: string; bucket: Record<string, number[]> }
  loading: boolean
}) {
  const targets = useMemo(() => {
    if (!nextTier) return []
    return perf
      .filter((p) => p.ms != null && (nextTier.bucket[p.key]?.length ?? 0) >= 51)
      .map((p) => {
        const target = nextTier.bucket[p.key][50] // that tier's median
        return { key: p.key, label: p.label, yours: p.ms as number, target, delta: (p.ms as number) - target }
      })
  }, [perf, nextTier])

  if (!nextTier || targets.length < 2) {
    return <SplitsCard splits={splits} loading={loading} />
  }
  return (
    // Dense 3-value rows (you · their median · gap) need real width — stack to one full-width
    // column rather than cram two and clip the gap column when the friends rail is open.
    <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(408px,1fr))]">
      <SplitsCard splits={splits} loading={loading} />
      <TargetSplitsCard tierLabel={nextTier.label} targets={targets} />
    </div>
  )
}

/** Signed compact delta, seconds resolution: "+0:12" behind, "−0:05" ahead. */
function fmtDelta(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000)
  const body = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  return `${ms > 0 ? '+' : '−'}${body}`
}

function TargetSplitsCard({
  tierLabel,
  targets
}: {
  tierLabel: string
  targets: { key: string; label: string; yours: number; target: number; delta: number }[]
}) {
  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '110ms' }}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">
          Target splits — {tierLabel} pace
        </h2>
        <span className="text-xs text-faint">you · their median · gap</span>
      </header>
      <div className="space-y-0.5">
        {targets.map((t) => {
          const behind = t.delta > 1000 // ignore sub-second noise
          const ahead = t.delta < -1000
          const color = behind ? 'var(--loss)' : ahead ? 'var(--win)' : 'var(--muted)'
          return (
            <div
              key={t.key}
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-3 py-2 odd:bg-white/[0.02]"
            >
              <span className="text-sm text-text">{t.label}</span>
              <div className="flex items-center gap-5">
                <span className="tnum font-display w-[4.5rem] text-right text-sm text-text">
                  {msToTime(t.yours)}
                </span>
                <span className="tnum w-[4.5rem] text-right text-xs text-faint">
                  {msToTime(t.target)}
                </span>
                <span className="tnum font-display w-[4rem] text-right text-sm" style={{ color }}>
                  {Math.abs(t.delta) <= 1000 ? '±0:00' : fmtDelta(t.delta)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-faint">
        Median split times of {tierLabel} players. Close the red gaps — biggest gap first — to rank
        up fastest.
      </p>
    </section>
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

/** Average split time per seed/bastion type as a horizontal bar. Every canonical type is listed
 *  (so e.g. Housing shows even with no games yet) — longer bar = slower, "—" when there's no data. */
function TypeBars({
  title,
  breakdown,
  loadingTimes
}: {
  title: string
  breakdown: TypeBreakdown
  loadingTimes: boolean
}) {
  const rows = [...breakdown.rows].sort(
    (a, b) => (a.average ?? Infinity) - (b.average ?? Infinity) || a.label.localeCompare(b.label)
  )
  const withData = rows.filter((r) => r.average != null)
  const maxMs = withData.length ? Math.max(...withData.map((r) => r.average as number)) : 1
  const split = breakdown.splitLabel.toLowerCase()
  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '140ms' }}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">{title}</h2>
        <span className="text-xs text-faint">avg {split} · fastest first</span>
      </header>
      {rows.length === 0 ? (
        <div className="grid h-24 place-items-center text-sm text-muted">No matches yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.key}
              className="flex items-center gap-3"
              title={r.count ? `${r.count} run${r.count === 1 ? '' : 's'}` : 'no runs yet'}
            >
              <span className="w-[5.5rem] shrink-0 truncate text-sm text-text">{r.label}</span>
              <div className="relative h-5 flex-1 overflow-hidden rounded bg-white/[0.03]">
                {r.average != null && (
                  <div
                    className="absolute inset-y-0 left-0 rounded transition-[width] duration-500"
                    style={{
                      width: `${Math.max(6, Math.round((r.average / maxMs) * 100))}%`,
                      background: 'linear-gradient(90deg, var(--gold), #d9a52c)'
                    }}
                  />
                )}
              </div>
              <span
                className="tnum w-[4.5rem] shrink-0 text-right text-sm"
                style={{ color: r.average != null ? 'var(--gold)' : 'var(--faint)' }}
              >
                {r.average != null ? msToTime(r.average) : loadingTimes ? '···' : '—'}
              </span>
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

/** Bar color by win rate: green strong, red weak, gold in between. */
function winFill(rate: number): string {
  if (rate >= 55) return '#5fd38d'
  if (rate <= 40) return '#e2706e'
  return '#caa94a'
}

function WinRateTooltip({
  active,
  payload
}: {
  active?: boolean
  payload?: Array<{ payload: { label: string; rate: number; n: number } }>
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="surface-2 px-3 py-2 text-xs">
      <div className="font-display text-text">
        {p.label} · {p.rate}%
      </div>
      <div className="text-muted">{p.n} decided</div>
    </div>
  )
}

/** Recent win rate vs stronger / weaker opponents and overall recent form. */
function WinRateBars({ analytics }: { analytics: ReturnType<typeof analyzeRanked> }) {
  const data = [
    { label: 'vs Stronger', rate: analytics.vsHigher.winRate, n: analytics.vsHigher.decided },
    { label: 'vs Weaker', rate: analytics.vsLower.winRate, n: analytics.vsLower.decided },
    { label: 'Recent', rate: analytics.recentWinRate, n: analytics.recentSample }
  ].filter((d) => d.n > 0)
  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '160ms' }}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">
          By opponent strength
        </h2>
        <span className="text-xs text-faint">recent win%</span>
      </header>
      {data.length === 0 ? (
        <div className="grid h-[170px] place-items-center text-center text-sm text-muted">
          Not enough decided games in your recent matches yet.
        </div>
      ) : (
        <div className="h-[170px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 6, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis
                type="category"
                dataKey="label"
                width={88}
                tick={{ fill: '#cdcdd8', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<WinRateTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar
                dataKey="rate"
                radius={[0, 4, 4, 0]}
                isAnimationActive
                animationDuration={600}
                label={{
                  position: 'right',
                  formatter: (v: number) => `${v}%`,
                  fill: '#8b8b9e',
                  fontSize: 11
                }}
              >
                {data.map((d) => (
                  <Cell key={d.label} fill={winFill(d.rate)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
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
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(128px,1fr))]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-[88px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
        <div className="skeleton h-56 rounded-2xl" />
        <div className="skeleton h-56 rounded-2xl" />
      </div>
      <div className="skeleton h-[232px] rounded-2xl" />
    </div>
  )
}
