import { BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc'
import { INSTANCE_IDS, isInstanceId, type InstanceId, type InstanceStatus, type ProgressEvent } from '../../shared/types'
import * as auth from '../auth/msmc-auth'
import * as gmll from '../launcher/gmll-adapter'
import { pushLog } from '../log'
import { paths } from '../paths'

export const states: Record<InstanceId, InstanceStatus> = {
  ranked: { id: 'ranked', state: 'not-installed' },
  rsg: { id: 'rsg', state: 'not-installed' },
  zsg: { id: 'zsg', state: 'not-installed' }
}

export const BUSY_STATES = ['installing', 'launching', 'running']

export function assertInstanceId(id: unknown): InstanceId {
  if (!isInstanceId(id)) throw new Error('Unknown instance.')
  return id
}

export function win(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

export function setState(id: InstanceId, patch: Partial<InstanceStatus>): void {
  states[id] = { ...states[id], ...patch }
  win()?.webContents.send(IPC.instStateChanged, states[id])
}

export function sendProgress(e: ProgressEvent): void {
  win()?.webContents.send(IPC.instProgress, e)
  pushLog('system', `[${e.instance}] ${e.message}`)
}

export function launchSecrets(): string[] {
  const t = auth.getLaunchToken() as { access_token?: string; profile?: { id?: string } } | null
  return [t?.access_token ?? '', t?.profile?.id ?? '']
}

function versionFile(id: InstanceId): string {
  return join(paths.instanceDir(id), '.mcsr-version')
}

export function installedVersion(id: InstanceId): string | undefined {
  try {
    if (existsSync(versionFile(id))) return readFileSync(versionFile(id), 'utf8').trim()
    return undefined
  } catch {
    return undefined
  }
}

export function writeInstalledVersion(id: InstanceId, versionId: string): void {
  mkdirSync(paths.instanceDir(id), { recursive: true })
  writeFileSync(versionFile(id), versionId, 'utf8')
}

function hasMods(id: InstanceId): boolean {
  try {
    const dir = join(gmll.gameDir(id), 'mods')
    return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.jar'))
  } catch {
    return false
  }
}

export function hydrateStates(): void {
  for (const id of INSTANCE_IDS) {
    const v = installedVersion(id)
    if (v && hasMods(id)) setState(id, { state: 'ready', versionId: v })
  }
}

export function isGameRunning(): boolean {
  return INSTANCE_IDS.some((id) => states[id]?.state === 'running' || states[id]?.state === 'launching')
}
