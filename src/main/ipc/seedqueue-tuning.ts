import { availableParallelism, totalmem } from 'node:os'
import type { InstanceId, SeedQueueInfo } from '../../shared/types'
import * as gmll from '../launcher/gmll-adapter'
import { readLastSession } from '../launcher/gc-report'
import {
  planTune,
  readSeedQueue,
  recommendedRamMb,
  recommendedSeedQueue,
  suggestLowerRam,
  writeSeedQueue
} from '../instances/seedqueue'
import { paths } from '../paths'
import { store } from '../store'

const SEEDQUEUE_INSTANCES: readonly InstanceId[] = ['rsg', 'zsg']

function machine(): { threads: number; memMb: number } {
  return { threads: availableParallelism(), memMb: Math.round(totalmem() / 1048576) }
}

export function seedQueueInfo(id: InstanceId): SeedQueueInfo | null {
  if (!SEEDQUEUE_INSTANCES.includes(id)) return null
  const current = readSeedQueue(gmll.gameDir(id))
  if (!current) return null
  const { threads, memMb } = machine()
  return {
    current,
    recommended: recommendedSeedQueue(threads, memMb),
    ramMb: store.getConfig().ram[id],
    neededRamMb: recommendedRamMb(current.maxCapacity),
    cpuThreads: threads,
    totalMemMb: memMb,
    lowerRamTo: suggestLowerRam(store.getConfig().ram[id], recommendedRamMb(current.maxCapacity), memMb),
    lastSession: readLastSession(paths.instanceDir(id))
  }
}

export function tuneSeedQueue(id: InstanceId): string[] {
  if (!SEEDQUEUE_INSTANCES.includes(id)) return []
  const gameDir = gmll.gameDir(id)
  const current = readSeedQueue(gameDir)
  if (!current) return []
  const cfg = store.getConfig()
  const { threads, memMb } = machine()
  const plan = planTune(current, cfg.ram[id], threads, memMb)
  const s = plan.settings
  if (
    s.maxCapacity !== current.maxCapacity ||
    s.maxConcurrently !== current.maxConcurrently ||
    s.maxConcurrentlyOnWall !== current.maxConcurrentlyOnWall
  ) {
    writeSeedQueue(gameDir, s)
  }
  if (plan.ramMb !== cfg.ram[id]) store.setConfig({ ram: { ...cfg.ram, [id]: plan.ramMb } })
  return plan.changes
}
