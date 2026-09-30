import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeGcReport, parseGcLog, readGcReport, readLastSession, saveLastSession } from './gc-report'

// Line format captured from JDK 21's ZGC with -Xlog:gc (info level).
const LOG = [
  '[0.272s] GC(0) Garbage Collection (Warmup) 10M(16%)->4M(6%)',
  '[61.004s] Allocation Stall (main) 14.726ms',
  '[61.004s] Allocation Stall (Server thread #82500) 31.100ms',
  '[61.006s] Relocation Stall (main) 2.002ms',
  '[900.120s] Allocation Stall (main) 1455.850ms',
  '[900.200s] Relocation Stall (Worker-Main-3) 0.500ms',
  '[901.000s] GC(12) Garbage Collection (Allocation Rate) 9000M(88%)->2500M(24%)'
].join('\r\n')

describe('parseGcLog', () => {
  it('counts render-thread stalls as freezes and the rest as world-gen slowdowns', () => {
    expect(parseGcLog(LOG, 100)).toEqual({
      freezes: 3,
      worstFreezeMs: 1456,
      totalFreezeMs: 1473,
      otherStalls: 2,
      at: 100
    })
  })

  it('reports a clean session', () => {
    const r = parseGcLog('[0.272s] GC(0) Garbage Collection (Warmup) 10M(16%)->4M(6%)\n', 5)
    expect(r).toEqual({ freezes: 0, worstFreezeMs: null, totalFreezeMs: 0, otherStalls: 0, at: 5 })
  })

  it('ignores the periodic statistics table (its rows mention stalls but are not events)', () => {
    const table = '[356030.203s]    Critical: Allocation Stall     0.000 / 0.000   160.532 / 267.072 ms'
    expect(parseGcLog(table).freezes).toBe(0)
  })
})

describe('describeGcReport', () => {
  it('reads naturally', () => {
    expect(describeGcReport(parseGcLog(LOG))).toBe(
      '3 freezes waiting for memory (worst 1.46s); 2 slowdowns in world generation'
    )
    expect(describeGcReport(parseGcLog(''))).toBe('no freezes waiting for memory')
  })
})

describe('session report files', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcsr-gc-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads logs/gc.log from the game directory', () => {
    expect(readGcReport(dir)).toBeNull()
    mkdirSync(join(dir, 'logs'))
    writeFileSync(join(dir, 'logs', 'gc.log'), LOG)
    expect(readGcReport(dir)?.freezes).toBe(3)
  })

  it('round-trips the last session and rejects junk', () => {
    expect(readLastSession(dir)).toBeNull()
    const r = parseGcLog(LOG, 42)
    saveLastSession(dir, r)
    expect(readLastSession(dir)).toEqual(r)
    writeFileSync(join(dir, '.mcsr-last-session.json'), '{"freezes":"lots"}')
    expect(readLastSession(dir)).toBeNull()
  })
})
