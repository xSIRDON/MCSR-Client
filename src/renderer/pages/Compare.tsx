import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer
} from 'recharts'
import { useUi } from '../store/uiStore'
import { mcsr, paceman } from '../lib/clients'
import { msToTime } from '@core/format'
import { usePlayerAnalytics } from '../hooks/usePlayerAnalytics'
import type { SeasonSel } from '../hooks/usePlayerAnalytics'
import { eloWinChance } from '@core/rank'
import { PlayerHead } from '../components/PlayerHead'
import { RankBadge } from '../components/RankBadge'
import { SeasonPicker } from '../components/SeasonPicker'

const A_COLOR = '#f5c842' // gold
const B_COLOR = '#9f6bff' // portal purple

/** Below this many decided games, a side's numbers are flagged as a small sample. */
const SMALL_SAMPLE = 10

/** Everything one side of the comparison needs, resolved from a searched name. */
function useCompareSide(name: string, season?: SeasonSel) {
  const seasonNum = typeof season === 'number' ? season : undefined
  const { data: user, isError } = useQuery({
    queryKey: seasonNum != null ? ['user', name, seasonNum] : ['user', name],
    queryFn: () => mcsr.getUser(name, { season: seasonNum }),
    enabled: !!name
  })
  const analytics = usePlayerAnalytics(user?.uuid, season)
  const { data: rsgPb } = useQuery({
    queryKey: ['rsg-pb', user?.nickname],
    queryFn: () => paceman.getPB(user!.nickname),
    enabled: !!user?.nickname
  })
  const notFound = !!name && isError
  return {
    ...analytics,
    name,
    user,
    notFound,
    rsgPb: rsgPb ?? null,
    // True while ANY stage of this side is still resolving (name lookup, match list, details) —
    // the details query alone reads as "not loading" while its upstream queries are in flight.
    settling: (!!name && !user && !notFound) || analytics.loading || analytics.detailsLoading
  }
}

type Side = ReturnType<typeof useCompareSide>

export function Compare() {
  const [params, setParams] = useSearchParams()
  const profile = useUi((s) => s.profile)
  // Default the left side to the signed-in player, so "who beats whom" is one search away.
  const p1 = params.get('p1') ?? profile?.name ?? ''
  const p2 = params.get('p2') ?? ''
  const [seasonSel, setSeasonSel] = useState<SeasonSel>(undefined)

  const a = useCompareSide(p1, seasonSel)
  const b = useCompareSide(p2, seasonSel)

  // Empty values are DELETED, never written: an empty p1 param would otherwise
  // permanently wipe the "default to me" behavior for the left side.
  const write = (next1: string, next2: string): void => {
    const next = new URLSearchParams(params)
    if (next1) next.set('p1', next1)
    else next.delete('p1')
    if (next2) next.set('p2', next2)
    else next.delete('p2')
    setParams(next)
  }
  const set = (k: 'p1' | 'p2', v: string): void => write(k === 'p1' ? v : p1, k === 'p2' ? v : p2)
  const swap = (): void => write(p2, p1)

  return (
    <div className="mx-auto max-w-[980px] space-y-4 px-5 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-faint">Head to head</div>
          <h1 className="font-display text-2xl tracking-wide text-text">Compare players</h1>
        </div>
        <SeasonPicker value={seasonSel} onChange={setSeasonSel} />
      </header>

      <div className="flex items-center gap-3 animate-fade-up" style={{ animationDelay: '40ms' }}>
        <NameInput initial={p1} color={A_COLOR} placeholder="First player…" onSubmit={(v) => set('p1', v)} />
        <button
          onClick={swap}
          title="Swap sides"
          className="shrink-0 rounded-lg border border-[var(--line)] px-2.5 py-2 text-muted transition-colors hover:text-text"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M4 5h8m0 0L9.5 2.5M12 5L9.5 7.5M11 10H3m0 0l2.5-2.5M3 10l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <NameInput initial={p2} color={B_COLOR} placeholder="Second player…" onSubmit={(v) => set('p2', v)} />
      </div>

      {!p2 ? (
        <div className="surface grid h-48 place-items-center text-center text-sm text-muted">
          Search a second player to compare — splits, strengths, and who's actually faster.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <SideHero side={a} color={A_COLOR} />
            <SideHero side={b} color={B_COLOR} />
          </div>
          <WinChance a={a} b={b} />
          <HeadToHead a={a} b={b} />
          <CompareRadar a={a} b={b} />
          <SplitDeltas a={a} b={b} />
        </>
      )}
    </div>
  )
}

