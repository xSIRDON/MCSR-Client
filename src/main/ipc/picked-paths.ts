import type { AppConfig, InstanceId } from '../../shared/types'
import { store } from '../store'

const pickedPaths = new Set<string>()

export function picked(path: string): string {
  pickedPaths.add(path)
  return path
}

export function assertPicked(path: unknown): string {
  if (typeof path !== 'string' || !pickedPaths.has(path)) {
    throw new Error('Choose that folder again with Browse.')
  }
  return path
}

export function guardConfigPatch(patch: Partial<AppConfig>): Partial<AppConfig> {
  const cur = store.getConfig()
  const out: Partial<AppConfig> = { ...patch }
  if (patch.java) {
    const java = { ...cur.java }
    for (const id of Object.keys(java) as InstanceId[]) {
      const v = patch.java[id]
      if (v === null || (typeof v === 'string' && (v === cur.java[id] || pickedPaths.has(v)))) java[id] = v
    }
    out.java = java
  }
  if ('seedQueueOverride' in patch && patch.seedQueueOverride !== null) delete out.seedQueueOverride
  return out
}
