// Reads a game session's GC log and says whether the game froze waiting for memory.
//
// With ZGC, stop-the-world pauses are well under a millisecond (0.7 ms worst over a measured 4-day
// session), so a "freeze" is an *allocation stall*: a thread asks for memory faster than the
// concurrent collector frees it and has to wait. ZGC logs every one at info level on the gc tag,
// naming the thread that waited:
//
//   [123.456s] Allocation Stall (main) 14.726ms
//   [123.458s] Relocation Stall (Server thread #82500) 2.002ms
//
// In 1.16.1 the render thread is "main", so its stalls are what a player sees as the game (or the
// SeedQueue wall) freezing. Stalls on world-generation threads only slow resets down.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GcSessionReport } from '../../shared/types'
import { GC_LOG_FILE } from './jvm'

const STALL = /\b(?:Allocation|Relocation) Stall \((.+?)\) ([\d.]+)ms/
/** The render thread's name in Minecraft 1.16.1. */
const RENDER_THREAD = 'main'

export function parseGcLog(text: string, at = Math.floor(Date.now() / 1000)): GcSessionReport {
  let freezes = 0
  let totalFreezeMs = 0
  let worstFreezeMs: number | null = null
  let otherStalls = 0
  for (const line of text.split(/\r?\n/)) {
    const m = STALL.exec(line)
    if (!m) continue
    const ms = Number(m[2])
    if (!Number.isFinite(ms)) continue
    if (m[1] === RENDER_THREAD) {
      freezes++
      totalFreezeMs += ms
      if (worstFreezeMs === null || ms > worstFreezeMs) worstFreezeMs = ms
    } else {
      otherStalls++
    }
  }
  return {
    freezes,
    worstFreezeMs: worstFreezeMs === null ? null : Math.round(worstFreezeMs),
    totalFreezeMs: Math.round(totalFreezeMs),
    otherStalls,
    at
  }
}

/** The report for the session that just ended, or null when it ran without a GC log (G1/Java 8). */
export function readGcReport(gameDir: string): GcSessionReport | null {
  const file = join(gameDir, ...GC_LOG_FILE.split('/'))
  try {
    if (!existsSync(file)) return null
    return parseGcLog(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** One line for the console, e.g. "3 freezes waiting for memory (worst 1.2s) …". */
export function describeGcReport(r: GcSessionReport): string {
  const parts: string[] = []
  if (r.freezes === 0) parts.push('no freezes waiting for memory')
  else {
    const worst = r.worstFreezeMs === null ? '' : ` (worst ${(r.worstFreezeMs / 1000).toFixed(2)}s)`
    parts.push(`${r.freezes} freeze${r.freezes === 1 ? '' : 's'} waiting for memory${worst}`)
  }
  if (r.otherStalls > 0) {
    parts.push(`${r.otherStalls} slowdown${r.otherStalls === 1 ? '' : 's'} in world generation`)
  }
  return parts.join('; ')
}

const LAST_SESSION = '.mcsr-last-session.json'

export function saveLastSession(instanceDir: string, r: GcSessionReport): void {
  try {
    writeFileSync(join(instanceDir, LAST_SESSION), JSON.stringify(r), 'utf8')
  } catch {
    // diagnostics only — never fail a game exit over it
  }
}

export function readLastSession(instanceDir: string): GcSessionReport | null {
  try {
    const file = join(instanceDir, LAST_SESSION)
    if (!existsSync(file)) return null
    const r = JSON.parse(readFileSync(file, 'utf8')) as Partial<GcSessionReport>
    if (typeof r.freezes !== 'number' || typeof r.otherStalls !== 'number' || typeof r.at !== 'number') {
      return null
    }
    return {
      freezes: r.freezes,
      worstFreezeMs: typeof r.worstFreezeMs === 'number' ? r.worstFreezeMs : null,
      totalFreezeMs: typeof r.totalFreezeMs === 'number' ? r.totalFreezeMs : 0,
      otherStalls: r.otherStalls,
      at: r.at
    }
  } catch {
    return null
  }
}
