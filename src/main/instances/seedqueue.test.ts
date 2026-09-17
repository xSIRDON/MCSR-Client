import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  autoRamCeilingMb,
  planTune,
  readSeedQueue,
  recommendedRamMb,
  recommendedSeedQueue,
  seedQueueConfigPath,
  writeSeedQueue
} from './seedqueue'

describe('recommendedSeedQueue', () => {
  // Reference values from the MCSR tech-support bot's /sq-settings formula.
  it('matches the bot for 16 threads / 32 GB', () => {
    expect(recommendedSeedQueue(16, 32644)).toEqual({
      maxCapacity: 26,
      maxConcurrently: 3,
      maxConcurrentlyOnWall: 11
    })
  })

  it('matches the bot for 8 and 12 threads', () => {
    expect(recommendedSeedQueue(8, 16384)).toEqual({
      maxCapacity: 14,
      maxConcurrently: 1,
      maxConcurrentlyOnWall: 6
    })
    expect(recommendedSeedQueue(12, 32644)).toEqual({
      maxCapacity: 22,
      maxConcurrently: 2,
      maxConcurrentlyOnWall: 9
    })
  })

  it('shrinks the queue on a low-RAM machine', () => {
    expect(recommendedSeedQueue(4, 8192)).toEqual({
      maxCapacity: 3,
      maxConcurrently: 0,
      maxConcurrentlyOnWall: 2
    })
  })
})

describe('recommendedRamMb / autoRamCeilingMb', () => {
  it('sizes 2000 MB + 250 MB per seed, rounded up to 512 MB', () => {
    expect(recommendedRamMb(26)).toBe(8704)
    expect(recommendedRamMb(12)).toBe(5120)
    expect(recommendedRamMb(0)).toBe(2048)
  })

  it('caps auto RAM at what the machine can spare and the slider can show', () => {
    expect(autoRamCeilingMb(32644)).toBe(12288)
    expect(autoRamCeilingMb(16384)).toBe(10752)
    expect(autoRamCeilingMb(8192)).toBe(2560)
  })
})

describe('planTune', () => {
  it('brings an oversized wall down to the recommended ceiling and keeps ample RAM', () => {
    const plan = planTune(
      { maxCapacity: 30, maxConcurrently: 30, maxConcurrentlyOnWall: 30 },
      10240,
      16,
      32644
    )
    expect(plan.settings).toEqual({ maxCapacity: 26, maxConcurrently: 3, maxConcurrentlyOnWall: 11 })
    expect(plan.ramMb).toBe(10240)
    expect(plan.changes).toHaveLength(3)
  })

  it('leaves settings under the ceiling alone', () => {
    const current = { maxCapacity: 9, maxConcurrently: 2, maxConcurrentlyOnWall: 8 }
    const plan = planTune(current, 6144, 16, 32644)
    expect(plan.settings).toEqual(current)
    expect(plan.ramMb).toBe(6144)
    expect(plan.changes).toEqual([])
  })

  it('raises RAM to fit the queue when the machine has room', () => {
    const plan = planTune({ maxCapacity: 12, maxConcurrently: 3, maxConcurrentlyOnWall: 4 }, 3072, 16, 16384)
    expect(plan.ramMb).toBe(5120)
    expect(plan.settings.maxCapacity).toBe(12)
    expect(plan.changes).toEqual(['RAM 3072 → 5120 MB'])
  })

  it('shrinks the queue when RAM can’t grow enough', () => {
    const plan = planTune({ maxCapacity: 12, maxConcurrently: 1, maxConcurrentlyOnWall: 6 }, 2048, 8, 8192)
    expect(plan.ramMb).toBe(2560)
    expect(plan.settings).toEqual({ maxCapacity: 2, maxConcurrently: 1, maxConcurrentlyOnWall: 3 })
  })

  it('never lowers RAM the player chose', () => {
    const plan = planTune({ maxCapacity: 4, maxConcurrently: 1, maxConcurrentlyOnWall: 4 }, 12288, 16, 32644)
    expect(plan.ramMb).toBe(12288)
  })
})

describe('readSeedQueue / writeSeedQueue', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcsr-sq-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns null without a config', () => {
    expect(readSeedQueue(dir)).toBeNull()
  })

  it('round-trips the sizing fields and keeps everything else', () => {
    const file = seedQueueConfigPath(dir)
    mkdirSync(join(dir, 'config', 'mcsr'), { recursive: true })
    const original = {
      '.apiVersion': '2.2+1.16-1.16.1',
      maxCapacity: 30,
      maxConcurrently: 30,
      maxConcurrently_onWall: 30,
      rows: 5,
      keyBindings: { 'seedqueue.key.play': 'key.keyboard.r' }
    }
    writeFileSync(file, JSON.stringify(original, null, 2))
    expect(readSeedQueue(dir)).toEqual({ maxCapacity: 30, maxConcurrently: 30, maxConcurrentlyOnWall: 30 })

    writeSeedQueue(dir, { maxCapacity: 26, maxConcurrently: 3, maxConcurrentlyOnWall: 11 })
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    expect(saved).toEqual({ ...original, maxCapacity: 26, maxConcurrently: 3, maxConcurrently_onWall: 11 })
    expect(Object.keys(saved)).toEqual(Object.keys(original))
  })

  it('ignores a config with missing or non-numeric sizing fields', () => {
    mkdirSync(join(dir, 'config', 'mcsr'), { recursive: true })
    writeFileSync(seedQueueConfigPath(dir), JSON.stringify({ maxCapacity: '30' }))
    expect(readSeedQueue(dir)).toBeNull()
  })
})
