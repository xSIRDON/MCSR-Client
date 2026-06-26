import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'
import type {
  AppConfig,
  InstanceId,
  InstanceStatus,
  ProgressEvent,
  StandardSettings
} from '../shared/types'
import { store } from './store'
import * as auth from './auth/msmc-auth'
import * as gmll from './launcher/gmll-adapter'
import * as tracker from './paceman/tracker'
import {
  fetchPack,
  installPackFiles,
  installLatestRankedMod,
  fabricVersionString,
  RSG_EXCLUDE_PREFIXES,
  type ModrinthIndex
} from './instances/mrpack'
import { writeRankedConfigs, writeRsgConfigs } from './instances/configs'
import { syncMaps } from './instances/maps'
import { listMods, setModEnabled } from './instances/mods'
import { readStandardSettings, writeStandardSettings, importOptionsFile } from './instances/standard-settings'
import { copyInstanceSettings, resolveGameDir, listWorlds } from './instances/copy-instance'
import { getSkin } from './skins'
import { checkForUpdates, currentUpdateStatus, quitAndInstall } from './updater'
import { setupNinjabrain, launchNinjabrain, killNinjabrain } from './tools/ninjabrain'
import { ensureToolscreenJar, spawnToolscreenWatcher } from './tools/toolscreen'
import { detectJava } from './system/java'
import { removeLinkIfPresent } from './launcher/links'
import { pushLog, onLog, logHistory, clearLog } from './log'
import { paths } from './paths'

const states: Record<InstanceId, InstanceStatus> = {
  ranked: { id: 'ranked', state: 'not-installed' },
  rsg: { id: 'rsg', state: 'not-installed' },
  zsg: { id: 'zsg', state: 'not-installed' }
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
  pushLog('system', `[${e.instance}] ${e.message}`)
}

// syncMaps mutates saves/ and a manifest non-atomically, so concurrent runs for the
// same instance would race. Serialize per instance: each call waits for the prior.
const syncChains: Record<InstanceId, Promise<unknown>> = {
  ranked: Promise.resolve(),
  rsg: Promise.resolve(),
  zsg: Promise.resolve()
}

function runSyncMaps(id: InstanceId, label: string): Promise<void> {
  const run = syncChains[id].then(() =>
    syncMaps(join(gmll.gameDir(id), 'saves'), store.getConfig().maps[id], (done, total, lbl) =>
      sendProgress({
        instance: id,
        phase: 'configs',
        fraction: total > 0 ? done / total : null,
        message: `${label}: ${lbl} (${done}/${total})`
      })
    )
  )
  syncChains[id] = run.catch(() => undefined) // keep the chain alive past failures
  return run
}

function versionFile(id: InstanceId): string {
  return join(paths.instanceDir(id), '.mcsr-version')
}

