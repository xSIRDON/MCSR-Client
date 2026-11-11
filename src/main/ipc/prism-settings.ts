import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { INSTANCE_IDS, type InstanceId } from '../../shared/types'
import { paths } from '../paths'
import { store } from '../store'
import { logFailure } from '../log'
import * as gmll from '../launcher/gmll-adapter'
import { preparePrismInstance, prismSessionActive } from '../launcher/prism-instance'
import { createKeyedQueue } from '../keyed-queue'
import { fabricVersionString } from '../instances/mrpack'
import { BUSY_STATES, installedVersion, states } from './instance-state'
import { getIndex } from './pack-index'

const queue = createKeyedQueue<InstanceId>([...INSTANCE_IDS])
export const prismRoot = (id: InstanceId): string => join(paths.root(), 'prism', id)

function busy(id: InstanceId, installing: boolean): boolean {
  return prismSessionActive(prismRoot(id)) ||
    (BUSY_STATES.includes(states[id].state) && !(installing && states[id].state === 'installing'))
}

async function runtimeVersion(id: InstanceId): Promise<string> {
  const pack = join(prismRoot(id), 'instances', id, 'mmc-pack.json')
  if (existsSync(pack)) {
    const data = JSON.parse(readFileSync(pack, 'utf8')) as { components: { uid: string; version: string }[] }
    const mc = data.components.find(c => c.uid === 'net.minecraft')?.version
    const loader = data.components.find(c => c.uid === 'net.fabricmc.fabric-loader')?.version
    if (mc && loader) return `fabric-loader-${loader}-${mc}`
  }
  return fabricVersionString(await getIndex())
}

export function syncPrismInstance(id: InstanceId, fabric?: string, installing = false): Promise<void> {
  return queue.run(id, async () => {
    if (!installedVersion(id) || busy(id, installing)) return
    const version = /^fabric-loader-([\d.]+)-([\d.]+)$/.exec(fabric ?? await runtimeVersion(id))
    if (!version) throw new Error('Invalid Minecraft/Fabric version for Prism.')
    const jvm = await gmll.prismJvm(id)
    if (!installedVersion(id) || busy(id, installing)) return
    preparePrismInstance(prismRoot(id), id, gmll.gameDir(id), {
      name: `MCSR ${id.toUpperCase()}`, loader: version[1], minecraft: version[2], ramMb: store.getConfig().ram[id]
    }, jvm.java, jvm.args)
  })
}

export async function syncInstalledPrism(): Promise<void> {
  for (const id of INSTANCE_IDS) {
    if (!installedVersion(id)) continue
    try { await syncPrismInstance(id) } catch (error) {
      logFailure(`Could not sync ${id} with Prism; will retry on next launch`, error)
    }
  }
}

export function syncPrismAfterClose(id: InstanceId): void {
  void syncPrismInstance(id).catch(error => logFailure(`Could not sync ${id} with Prism`, error))
}
