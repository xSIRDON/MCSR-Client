import { ipcMain, BrowserWindow, dialog } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'
import type { AppConfig, InstanceId, InstanceStatus, ProgressEvent } from '../shared/types'
import { store } from './store'
import * as auth from './auth/msmc-auth'
import * as gmll from './launcher/gmll-adapter'
import * as tracker from './paceman/tracker'
import {
  fetchPack,
  installPackFiles,
  fabricVersionString,
  RSG_EXCLUDE_PREFIXES,
  type ModrinthIndex
} from './instances/mrpack'
import { writeRankedConfigs, writeRsgConfigs } from './instances/configs'
import { paths } from './paths'

const states: Record<InstanceId, InstanceStatus> = {
  ranked: { id: 'ranked', state: 'not-installed' },
  rsg: { id: 'rsg', state: 'not-installed' }
}

function win(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function setState(id: InstanceId, patch: Partial<InstanceStatus>): void {
  states[id] = { ...states[id], ...patch }
  win()?.webContents.send(IPC.instStateChanged, states[id])
}

function sendProgress(e: ProgressEvent): void {
  win()?.webContents.send(IPC.instProgress, e)
}

function versionFile(id: InstanceId): string {
  return join(paths.instanceDir(id), '.obsidian-version')
}

function installedVersion(id: InstanceId): string | undefined {
  try {
    return existsSync(versionFile(id)) ? readFileSync(versionFile(id), 'utf8').trim() : undefined
  } catch {
    return undefined
  }
}

function hasMods(id: InstanceId): boolean {
  try {
    const dir = join(gmll.gameDir(id), 'mods')
    return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.jar'))
  } catch {
    return false
  }
}

/** Recompute persisted state at startup. */
function hydrateStates(): void {
  for (const id of ['ranked', 'rsg'] as InstanceId[]) {
    const v = installedVersion(id)
    if (v && hasMods(id)) setState(id, { state: 'ready', versionId: v })
  }
}

let cachedIndex: ModrinthIndex | null = null
async function getIndex(): Promise<ModrinthIndex> {
  if (!cachedIndex) cachedIndex = await fetchPack()
  return cachedIndex
}

async function installInstance(id: InstanceId): Promise<void> {
  setState(id, { state: 'installing', error: undefined })
  try {
    const index = await getIndex()
    const fabric = fabricVersionString(index)
    const gameDir = await gmll.installBase(id, fabric, sendProgress)

    sendProgress({ instance: id, phase: 'mods', fraction: 0, message: 'Installing mods…' })
    await installPackFiles(index, gameDir, {
      excludePrefixes: id === 'rsg' ? RSG_EXCLUDE_PREFIXES : [],
      seedQueueOverride: store.getConfig().seedQueueOverride,
      onProgress: (done, total, label) =>
        sendProgress({
          instance: id,
          phase: 'mods',
          fraction: total > 0 ? done / total : null,
          message: `Mods: ${label} (${done}/${total})`
        })
    })

    sendProgress({ instance: id, phase: 'configs', fraction: null, message: 'Writing configs…' })
    if (id === 'ranked') writeRankedConfigs(gameDir)
    else writeRsgConfigs(gameDir)

    mkdirSync(paths.instanceDir(id), { recursive: true })
    writeFileSync(versionFile(id), index.versionId, 'utf8')
    setState(id, { state: 'ready', versionId: index.versionId })
  } catch (e) {
    setState(id, { state: 'error', error: String(e instanceof Error ? e.message : e) })
    throw e
  }
}

async function launchInstance(id: InstanceId): Promise<void> {
  const token = auth.getLaunchToken()
  if (!token) throw new Error('Sign in with Microsoft before launching.')
  if (states[id].state !== 'ready') await installInstance(id)

  const index = await getIndex()
  const fabric = fabricVersionString(index)
  setState(id, { state: 'launching' })
  const child = await gmll.launch(id, token, fabric, sendProgress)
  setState(id, { state: 'running' })

  if (id === 'rsg') void tracker.start()

  child.on('close', () => {
    if (id === 'rsg') tracker.stop()
    setState(id, { state: 'ready' })
  })
}

export function registerIpc(): void {
  hydrateStates()
  tracker.onStatus((s) => win()?.webContents.send(IPC.paceStatusChanged, s))

  ipcMain.on(IPC.winMinimize, () => win()?.minimize())
  ipcMain.on(IPC.winClose, () => win()?.close())

  ipcMain.handle(IPC.authLogin, () => auth.login())
  ipcMain.handle(IPC.authRestore, () => auth.restore())
  ipcMain.handle(IPC.authLogout, () => auth.logout())

  ipcMain.handle(IPC.instStatus, (_e, id: InstanceId) => states[id])
  ipcMain.handle(IPC.instInstall, (_e, id: InstanceId) => installInstance(id))
  ipcMain.handle(IPC.instLaunch, (_e, id: InstanceId) => launchInstance(id))
  ipcMain.handle(IPC.instVerify, (_e, id: InstanceId) => installInstance(id))

  ipcMain.handle(IPC.paceSetKey, (_e, key: string) => tracker.setKey(key))
  ipcMain.handle(IPC.paceStatus, () => tracker.status())

  ipcMain.handle(IPC.cfgGet, () => store.getConfig())
  ipcMain.handle(IPC.cfgSet, (_e, patch: Partial<AppConfig>) => store.setConfig(patch))
  ipcMain.handle(IPC.cfgPickJar, async () => {
    const res = await dialog.showOpenDialog({
      title: 'Choose a SeedQueue jar',
      filters: [{ name: 'Jar', extensions: ['jar'] }],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const file = res.filePaths[0]
    store.setConfig({ seedQueueOverride: file })
    return file
  })
}
