// SeedQueue sizing. Oversized SeedQueue settings are the other half of wall lag (the first is the
// garbage collector — see launcher/jvm.ts):
//  - Generating more seeds at once than the CPU can run just makes worlds fight the render thread
//    for cores. SeedQueue's docs cap it at the logical processor count; the MCSR tech-support bot
//    recommends well under that.
//  - Each queued seed holds ~250 MB of heap. The MCSR Java guide sizes the heap at 2000 MB plus
//    250 MB per queued seed; a smaller heap keeps the collector running flat out.
// recommendedSeedQueue is the bot's sizing formula (maskers.xyz/sq-settings). planTune uses it as
// a ceiling before an RSG/ZSG launch: values above it come down, values below it are left alone.
// RAM is raised to fit the queue when the machine has room, and the queue shrinks when it doesn't.
// RAM the player chose is never lowered.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SeedQueueSizing } from '../../shared/types'

export const BASE_HEAP_MB = 2000
export const HEAP_PER_SEED_MB = 250
/** The speedrun rules' limit on Max Queued Seeds. */
export const MAX_QUEUED = 30
/** The Memory slider's step and top end; auto-tuning stays on values the slider can show. */
export const RAM_STEP_MB = 512
export const MAX_RAM_MB = 12288
/** What the bot sets aside for Windows itself and for everything else running (OBS, a browser). */
const OS_RESERVED_MB = 3200
const OTHER_APPS_MB = 2000

export interface TunePlan {
  settings: SeedQueueSizing
  ramMb: number
  /** Human-readable notes for the launch log; empty when nothing needed changing. */
  changes: string[]
}

export function seedQueueConfigPath(gameDir: string): string {
  return join(gameDir, 'config', 'mcsr', 'seedqueue.json')
}

/** Heap for a queue of `maxCapacity` seeds, rounded up to the slider's step. */
export function recommendedRamMb(maxCapacity: number): number {
  const need = BASE_HEAP_MB + HEAP_PER_SEED_MB * Math.max(0, maxCapacity)
  return Math.ceil(need / RAM_STEP_MB) * RAM_STEP_MB
}

/** The most RAM auto-tuning will give the game: what the bot considers free, within the slider. */
export function autoRamCeilingMb(totalMemMb: number): number {
  const free = totalMemMb - OS_RESERVED_MB - OTHER_APPS_MB
  const stepped = Math.floor(free / RAM_STEP_MB) * RAM_STEP_MB
  return Math.max(RAM_STEP_MB, Math.min(MAX_RAM_MB, stepped))
}

/** The MCSR tech-support bot's SeedQueue sizing for a Windows machine. */
export function recommendedSeedQueue(cpuThreads: number, totalMemMb: number): SeedQueueSizing {
  const threads = Math.max(1, Math.floor(cpuThreads))
  const free = totalMemMb - OS_RESERVED_MB - OTHER_APPS_MB
  let queued = Math.min(MAX_QUEUED, Math.max(1, Math.floor((free - BASE_HEAP_MB) / HEAP_PER_SEED_MB)))

  let wall = threads - 2
  if (wall > 32) wall *= 0.6
  else if (wall > 8) wall = 4 * (Math.sqrt(wall + 1) - 1)
  wall = Math.min(queued, Math.max(1, Math.floor(wall)))

  queued = Math.min(queued, Math.round(Math.max(wall * 2.4, 6)))
  const inWorld = Math.min(queued, Math.floor(threads / 5))
  return { maxCapacity: queued, maxConcurrently: inWorld, maxConcurrentlyOnWall: wall }
}

export function planTune(
  current: SeedQueueSizing,
  ramMb: number,
  cpuThreads: number,
  totalMemMb: number
): TunePlan {
  const rec = recommendedSeedQueue(cpuThreads, totalMemMb)
  const settings = { ...current }
  const changes: string[] = []

  const cap = (key: keyof SeedQueueSizing, label: string): void => {
    if (settings[key] > rec[key]) {
      changes.push(`${label} ${settings[key]} → ${rec[key]}`)
      settings[key] = rec[key]
    }
  }
  cap('maxCapacity', 'queued seeds')
  cap('maxConcurrentlyOnWall', 'seeds generating on the wall')
  cap('maxConcurrently', 'seeds generating in a world')

  let ram = ramMb
  const need = recommendedRamMb(settings.maxCapacity)
  if (ram < need) {
    const ceiling = autoRamCeilingMb(totalMemMb)
    ram = need <= ceiling ? need : Math.max(ram, ceiling)
    const fits = Math.max(1, Math.floor((ram - BASE_HEAP_MB) / HEAP_PER_SEED_MB))
    if (fits < settings.maxCapacity) {
      changes.push(`queued seeds ${settings.maxCapacity} → ${fits} (to fit ${ram} MB)`)
      settings.maxCapacity = fits
    }
    if (ram !== ramMb) changes.push(`RAM ${ramMb} → ${ram} MB`)
  }

  return { settings, ramMb: ram, changes }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** The sizing fields of an instance's seedqueue.json, or null if there's no readable config yet. */
export function readSeedQueue(gameDir: string): SeedQueueSizing | null {
  const raw = readRaw(gameDir)
  if (!raw) return null
  const maxCapacity = num(raw.maxCapacity)
  const maxConcurrently = num(raw.maxConcurrently)
  const maxConcurrentlyOnWall = num(raw.maxConcurrently_onWall)
  if (maxCapacity === null || maxConcurrently === null || maxConcurrentlyOnWall === null) return null
  return { maxCapacity, maxConcurrently, maxConcurrentlyOnWall }
}

/** Write the sizing fields back, keeping every other key (and SpeedrunAPI's layout) as it was. */
export function writeSeedQueue(gameDir: string, settings: SeedQueueSizing): void {
  const raw = readRaw(gameDir)
  if (!raw) return
  raw.maxCapacity = settings.maxCapacity
  raw.maxConcurrently = settings.maxConcurrently
  raw.maxConcurrently_onWall = settings.maxConcurrentlyOnWall
  writeFileSync(seedQueueConfigPath(gameDir), JSON.stringify(raw, null, 2), 'utf8')
}

function readRaw(gameDir: string): Record<string, unknown> | null {
  const file = seedQueueConfigPath(gameDir)
  try {
    if (!existsSync(file)) return null
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}
