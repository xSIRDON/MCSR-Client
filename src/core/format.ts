// Pure formatting helpers for times, ELO deltas, dates, and win rates.

/** Milliseconds -> "m:ss.mmm" (or "h:mm:ss.mmm" past an hour). */
export function msToTime(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms) || ms < 0) return '—'
  const totalMs = Math.floor(ms)
  const h = Math.floor(totalMs / 3_600_000)
  const m = Math.floor((totalMs % 3_600_000) / 60_000)
  const s = Math.floor((totalMs % 60_000) / 1000)
  const millis = totalMs % 1000
  const ss = String(s).padStart(2, '0')
  const mmm = String(millis).padStart(3, '0')
  if (h > 0) {
    const mm = String(m).padStart(2, '0')
    return `${h}:${mm}:${ss}.${mmm}`
  }
  return `${m}:${ss}.${mmm}`
}

/** Signed ELO delta, using a true minus sign for negatives. */
export function signedElo(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  if (n > 0) return `+${n}`
  if (n < 0) return `−${Math.abs(n)}`
  return '0'
}

/** Epoch SECONDS -> relative "3h ago" string. */
export function epochToAgo(epochSec: number | null | undefined, nowSec?: number): string {
  if (epochSec == null || Number.isNaN(epochSec)) return '—'
  const now = nowSec ?? Math.floor(Date.now() / 1000)
  const diff = Math.max(0, now - epochSec)
  if (diff < 60) return 'just now'
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

/** Win rate as a 0..100 number (1 decimal), guarding divide-by-zero. */
export function winRate(wins: number, loses: number): number {
  const total = wins + loses
  if (total <= 0) return 0
  return Math.round((wins / total) * 1000) / 10
}
