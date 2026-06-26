import { init, config, Instance } from 'gmll'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '../paths'
import { store } from '../store'
import { removeLinkIfPresent } from './links'
import type { InstanceId, ProgressEvent } from '../../shared/types'

let initialised = false
let progressSink: ((e: ProgressEvent) => void) | null = null
let activePhaseInstance: InstanceId = 'ranked'

function emit(e: ProgressEvent): void {
  progressSink?.(e)
}

export async function ensureCore(onProgress?: (e: ProgressEvent) => void): Promise<void> {
  if (onProgress) progressSink = onProgress
  if (initialised) return
  mkdirSync(paths.shared(), { recursive: true })
  mkdirSync(paths.instances(), { recursive: true })
  config.setRoot(paths.shared())
  config.setInstances(paths.instances())
  config.setLauncherName('MCSR Client')

  try {
    const ev = config.getEventListener()
    ev.on('download.progress', (_key: string, index: number, total: number) => {
      emit({
        instance: activePhaseInstance,
        phase: 'assets',
        fraction: total > 0 ? index / total : null,
        message: `Downloading files (${index}/${total})`
      })
    })
    ev.on('download.setup', () => {
      emit({ instance: activePhaseInstance, phase: 'client', fraction: null, message: 'Preparing download…' })
    })
  } catch {
  }

  await init()
  initialised = true
}

function clearSharedLinks(id: InstanceId): void {
  removeLinkIfPresent(join(paths.instanceDir(id), 'libraries'))
  removeLinkIfPresent(join(paths.instanceDir(id), 'assets'))
}

const FABRIC_VERSION_FALLBACK = 'fabric-loader-0.19.2-1.16.1'

export function makeInstance(id: InstanceId, fabricVersion = FABRIC_VERSION_FALLBACK): Instance {
  const cfg = store.getConfig()
  const inst = new Instance({
    name: id,
    version: fabricVersion,
    path: paths.instanceDir(id),
    ram: Math.max(1, Math.round(cfg.ram[id] / 1024))
  })
  inst.javaPath = cfg.java[id] ?? 'default'
  return inst
}

export function gameDir(id: InstanceId): string {
  return makeInstance(id).getDir().path?.join?.('/') ?? paths.instanceDir(id)
}

export async function installBase(
  id: InstanceId,
  fabricVersion: string,
  onProgress?: (e: ProgressEvent) => void
): Promise<string> {
  await ensureCore(onProgress)
  if (onProgress) progressSink = onProgress
  activePhaseInstance = id
  clearSharedLinks(id)
  emit({ instance: id, phase: 'fabric', fraction: null, message: 'Installing Minecraft 1.16.1 + Fabric…' })
  const inst = makeInstance(id, fabricVersion)
  await inst.install()
  return inst.getDir().path?.join?.('/') ?? paths.instanceDir(id)
}

export async function launch(
  id: InstanceId,
  token: unknown,
  fabricVersion: string,
  onProgress?: (e: ProgressEvent) => void
): Promise<ChildProcessWithoutNullStreams> {
  await ensureCore(onProgress)
  activePhaseInstance = id
  clearSharedLinks(id)
  emit({ instance: id, phase: 'launch', fraction: null, message: 'Launching…' })
  const inst = makeInstance(id, fabricVersion)
  return inst.launch(token as never)
}
