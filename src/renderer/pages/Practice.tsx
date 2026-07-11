// "Practice" — GapCheck-style: browse a top runner's fastest recent seeds, copy one into a
// private-room Set Seed, play it, and see your split-by-split gap against their run. The seed load
// stays manual (MCSR has no API for it), so this surfaces the seed + coaches the gap.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useUi } from '../store/uiStore'
import { mcsr } from '../lib/clients'
import { msToTime, epochToAgo } from '@core/format'
import { analyzeSplits, buildSplitGap, seedStructureLabel } from '@core/ranked-analytics'
import { usePlayerAnalytics } from '../hooks/usePlayerAnalytics'
import { usePractice } from '../hooks/usePractice'
import type { PracticeSeed } from '../hooks/usePractice'
import { PlayerAutocomplete } from '../components/PlayerAutocomplete'
import { PlayerHead } from '../components/PlayerHead'

/** Compact signed gap: "+15s", "-8s", "+1:23". */
function fmtGap(ms: number): string {
  const sec = Math.round(ms / 1000)
  const sign = sec < 0 ? '−' : '+'
  const a = Math.abs(sec)
  return a >= 60 ? `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}` : `${sign}${a}s`
}

export function Practice() {
  const profile = useUi((s) => s.profile)

  const { data: lb } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => mcsr.getLeaderboard(),
    staleTime: 10 * 60_000
  })
  const top = lb?.users?.slice(0, 5) ?? []

  // Default to the #1 runner until you pick someone else.
  const [picked, setPicked] = useState<string | null>(null)
  const runnerName = picked ?? top[0]?.nickname ?? ''

  const { data: runner } = useQuery({
    queryKey: ['user', runnerName],
    queryFn: () => mcsr.getUser(runnerName),
    enabled: !!runnerName
  })

  // Your own average splits, to diff each seed against.
  const mine = usePlayerAnalytics(profile?.uuid)
  const mySplits = useMemo(
    () => analyzeSplits(profile?.uuid ?? '', mine.details),
    [profile?.uuid, mine.details]
  )

  const { seeds, loading, empty } = usePractice(runner?.uuid)

  return (
    <div className="mx-auto max-w-[980px] space-y-4 px-5 py-4">
      <header className="animate-fade-up">
        <div className="text-[11px] uppercase tracking-[0.22em] text-faint">Practice</div>
        <h1 className="font-display text-2xl tracking-wide text-text">Learn from the best</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Pick a top runner, copy one of their seeds into a private room (Set Seed), play it out —
          then see exactly where you lose time, split by split.
        </p>
      </header>

      {/* Runner picker */}
      <section className="surface p-4 animate-fade-up" style={{ animationDelay: '40ms' }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            {runner && <PlayerHead id={runner.uuid} uuid={runner.uuid} size={34} className="rounded-lg" />}
            <div className="leading-tight">
              <div className="text-sm font-medium text-text">{runner?.nickname ?? '…'}</div>
              <div className="text-xs text-faint">Practicing their seeds</div>
            </div>
          </div>
          <div className="ml-auto w-full max-w-[240px]">
            <PlayerAutocomplete
              value={picked ?? ''}
              onChange={(v) => setPicked(v)}
              onSubmit={(name) => setPicked(name.trim())}
              placeholder="Practice another runner…"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-3 py-1.5 text-xs text-text outline-none transition-colors placeholder:text-faint focus:border-[var(--gold)]/40"
            />
          </div>
        </div>
        {top.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-faint">Top runners:</span>
            {top.map((u, i) => (
              <button
                key={u.uuid}
                onClick={() => setPicked(u.nickname)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                  u.nickname === runnerName
                    ? 'border-[var(--gold)]/50 bg-[var(--gold)]/12 text-[var(--gold)]'
                    : 'border-[var(--line)] text-muted hover:text-text'
                }`}
              >
                #{i + 1} {u.nickname}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Seeds */}
      {!profile ? null : loading ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(360px,1fr))]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-56" />
          ))}
        </div>
      ) : empty || seeds.length === 0 ? (
        <div className="surface grid h-40 place-items-center text-center text-sm text-muted">
          No recent completed seeds for {runner?.nickname ?? 'this runner'} — try another top runner.
        </div>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(360px,1fr))]">
          {seeds.map((seed, i) => (
            <SeedCard
              key={seed.matchId}
              seed={seed}
              mySplits={mySplits}
              runnerName={runner?.nickname ?? 'Runner'}
              delay={i * 40}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SeedCard({
  seed,
  mySplits,
  runnerName,
  delay
}: {
  seed: PracticeSeed
  mySplits: ReturnType<typeof analyzeSplits>
  runnerName: string
  delay: number
}) {
  const [copied, setCopied] = useState(false)
  const gap = useMemo(() => buildSplitGap(seed.splits, mySplits), [seed.splits, mySplits])
  const finishRow = gap.find((r) => r.key === 'finish')

  async function copySeed(): Promise<void> {
    if (!seed.seedId) return
    try {
      await navigator.clipboard.writeText(seed.seedId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked — the id is still shown on the card */
    }
  }

  return (
    <section
      className="surface flex flex-col p-4 animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-2xl tnum text-[var(--gold)]">{msToTime(seed.finishMs)}</div>
          <div className="text-[11px] text-faint">
            {runnerName}
            {seed.date ? ` · ${epochToAgo(seed.date)}` : ''}
          </div>
        </div>
        {finishRow?.delta != null && (
          <div
            className="rounded-lg px-2 py-1 text-right text-xs"
            style={{
              background: finishRow.delta > 0 ? 'rgba(255,90,90,0.12)' : 'rgba(74,255,140,0.12)',
              color: finishRow.delta > 0 ? 'var(--loss)' : 'var(--win)'
            }}
          >
            <div className="font-display tnum text-sm">{fmtGap(finishRow.delta)}</div>
            <div className="text-[10px] opacity-80">{finishRow.delta > 0 ? 'behind' : 'ahead'}</div>
          </div>
        )}
      </header>

      {/* Seed structure */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip>{seedStructureLabel(seed.overworld)}</Chip>
        <Chip>{seedStructureLabel(seed.nether)}</Chip>
        {seed.endTowers.length > 0 && <Chip>Towers {seed.endTowers.join('/')}</Chip>}
      </div>

      {/* Copy seed */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => void copySeed()}
          disabled={!seed.seedId}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-3 py-1.5 text-xs font-medium text-[var(--gold)] transition-all hover:bg-[var(--gold)]/20 disabled:opacity-40"
        >
          {copied ? 'Copied ✓' : 'Copy seed'}
        </button>
        <code className="min-w-0 flex-1 truncate rounded-md bg-black/25 px-2 py-1 text-[11px] text-faint">
          {seed.seedId ?? 'no seed id'}
        </code>
      </div>

      {/* Gap table */}
      <div className="mt-3 border-t border-[var(--line)] pt-2">
        <div className="mb-1 grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 text-[10px] uppercase tracking-wider text-faint">
          <span>Split</span>
          <span className="text-right">Them</span>
          <span className="text-right">You</span>
          <span className="text-right">Gap</span>
        </div>
        <ul className="space-y-0.5">
          {gap
            .filter((r) => r.runnerMs != null)
            .map((r) => (
              <li key={r.key} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 text-xs">
                <span className="truncate text-muted">{r.label}</span>
                <span className="tnum text-right text-text">{msToTime(r.runnerMs)}</span>
                <span className="tnum text-right text-faint">{msToTime(r.youMs)}</span>
                <span
                  className="tnum text-right"
                  style={{ color: r.delta == null ? 'var(--faint)' : r.delta > 0 ? 'var(--loss)' : 'var(--win)' }}
                >
                  {r.delta == null ? '—' : fmtGap(r.delta)}
                </span>
              </li>
            ))}
        </ul>
      </div>
    </section>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--line)] bg-[var(--bg-2)] px-2 py-0.5 text-[11px] text-muted">
      {children}
    </span>
  )
}
