import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { useUi } from '../store/uiStore'
import { mcsr } from '../lib/clients'
import {
  analyzeRanked,
  analyzeSplits,
  analyzeTypeBreakdowns,
  buildScorecard,
  buildSplitRadar,
  countDeaths,
  scorecardInsights
} from '@core/ranked-analytics'
import type {
  RankedInsight,
  ScoreDim,
  SplitRadarDim,
  SplitStat,
  TypeBreakdown
} from '@core/ranked-analytics'
import { seasonRanked } from '@services/mcsr-ranked'
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

  // Headline totals come from the authoritative season statistics (getUser). The matches
  // endpoint only returns a recent window, so counting wins from it under-reports a player's
  // record (e.g. a recent losing streak reads as "0 wins"). The match list still drives the
  // recent-detail analytics below.
  const season = seasonRanked(user)
  const useSeason = season.played > 0
  const head = {
    wins: useSeason ? season.wins : analytics.wins,
    losses: useSeason ? season.loses : analytics.losses,
    played: useSeason ? season.played : analytics.played,
    bestTime: (useSeason && season.bestTime) || analytics.best,
    currentStreak: useSeason ? season.currentStreak : Math.max(0, analytics.currentStreak),
    bestStreak: useSeason ? season.bestStreak : analytics.bestWinStreak,
    elo: user?.eloRate ?? null,
    netElo: analytics.netElo
  }
  const hasData = head.played > 0 || analytics.played > 0
  const recentN = (matches ?? []).filter((m) => m.type === 2).length

  const seasonDecided = season.wins + season.loses
  const seasonWinRate =
    seasonDecided > 0 ? Math.round((season.wins / seasonDecided) * 1000) / 10 : null
  const deaths = useMemo(() => countDeaths(uuid, details ?? []), [uuid, details])
  const scorecard = useMemo(
    () => buildScorecard(analytics, seasonWinRate, season.played, deaths),
    [analytics, seasonWinRate, season.played, deaths]
  )
  const splitRadar = useMemo(() => buildSplitRadar(splits), [splits])
  const insights = useMemo(
    () =>
      scorecardInsights(
        scorecard,
        {
          winRate: seasonWinRate,
          played: season.played,
          bestTime: season.bestTime,
          bestStreak: season.bestStreak
        },
        deaths
      ),
    [scorecard, deaths, seasonWinRate, season.played, season.bestTime, season.bestStreak]
  )

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
      ) : !hasData ? (
        <div className="surface grid h-40 place-items-center text-muted">
          Not enough ranked matches yet.
        </div>
      ) : (
        <>
          <StatRow head={head} />
          <div className="grid gap-4 lg:grid-cols-2">
            <PlayStyleRadar dims={scorecard} />
            <SplitsRadar dims={splitRadar} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <InsightsCard insights={insights} />
            <WinRateBars analytics={analytics} />
          </div>
          {recentN > 0 && (
            <div className="px-1 text-[11px] uppercase tracking-[0.16em] text-faint">
              Split detail below from your last {recentN} ranked{' '}
              {recentN === 1 ? 'match' : 'matches'}
            </div>
          )}
          <SplitsCard splits={splits} loading={detailsLoading && !details} />
          <div className="grid gap-4 lg:grid-cols-2">
            <TypeBarChart
              title="Overworld by seed type"
              breakdown={breakdowns.overworld}
              loadingTimes={detailsLoading && !details}
            />
            <TypeBarChart
              title="Bastion by type"
              breakdown={breakdowns.bastion}
              loadingTimes={detailsLoading && !details}
            />
          </div>
          <CompletionHistogram times={analytics.completionTimes} />
        </>
      )}
    </div>
  )
}

interface HeadStats {
  wins: number
  losses: number
  played: number
  bestTime: number | null
  currentStreak: number
  bestStreak: number
  elo: number | null
  netElo: number
}

function StatRow({ head }: { head: HeadStats }) {
  const decided = head.wins + head.losses
  const winRate = decided > 0 ? Math.round((head.wins / decided) * 1000) / 10 : 0
  const netColor = head.netElo > 0 ? 'var(--win)' : head.netElo < 0 ? 'var(--loss)' : undefined
  const streakColor = head.currentStreak > 0 ? 'var(--win)' : undefined

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatTile
        label="Win Rate"
        value={`${winRate}%`}
        hint={`${head.wins}W · ${head.losses}L`}
        accent="var(--gold)"
        delay={20}
      />
      <StatTile
        label="Record"
        value={`${head.wins}–${head.losses}`}
        hint={`${head.played} played`}
        delay={60}
      />
      <StatTile
        label="Elo"
        value={head.elo != null ? String(head.elo) : '—'}
        hint={`${signedElo(head.netElo)} recent`}
        accent={netColor}
        delay={100}
      />
      <StatTile
        label="Best Time"
        value={msToTime(head.bestTime)}
        hint="season best"
        accent="var(--portal)"
        delay={140}
      />
      <StatTile
        label="Win Streak"
        value={head.currentStreak > 0 ? `${head.currentStreak}W` : '—'}
        hint={`best ${head.bestStreak}W`}
        accent={streakColor}
        delay={180}
      />
    </div>
  )
}