function NameInput({
  initial,
  color,
  placeholder,
  onSubmit
}: {
  initial: string
  color: string
  placeholder: string
  onSubmit: (v: string) => void
}) {
  const [q, setQ] = useState(initial)
  // Keep the box in sync when the URL changes (swap button, Compare-with-me links).
  const [last, setLast] = useState(initial)
  if (initial !== last) {
    setLast(initial)
    setQ(initial)
  }
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const v = q.trim()
    if (v) onSubmit(v)
  }
  return (
    <form onSubmit={submit} className="min-w-0 flex-1">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onBlur={() => {
          const v = q.trim()
          if (v && v !== initial) onSubmit(v)
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border bg-[var(--bg-2)] px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-faint"
        style={{ borderColor: `${color}55` }}
      />
    </form>
  )
}

function SideHero({ side, color }: { side: Side; color: string }) {
  const { user, notFound, name, head, scope } = side
  const gamesLabel = scope === 'total' ? 'career games' : 'games this season'
  const smallSample = head.played > 0 && head.played < SMALL_SAMPLE
  return (
    <section
      className="surface flex items-center gap-3 p-4 animate-fade-up"
      style={{ animationDelay: '60ms', boxShadow: `inset 0 0 0 1px ${color}33, 0 12px 44px rgba(0,0,0,.4)` }}
    >
      {user ? (
        <>
          <PlayerHead id={user.uuid} uuid={user.uuid} size={40} className="rounded-lg" />
          <div className="min-w-0">
            <div className="truncate font-display text-lg tracking-wide" style={{ color }}>
              {user.nickname}
            </div>
            <div className="text-xs text-muted">
              {head.elo != null ? `${head.elo} Elo` : 'Unrated'}
              <span className="text-faint"> · {head.played} {head.played === 1 ? gamesLabel.replace('games', 'game') : gamesLabel}</span>
            </div>
            {smallSample && (
              <div className="mt-0.5 text-[11px]" style={{ color: 'var(--gold)' }}>
                Small sample — read these numbers loosely.
              </div>
            )}
          </div>
          <div className="ml-auto shrink-0">
            <RankBadge elo={head.elo} size="sm" />
          </div>
        </>
      ) : (
        <div className="text-sm text-muted">
          {notFound ? `No ranked profile for “${name}”.` : name ? 'Looking up…' : 'Pick a player.'}
        </div>
      )}
    </section>
  )
}

/** Elo-based expected win probability, as a split bar between the two players. */
function WinChance({ a, b }: { a: Side; b: Side }) {
  const eloA = a.head.elo
  const eloB = b.head.elo
  if (eloA == null || eloB == null) return null
  const pA = eloWinChance(eloA, eloB)
  const pctA = Math.round(pA * 100)
  const pctB = 100 - pctA
  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '70ms' }}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">Win chance</h2>
        <span className="text-xs text-faint">from the Elo gap · {Math.abs(eloA - eloB)} apart</span>
      </header>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-display text-2xl tnum" style={{ color: A_COLOR }}>
          {pctA}%
        </span>
        <span className="font-display text-2xl tnum" style={{ color: B_COLOR }}>
          {pctB}%
        </span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.04]">
        <div
          className="transition-[width] duration-500"
          style={{ width: `${pctA}%`, background: `linear-gradient(90deg, ${A_COLOR}cc, ${A_COLOR})` }}
        />
        <div
          className="transition-[width] duration-500"
          style={{ width: `${pctB}%`, background: `linear-gradient(90deg, ${B_COLOR}, ${B_COLOR}cc)` }}
        />
      </div>
      <p className="mt-2 text-[11px] text-faint">
        Textbook Elo expectation — {a.user?.nickname ?? 'A'} is expected to take {pctA} of 100 games
        at these ratings. Form, seeds, and nerves not included.
      </p>
    </section>
  )
}