function installedVersion(id: InstanceId): string | undefined {
  try {
    if (existsSync(versionFile(id))) return readFileSync(versionFile(id), 'utf8').trim()
    return undefined
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
  for (const id of ['ranked', 'rsg', 'zsg'] as InstanceId[]) {
    const v = installedVersion(id)
    if (v && hasMods(id)) setState(id, { state: 'ready', versionId: v })
  }
}

let cachedIndex: ModrinthIndex | null = null
async function getIndex(): Promise<ModrinthIndex> {
  if (!cachedIndex) cachedIndex = await fetchPack()
  return cachedIndex
}

/** Drop the bundled SeedQueue wall resource packs into RSG/ZSG. Idempotent. */
function ensureWalls(gameDir: string): void {
  try {
    const wallsDir = paths.resource('walls')
    if (!existsSync(wallsDir)) return
    const dest = join(gameDir, 'resourcepacks')
    mkdirSync(dest, { recursive: true })
    for (const file of readdirSync(wallsDir)) {
      if (!file.toLowerCase().endsWith('.zip')) continue
      const target = join(dest, file)
      if (!existsSync(target)) copyFileSync(join(wallsDir, file), target)
    }
  } catch {
    // optional — a missing wall pack must never break an install
  }
}

/** Copy the bundled hotbars, walls (RSG/ZSG), and install practice maps. All idempotent. */
async function ensureInstanceExtras(id: InstanceId, gameDir: string): Promise<void> {
  try {
    const hotbar = join(gameDir, 'hotbar.nbt')
    if (!existsSync(hotbar)) copyFileSync(paths.resource('hotbar.nbt'), hotbar)
  } catch {
    // optional — not fatal if the bundled hotbar is missing
  }
  if (id === 'rsg' || id === 'zsg') ensureWalls(gameDir)
  await runSyncMaps(id, 'Practice maps')
}

const FSG_MOD = {
  file: 'FSG-Mod-5.3.0+MC1.16.1.jar',
  url: 'https://cdn.modrinth.com/data/XZOGBIpM/versions/qc4OUmcd/FSG-Mod-5.3.0%2BMC1.16.1.jar'
}

/** ZSG is the RSG mod set plus the FSG (filtered seed) mod. Idempotent. */
async function installFsgMod(gameDir: string, id: InstanceId): Promise<void> {
  const modsDir = join(gameDir, 'mods')
  mkdirSync(modsDir, { recursive: true })
  const dest = join(modsDir, FSG_MOD.file)
  if (existsSync(dest)) return
  sendProgress({ instance: id, phase: 'mods', fraction: null, message: 'Installing FSG mod…' })
  const res = await fetch(FSG_MOD.url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`FSG mod download failed (${res.status})`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

async function installInstance(
  id: InstanceId,
  importFrom: InstanceId | null = null,
  importFolder: string | null = null,
  importWorlds: string[] = []
): Promise<void> {
  setState(id, { state: 'installing', error: undefined })
  try {
    const index = await getIndex()
    const fabric = fabricVersionString(index)
    const gameDir = await gmll.installBase(id, fabric, sendProgress)

    // Toolscreen: fetch its injector jar now so launching is fast. We don't "install" it into
    // the instance — at launch we spawn its watcher, which injects the overlay into the game.
    try {
      if (store.getConfig().toolscreen) {
        sendProgress({ instance: id, phase: 'configs', fraction: null, message: 'Downloading Toolscreen…' })
        await ensureToolscreenJar(gameDir)
      }
    } catch (e) {
      pushLog('system', `Toolscreen download skipped: ${e instanceof Error ? e.message : e}`)
    }

    sendProgress({ instance: id, phase: 'mods', fraction: 0, message: 'Installing mods…' })
    await installPackFiles(index, gameDir, {
      excludePrefixes: id === 'rsg' || id === 'zsg' ? RSG_EXCLUDE_PREFIXES : [],
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

    if (id === 'zsg') await installFsgMod(gameDir, id)

    // Ranked: always run the newest ranked mod from Modrinth, not the pack's pinned one.
    if (id === 'ranked') {
      sendProgress({ instance: id, phase: 'mods', fraction: null, message: 'Installing the latest MCSR Ranked mod…' })
      try {
        const v = await installLatestRankedMod(gameDir)
        pushLog('system', `MCSR Ranked ${v} installed from Modrinth.`)
      } catch (e) {
        pushLog('system', `Latest Ranked mod fetch failed; keeping the pack version. ${e instanceof Error ? e.message : e}`)
      }
    }

    await ensureInstanceExtras(id, gameDir)

    // First-install import: copy options.txt, hotbar.nbt, and config/ from a chosen instance,
    // or from any folder the player pointed at (we resolve its game dir).
    if (importFrom && importFrom !== id) {
      try {
        const copied = copyInstanceSettings(gmll.gameDir(importFrom), gameDir, { worlds: importWorlds })
        pushLog('system', `Imported from ${importFrom}: ${copied.join(', ') || 'nothing found'}.`)
      } catch (e) {
        pushLog('system', `Import skipped: ${e instanceof Error ? e.message : e}`)
      }
    } else if (importFolder) {
      try {
        const copied = copyInstanceSettings(resolveGameDir(importFolder), gameDir, { worlds: importWorlds })
        pushLog('system', `Imported from ${importFolder}: ${copied.join(', ') || 'nothing found'}.`)
      } catch (e) {
        pushLog('system', `Import skipped: ${e instanceof Error ? e.message : e}`)
      }
    }

    // Bundle Ninjabrain Bot + a desktop shortcut.
    try {
      if (store.getConfig().ninjabrain) await setupNinjabrain()
    } catch (e) {
      pushLog('system', `Ninjabrain Bot setup skipped: ${e instanceof Error ? e.message : e}`)
    }

    mkdirSync(paths.instanceDir(id), { recursive: true })
    writeFileSync(versionFile(id), index.versionId, 'utf8')
    setState(id, { state: 'ready', versionId: index.versionId })
  } catch (e) {
    setState(id, { state: 'error', error: String(e instanceof Error ? e.message : e) })
    throw e
  }
}

async function launchInstance(
  id: InstanceId,
  opts?: { importFrom?: InstanceId | null; importFolder?: string | null; importWorlds?: string[] }
): Promise<void> {
  const token = auth.getLaunchToken()
  if (!token) throw new Error('Sign in with Microsoft before launching.')

  // Auto-update: re-check the official MCSR pack version before booting and
  // re-resolve the whole instance if it changed (keeps all mods compatible).
  // Offline? Fall back to whatever is already installed.
  let latest: string | undefined
  try {
    cachedIndex = await fetchPack()
    latest = cachedIndex.versionId
  } catch {
    // network unavailable — launch what we have
  }
  const wasFresh = states[id].state === 'not-installed'
  const stale = latest !== undefined && installedVersion(id) !== latest
  if (states[id].state !== 'ready' || stale) {
    if (stale) {
      sendProgress({ instance: id, phase: 'mods', fraction: null, message: `Updating MCSR pack to ${latest}…` })
    }
    // Only honor a settings import on a genuine first install, not a stale-pack reinstall.
    await installInstance(
      id,
      wasFresh ? (opts?.importFrom ?? null) : null,
      wasFresh ? (opts?.importFolder ?? null) : null,
      wasFresh ? (opts?.importWorlds ?? []) : []
    )
  }

  const index = await getIndex()
  const fabric = fabricVersionString(index)
  await ensureInstanceExtras(id, gmll.gameDir(id))
  setState(id, { state: 'launching' })

  // Companion tools that run alongside the game (both need a Java 17+ runtime). Spawn them now,
  // before the game, so Toolscreen's watcher catches the window and Ninjabrain is ready. All
  // best-effort — never block the launch.
  const cfg = store.getConfig()
  if (cfg.toolscreen || cfg.ninjabrain) {
    const java = await detectJava()
    if (java.ok) {
      if (cfg.toolscreen) {
        try {
          await spawnToolscreenWatcher(gmll.gameDir(id))
          pushLog('system', 'Toolscreen watcher started — it will inject once the game window opens.')
        } catch (e) {
          pushLog('system', `Toolscreen skipped: ${e instanceof Error ? e.message : e}`)
        }
      }
      if (cfg.ninjabrain) {
        try {
          const opened = await launchNinjabrain()
          if (opened) pushLog('system', 'Ninjabrain Bot opened.')
        } catch (e) {
          pushLog('system', `Ninjabrain Bot skipped: ${e instanceof Error ? e.message : e}`)
        }
      }
    } else {
      pushLog('system', 'Companion tools (Toolscreen / Ninjabrain) need Java 17+ on PATH; skipped this launch.')
    }
  }

  pushLog('system', `Launching ${id}…`)
  const child = await gmll.launch(id, token, fabric, sendProgress)
  setState(id, { state: 'running' })
  child.stdout.on('data', (d: Buffer) => pushLog('game', d.toString()))
  child.stderr.on('data', (d: Buffer) => pushLog('game', d.toString()))

  if (id === 'rsg') void tracker.start()

  child.on('close', () => {
    if (id === 'rsg') tracker.stop()
    // Close the Ninjabrain Bot we run alongside the game.
    if (store.getConfig().ninjabrain) killNinjabrain()
    pushLog('system', `${id} closed.`)
    setState(id, { state: 'ready' })
  })
}

const BUSY_STATES = ['installing', 'launching', 'running']

/** Delete an instance's files. Clears shared-link junctions first so the recursive
 *  remove can never follow them into the shared assets/libraries. */
function deleteInstance(id: InstanceId): void {
  if (BUSY_STATES.includes(states[id].state)) {
    throw new Error('Close the game before deleting this instance.')
  }
  removeLinkIfPresent(join(paths.instanceDir(id), 'libraries'))
  removeLinkIfPresent(join(paths.instanceDir(id), 'assets'))
  rmSync(paths.instanceDir(id), { recursive: true, force: true })
  setState(id, { state: 'not-installed', versionId: undefined, error: undefined })
}

export function registerIpc(): void {
  hydrateStates()
  tracker.onStatus((s) => win()?.webContents.send(IPC.paceStatusChanged, s))
  onLog((l) => win()?.webContents.send(IPC.logLine, l))

  ipcMain.on(IPC.winMinimize, () => win()?.minimize())
  ipcMain.on(IPC.winClose, () => win()?.close())

  ipcMain.handle(IPC.authLogin, () => auth.login())
  ipcMain.handle(IPC.authRestore, () => auth.restore())
  ipcMain.handle(IPC.authLogout, () => auth.logout())
  ipcMain.handle(IPC.authAccounts, () => auth.listAccounts())
  ipcMain.handle(IPC.authAdd, () => auth.addAccount())
  ipcMain.handle(IPC.authSwitch, (_e, uuid: string) => auth.switchAccount(uuid))
  ipcMain.handle(IPC.authRemove, (_e, uuid: string) => auth.removeAccount(uuid))

  ipcMain.handle(IPC.instStatus, (_e, id: InstanceId) => states[id])
  ipcMain.handle(IPC.instInstall, (_e, id: InstanceId) => installInstance(id))
  ipcMain.handle(
    IPC.instLaunch,
    (
      _e,
      id: InstanceId,
      opts?: { importFrom?: InstanceId | null; importFolder?: string | null; importWorlds?: string[] }
    ) => launchInstance(id, opts)
  )
  ipcMain.handle(IPC.instVerify, (_e, id: InstanceId) => installInstance(id))
  ipcMain.handle(IPC.instDelete, (_e, id: InstanceId) => deleteInstance(id))
  ipcMain.handle(IPC.instSyncMaps, (_e, id: InstanceId) => runSyncMaps(id, 'Maps'))
  ipcMain.handle(IPC.instMods, (_e, id: InstanceId) => listMods(join(gmll.gameDir(id), 'mods')))
  ipcMain.handle(IPC.instToggleMod, (_e, id: InstanceId, file: string, enabled: boolean) => {
    const dir = join(gmll.gameDir(id), 'mods')
    setModEnabled(dir, file, enabled)
    return listMods(dir)
  })
  ipcMain.handle(IPC.instOpenFolder, (_e, id: InstanceId) => {
    const dir = paths.instanceDir(id)
    mkdirSync(dir, { recursive: true })
    // shell.openPath reports "Location is not available" for instance folders that
    // contain junctions; explorer.exe opens them reliably. Fall back elsewhere.
    if (process.platform === 'win32') {
      const child = spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' })
      child.on('error', () => void shell.openPath(dir))
      child.unref()
      return
    }
    return shell.openPath(dir)
  })
  ipcMain.handle(IPC.instStdGet, (_e, id: InstanceId) => readStandardSettings(gmll.gameDir(id)))
  ipcMain.handle(IPC.instStdSet, (_e, id: InstanceId, patch: StandardSettings) =>
    writeStandardSettings(gmll.gameDir(id), patch)
  )
  ipcMain.handle(IPC.instImportSettings, async (_e, id: InstanceId) => {
    const res = await dialog.showOpenDialog({
      title: 'Import a Minecraft options.txt',
      filters: [{ name: 'Minecraft options', extensions: ['txt'] }],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return { imported: importOptionsFile(gmll.gameDir(id), res.filePaths[0]) }
  })
  ipcMain.handle(IPC.instInstalledIds, () =>
    (['ranked', 'rsg', 'zsg'] as InstanceId[]).filter((i) =>
      ['ready', 'running', 'launching'].includes(states[i].state)
    )
  )
  ipcMain.handle(
    IPC.instImportFromInstance,
    (_e, target: InstanceId, source: InstanceId, opts?: { worlds?: string[] }) => {
      const copied = copyInstanceSettings(gmll.gameDir(source), gmll.gameDir(target), {
        worlds: opts?.worlds ?? []
      })
      pushLog('system', `Imported from ${source} into ${target}: ${copied.join(', ') || 'nothing found'}.`)
      return { copied }
    }
  )
  ipcMain.handle(
    IPC.instImportFromFolderPath,
    (_e, target: InstanceId, folder: string, opts?: { worlds?: string[] }) => {
      const copied = copyInstanceSettings(resolveGameDir(folder), gmll.gameDir(target), {
        worlds: opts?.worlds ?? []
      })
      pushLog('system', `Imported from ${folder} into ${target}: ${copied.join(', ') || 'nothing found'}.`)
      return { copied }
    }
  )
  ipcMain.handle(IPC.instListWorlds, (_e, id: InstanceId) => listWorlds(gmll.gameDir(id)))
  ipcMain.handle(IPC.instListWorldsInFolder, (_e, folder: string) => listWorlds(resolveGameDir(folder)))
  ipcMain.handle(IPC.skinGet, (_e, idOrUuid: string, size: number, kind: 'avatar' | 'body') =>
    getSkin(idOrUuid, size, kind)
  )
  ipcMain.handle(IPC.sysJava, () => detectJava())

  ipcMain.handle(IPC.updCheck, () => checkForUpdates())
  ipcMain.handle(IPC.updStatus, () => currentUpdateStatus())
  ipcMain.handle(IPC.updInstall, () => quitAndInstall())
  ipcMain.handle(IPC.logHistory, () => logHistory())
  ipcMain.handle(IPC.logClear, () => clearLog())

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
  ipcMain.handle(IPC.cfgPickJava, async () => {
    const res = await dialog.showOpenDialog({
      title: 'Choose a Java executable',
      filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : [],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })
  ipcMain.handle(IPC.cfgPickFolder, async () => {
    const res = await dialog.showOpenDialog({
      title: 'Choose an instance or .minecraft folder',
      properties: ['openDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })
}
