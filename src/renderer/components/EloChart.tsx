import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts'
import { mcsr } from '../lib/clients'
import { signedElo } from '@core/format'

interface Point {
  i: number
  elo: number
  change: number | null
}

/**
 * Builds an ELO-over-time series from the player's recent ranked matches.
 * A match's `changes.eloRate` is the player's rating going INTO the game (verified:
 * eloRate + change of the newest match equals the live eloRate), so plot
 * eloRate + change — the post-match rating — or the whole chart lags one game
 * behind the player's actual Elo.
 */
export function EloChart({ uuid, season }: { uuid: string; season?: number | 'all' }) {
  const seasonNum = typeof season === 'number' ? season : undefined
  const { data: matches, isLoading } = useQuery({
    queryKey: seasonNum != null ? ['matches-chart', uuid, seasonNum] : ['matches-chart', uuid],
    queryFn: () => mcsr.getMatches(uuid, { type: 2, count: 50, season: seasonNum })
  })
  const title =
    season === 'all' ? 'Elo · recent' : seasonNum != null ? `Elo · season ${seasonNum}` : 'Elo · this season'

  const points = useMemo<Point[]>(() => {
    if (!matches) return []
    const ordered = [...matches].reverse() // oldest -> newest
    const pts: Point[] = []
    let i = 0
    for (const m of ordered) {
      const mine = m.changes?.find((c) => c.uuid === uuid)
      if (mine && mine.eloRate != null) {
        pts.push({ i: i++, elo: mine.eloRate + (mine.change ?? 0), change: mine.change ?? null })
      }
    }
    return pts
  }, [matches, uuid])

  const lo = points.length ? Math.min(...points.map((p) => p.elo)) : 0
  const hi = points.length ? Math.max(...points.map((p) => p.elo)) : 0
  const pad = Math.max(20, Math.round((hi - lo) * 0.18))

  return (
    <section className="surface p-5 animate-fade-up" style={{ animationDelay: '60ms' }}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-muted">{title}</h2>
        {points.length > 1 && (
          <span className="font-display text-sm" style={{ color: 'var(--gold)' }}>
            {points[points.length - 1].elo}
          </span>
        )}
      </header>

      {isLoading ? (
        <div className="skeleton h-[200px]" />
      ) : points.length < 2 ? (
        <div className="grid h-[200px] place-items-center text-sm text-muted">
          Not enough ranked matches yet to chart.
        </div>
      ) : (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="eloFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f5c842" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#f5c842" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis
                domain={[lo - pad, hi + pad]}
                tick={{ fill: '#8b8b9e', fontSize: 11 }}
                width={42}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<EloTooltip />} cursor={{ stroke: 'rgba(245,200,66,0.3)' }} />
              <Area
                type="monotone"
                dataKey="elo"
                stroke="#f5c842"
                strokeWidth={2}
                fill="url(#eloFill)"
                dot={false}
                activeDot={{ r: 4, fill: '#f5c842', stroke: '#0a0a10' }}
                isAnimationActive
                animationDuration={700}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

function EloTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Point }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const up = (p.change ?? 0) >= 0
  return (
    <div className="surface-2 px-3 py-2 text-xs">
      <div className="font-display text-text">{p.elo} elo</div>
      {p.change != null && (
        <div style={{ color: up ? 'var(--win)' : 'var(--loss)' }}>{signedElo(p.change)}</div>
      )}
    </div>
  )
}