interface Metric {
  label: string
  a: number | null
  b: number | null
  fmt: (v: number) => string
  /** Which direction wins: higher (elo, win rate) or lower (times). */
  better: 'high' | 'low'
  /** Rate stats are noise on tiny records — suppress the winner glow when either side is small. */
  requireSample?: boolean
}

function HeadToHead({ a, b }: { a: Side; b: Side }) {
  const metrics: Metric[] = useMemo(() => {
    const rate = (s: Side): number | null => {
      const d = s.head.wins + s.head.losses
      return d > 0 ? Math.round((s.head.wins / d) * 1000) / 10 : null
    }
    return [
      { label: 'Elo', a: a.head.elo, b: b.head.elo, fmt: String, better: 'high' },
      { label: 'Win rate', a: rate(a), b: rate(b), fmt: (v) => `${v}%`, better: 'high', requireSample: true },
      // A real 0 (new season, no games yet) must render as 0, not '—' — only gate on the
      // player actually resolving.
      { label: 'Games played', a: a.user ? a.head.played : null, b: b.user ? b.head.played : null, fmt: String, better: 'high' },
      { label: 'Best time', a: a.head.bestTime, b: b.head.bestTime, fmt: msToTime, better: 'low' },
      { label: 'Avg win', a: a.head.averageWin, b: b.head.averageWin, fmt: msToTime, better: 'low', requireSample: true },
      { label: 'Best win streak', a: a.user ? a.head.bestStreak : null, b: b.user ? b.head.bestStreak : null, fmt: String, better: 'high' },
      { label: 'RSG PB · paceman', a: a.rsgPb?.finish ?? null, b: b.rsgPb?.finish ?? null, fmt: msToTime, better: 'low' }
    ]
  }, [a, b])
  const sampleOk = a.head.played >= SMALL_SAMPLE && b.head.played >= SMALL_SAMPLE

  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '80ms' }}>
      <h2 className="mb-3 font-display text-sm uppercase tracking-[0.16em] text-muted">Head to head</h2>
      <div className="space-y-0.5">
        {metrics.map((m) => {
          const comparable = m.a != null && m.b != null && m.a !== m.b && (!m.requireSample || sampleOk)
          const aWins = comparable && (m.better === 'high' ? (m.a as number) > (m.b as number) : (m.a as number) < (m.b as number))
          const bWins = comparable && !aWins
          return (
            <div
              key={m.label}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg px-3 py-2 odd:bg-white/[0.02]"
            >
              <span
                className="tnum font-display text-left text-sm"
                style={{ color: aWins ? A_COLOR : 'var(--muted)', textShadow: aWins ? `0 0 12px ${A_COLOR}55` : undefined }}
              >
                {m.a != null ? m.fmt(m.a) : '—'}
              </span>
              <span className="text-center text-[11px] uppercase tracking-[0.14em] text-faint">{m.label}</span>
              <span
                className="tnum font-display text-right text-sm"
                style={{ color: bWins ? B_COLOR : 'var(--muted)', textShadow: bWins ? `0 0 12px ${B_COLOR}55` : undefined }}
              >
                {m.b != null ? m.fmt(m.b) : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Both players' split-performance polygons on one radar (percentile vs the world baseline). */
function CompareRadar({ a, b }: { a: Side; b: Side }) {
  const data = useMemo(() => {
    const bByLabel = new Map(b.perfWorld.map((p) => [p.label, p]))
    return a.perfWorld
      .filter((p) => p.score != null && bByLabel.get(p.label)?.score != null)
      .map((p) => ({
        axis: p.label,
        a: p.score as number,
        b: bByLabel.get(p.label)!.score as number
      }))
  }, [a.perfWorld, b.perfWorld])
  const loading = a.settling || b.settling

  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '100ms' }}>
      <header className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">
          Split performance — vs the world
        </h2>
        <span className="text-xs text-faint">
          {a.details.length > 0 || b.details.length > 0
            ? `${a.details.length} vs ${b.details.length} matches analyzed · further out = faster`
            : 'further out = faster'}
        </span>
      </header>
      {data.length < 3 ? (
        <div className="grid h-[300px] place-items-center text-center text-sm text-muted">
          {loading ? 'Crunching both players' + '…' : 'Not enough shared split data to overlay yet.'}
        </div>
      ) : (
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="66%">
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis dataKey="axis" tick={{ fill: '#8b8b9e', fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar name={a.user?.nickname ?? 'A'} dataKey="a" stroke={A_COLOR} fill={A_COLOR} fillOpacity={0.22} isAnimationActive animationDuration={600} />
              <Radar name={b.user?.nickname ?? 'B'} dataKey="b" stroke={B_COLOR} fill={B_COLOR} fillOpacity={0.22} isAnimationActive animationDuration={600} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

/** Signed compact delta, seconds resolution. */
function fmtDelta(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Per-split average times side by side, gap colored toward whoever's faster.
 *  Sample counts ride along; gaps aren't called until both sides have >= 3 runs of that split. */
function SplitDeltas({ a, b }: { a: Side; b: Side }) {
  const rows = useMemo(() => {
    const bByKey = new Map(b.perfWorld.map((p) => [p.key, p]))
    return a.perfWorld
      .map((p) => {
        const other = bByKey.get(p.key)
        return {
          label: p.label,
          aMs: p.ms,
          bMs: other?.ms ?? null,
          aN: p.sample,
          bN: other?.sample ?? 0
        }
      })
      .filter((r) => r.aMs != null || r.bMs != null)
  }, [a.perfWorld, b.perfWorld])

  if (rows.length === 0) return null
  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '120ms' }}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">Average splits</h2>
        <span className="text-xs text-faint">gap to the faster player · ×N = runs counted</span>
      </header>
      <div className="space-y-0.5">
        {rows.map((r) => {
          const solid = r.aMs != null && r.bMs != null && r.aN >= 3 && r.bN >= 3
          const diff = solid ? (r.aMs as number) - (r.bMs as number) : null
          const aFaster = diff != null && diff < -1000
          const bFaster = diff != null && diff > 1000
          return (
            <div
              key={r.label}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg px-3 py-2 odd:bg-white/[0.02]"
            >
              <span
                className="tnum font-display text-left text-sm"
                style={{ color: aFaster ? A_COLOR : r.aMs != null ? 'var(--muted)' : 'var(--faint)' }}
              >
                {r.aMs != null ? msToTime(r.aMs) : '—'}
                {r.aMs != null && <span className="ml-1.5 text-[10px] text-faint">×{r.aN}</span>}
                {aFaster && diff != null && (
                  <span className="ml-2 text-xs" style={{ color: A_COLOR }}>
                    −{fmtDelta(diff)}
                  </span>
                )}
              </span>
              <span className="text-center text-[11px] uppercase tracking-[0.14em] text-faint">{r.label}</span>
              <span
                className="tnum font-display text-right text-sm"
                style={{ color: bFaster ? B_COLOR : r.bMs != null ? 'var(--muted)' : 'var(--faint)' }}
              >
                {bFaster && diff != null && (
                  <span className="mr-2 text-xs" style={{ color: B_COLOR }}>
                    −{fmtDelta(diff)}
                  </span>
                )}
                {r.bMs != null && <span className="mr-1.5 text-[10px] text-faint">×{r.bN}</span>}
                {r.bMs != null ? msToTime(r.bMs) : '—'}
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-faint">
        From each player's recent ranked matches. Gaps are only called when both sides have at
        least 3 runs of that split.
      </p>
    </section>
  )
}