function RadarTooltip({
  active,
  payload
}: {
  active?: boolean
  payload?: Array<{ payload: { axis: string; score: number; detail: string } }>
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="surface-2 px-3 py-2 text-xs">
      <div className="font-display text-text">
        {p.axis} · {p.score}
      </div>
      <div className="text-muted">{p.detail}</div>
    </div>
  )
}

function PlayStyleRadar({ dims }: { dims: ScoreDim[] }) {
  const data = dims.map((d) => ({ axis: d.label, score: d.score, detail: d.detail }))
  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '70ms' }}>
      <header className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">
          Strengths &amp; weaknesses
        </h2>
        <span className="text-xs text-faint">0–100</span>
      </header>
      {data.length < 3 ? (
        <div className="grid h-[240px] place-items-center text-center text-sm text-muted">
          Play more ranked games to build your profile.
        </div>
      ) : (
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="70%">
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis dataKey="axis" tick={{ fill: '#8b8b9e', fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                dataKey="score"
                stroke="#f5c842"
                fill="#f5c842"
                fillOpacity={0.28}
                isAnimationActive
                animationDuration={600}
              />
              <Tooltip content={<RadarTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

function SplitsRadar({ dims }: { dims: SplitRadarDim[] }) {
  const data = dims
    .filter((d) => d.score != null)
    .map((d) => ({
      axis: d.label,
      score: d.score as number,
      detail: d.avgMs != null ? `avg ${msToTime(d.avgMs)} · pace ${msToTime(d.refMs)}` : '—'
    }))
  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '90ms' }}>
      <header className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">Split pace</h2>
        <span className="text-xs text-faint">vs typical pace</span>
      </header>
      {data.length < 3 ? (
        <div className="grid h-[240px] place-items-center text-center text-sm text-muted">
          Not enough split data in your recent matches yet.
        </div>
      ) : (
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="70%">
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis dataKey="axis" tick={{ fill: '#8b8b9e', fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                dataKey="score"
                stroke="#7aa2f7"
                fill="#7aa2f7"
                fillOpacity={0.28}
                isAnimationActive
                animationDuration={600}
              />
              <Tooltip content={<RadarTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
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

function TypeTimeTooltip({
  active,
  payload
}: {
  active?: boolean
  payload?: Array<{ payload: { label: string; ms: number; best: number | null; count: number } }>
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="surface-2 px-3 py-2 text-xs">
      <div className="font-display text-text">{p.label}</div>
      <div className="text-muted">
        avg {msToTime(p.ms)}
        {p.best != null ? ` · best ${msToTime(p.best)}` : ''} · {p.count} run
        {p.count === 1 ? '' : 's'}
      </div>
    </div>
  )
}

/** Horizontal bar chart of average split time per seed/bastion type — shorter = faster. */
function TypeBarChart({
  title,
  breakdown,
  loadingTimes
}: {
  title: string
  breakdown: TypeBreakdown
  loadingTimes: boolean
}) {
  const data = breakdown.rows
    .filter((r) => r.average != null)
    .map((r) => ({ label: r.label, ms: r.average as number, best: r.best, count: r.count }))
    .sort((a, b) => a.ms - b.ms)
  const split = breakdown.splitLabel.toLowerCase()
  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '140ms' }}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">{title}</h2>
        <span className="text-xs text-faint">avg {split} · fastest first</span>
      </header>
      {data.length === 0 ? (
        <div className="grid h-[180px] place-items-center text-center text-sm text-muted">
          {loadingTimes
            ? 'Loading split times…'
            : `No ${breakdown.dimension === 'bastion' ? 'bastion' : 'seed'}-type split data in your recent matches yet.`}
        </div>
      ) : (
        <div style={{ height: Math.max(150, data.length * 38 + 30) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 54, left: 6, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis
                type="number"
                dataKey="ms"
                tickFormatter={(v) => msToTime(v)}
                tick={{ fill: '#8b8b9e', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={96}
                tick={{ fill: '#cdcdd8', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<TypeTimeTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar
                dataKey="ms"
                fill="#f5c842"
                radius={[0, 4, 4, 0]}
                isAnimationActive
                animationDuration={600}
                label={{
                  position: 'right',
                  formatter: (v: number) => msToTime(v),
                  fill: '#8b8b9e',
                  fontSize: 11
                }}
              />
            </BarChart>
          </ResponsiveContainer>
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
