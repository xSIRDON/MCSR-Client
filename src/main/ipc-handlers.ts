import { ipcMain, dialog, shell } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'
import type { AppConfig, GapCheckFilters, InstanceId, LogKind, StandardSettings } from '../shared/types'
import { INSTANCE_IDS, INSTANCE_LABEL } from '../shared/types'
import { store } from './store'
import * as auth from './auth/msmc-auth'
import * as gmll from './launcher/gmll-adapter'
import * as tracker from './paceman/tracker'
import * as gapcheck from './gapcheck'
import { listMods, setModEnabled, hasExtraOptions, shouldPromptExtraOptions } from './instances/mods'
import { readStandardSettings, writeStandardSettings, importOptionsFile } from './instances/standard-settings'
import { copyInstanceSettings, resolveGameDir, listWorlds } from './instances/copy-instance'
import { exportPack } from './instances/export-pack'
import { cleanLogs, deleteLog, listLogs, readLog, uploadLog } from './instances/logs'
import { getSkin } from './skins'
import { getCachedMatch, putCachedMatch } from './match-cache'
import { checkForUpdates, currentUpdateStatus, quitAndInstall } from './updater'
import { detectJava } from './system/java'
import { pushLog, onLog, logHistory, clearLog } from './log'
import { paths } from './paths'
import {
  assertInstanceId,
  BUSY_STATES,
  hydrateStates,
  launchSecrets,
  states,
  win
} from './ipc/instance-state'
import {
  deleteInstance,
  EXTRA_OPTIONS_MOD,
  getIndex,
  installInstance,
  installInstanceMod,
  installQueue,
  runSyncMaps
} from './ipc/install'
import { launchInstance, type LaunchOptions } from './ipc/launch'
import { assertPicked, guardConfigPatch, picked } from './ipc/picked-paths'
import { seedQueueInfo, tuneSeedQueue } from './ipc/seedqueue-tuning'

export { isGameRunning } from './ipc/instance-state'

function asGapCheckFilters(raw: unknown): GapCheckFilters {
  const f = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    seedType: typeof f.seedType === 'string' ? f.seedType : null,
    bastionType: typeof f.bastionType === 'string' ? f.bastionType : null,
    maxTimeSeconds: num(f.maxTimeSeconds),
    minTimeSeconds: num(f.minTimeSeconds),
    minRank: num(f.minRank),
    players: Array.isArray(f.players) ? f.players.filter((p): p is string => typeof p === 'string') : []
  }
}

const launches = new Map<InstanceId, Promise<void>>()

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

  ipcMain.handle(IPC.instStatus, (_e, id: unknown) => states[assertInstanceId(id)])
  ipcMain.handle(IPC.instInstall, (_e, id: unknown) => installInstance(assertInstanceId(id)))
  ipcMain.handle(
    IPC.instLaunch,
    (_e, id: unknown, opts?: LaunchOptions) => {
      const iid = assertInstanceId(id)
      if (opts?.importFolder != null) assertPicked(opts.importFolder)
      const inFlight = launches.get(iid)
      if (inFlight) return inFlight
      if (states[iid].state === 'running') throw new Error('That instance is already running.')
      const p = launchInstance(iid, opts).finally(() => launches.delete(iid))
      launches.set(iid, p)
      return p
    }
  )
  ipcMain.handle(IPC.instVerify, (_e, id: unknown) => installInstance(assertInstanceId(id)))
  ipcMain.handle(IPC.instDelete, (_e, id: unknown) => deleteInstance(assertInstanceId(id)))
  ipcMain.handle(IPC.instSyncMaps, async (_e, id: unknown) => {
    const failed = await runSyncMaps(assertInstanceId(id), 'Maps')
    if (failed.length > 0) throw new Error(`Could not download ${failed.join(', ')}. Try again in a minute.`)
  })
  ipcMain.handle(IPC.instMods, (_e, id: unknown) =>
    listMods(join(gmll.gameDir(assertInstanceId(id)), 'mods'))
  )
  ipcMain.handle(IPC.instToggleMod, (_e, rawId: unknown, file: string, enabled: boolean) => {
    const id = assertInstanceId(rawId)
    const dir = join(gmll.gameDir(id), 'mods')
    setModEnabled(dir, file, enabled)
    return listMods(dir)
  })
  ipcMain.handle(IPC.instExtraOptionsPrompt, () => {
    try {
      const seen = store.getConfig().extraOptionsPromptSeen
      const checks = (['rsg', 'zsg'] as InstanceId[]).map((id) => ({
        id,
        ready: states[id].state === 'ready',
        hasExtraOptions: hasExtraOptions(join(gmll.gameDir(id), 'mods'))
      }))
      return shouldPromptExtraOptions(seen, checks)
    } catch {
      return { show: false, instances: [] as InstanceId[] }
    }
  })
  ipcMain.handle(IPC.instAddExtraOptions, async (_e, ids: InstanceId[]) => {
    for (const id of ids) {
      if (id !== 'rsg' && id !== 'zsg') continue
      await installQueue.run(id, () =>
        installInstanceMod(gmll.gameDir(id), id, EXTRA_OPTIONS_MOD, 'extra-options')
      )
    }
  })
  ipcMain.handle(IPC.instDismissExtraOptionsPrompt, () => {
    store.setConfig({ extraOptionsPromptSeen: true })
  })
  ipcMain.handle(IPC.instOpenFolder, (_e, rawId: unknown) => {
    const id = assertInstanceId(rawId)
    const dir = paths.instanceDir(id)
    mkdirSync(dir, { recursive: true })
    if (process.platform === 'win32') {
      const child = spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' })
      child.on('error', () => void shell.openPath(dir))
      child.unref()
      return
    }
    return shell.openPath(dir)
  })
  ipcMain.handle(IPC.instExport, async (_e, rawId: unknown) => {
    const id = assertInstanceId(rawId)
    const dir = gmll.gameDir(id)
    if (!existsSync(join(dir, 'mods'))) throw new Error('Install this instance before exporting it.')
    const { dependencies } = await getIndex()
    const name = `MCSR ${INSTANCE_LABEL[id]}`
    const res = await dialog.showSaveDialog({
      title: 'Export for MultiMC or Prism',
      defaultPath: `${name}.zip`,
      filters: [{ name: 'Instance zip', extensions: ['zip'] }]
    })
    if (res.canceled || !res.filePath) return null
    const files = await exportPack(dir, res.filePath, {
      name,
      minecraft: dependencies['minecraft'],
      loader: dependencies['fabric-loader'],
      ramMb: store.getConfig().ram[id]
    })
    pushLog('system', `Exported ${files} files to ${res.filePath}`)
    return res.filePath
  })
  ipcMain.handle(IPC.instLogs, (_e, rawId: unknown) => listLogs(gmll.gameDir(assertInstanceId(rawId))))
  ipcMain.handle(IPC.instLogRead, (_e, rawId: unknown, kind: LogKind, name: string) =>
    readLog(gmll.gameDir(assertInstanceId(rawId)), kind, String(name), launchSecrets())
  )
  ipcMain.handle(IPC.instLogUpload, async (_e, rawId: unknown, kind: LogKind, name: string) => {
    const id = assertInstanceId(rawId)
    const url = await uploadLog(await readLog(gmll.gameDir(id), kind, String(name), launchSecrets()))
    pushLog('system', `Uploaded ${name} to ${url}`)
    return url
  })
  ipcMain.handle(IPC.instLogDelete, (_e, rawId: unknown, kind: LogKind, name: string) =>
    deleteLog(gmll.gameDir(assertInstanceId(rawId)), kind, String(name))
  )
  ipcMain.handle(IPC.instLogClean, (_e, rawId: unknown) => cleanLogs(gmll.gameDir(assertInstanceId(rawId))))
  ipcMain.handle(IPC.instStdGet, (_e, id: unknown) =>
    readStandardSettings(gmll.gameDir(assertInstanceId(id)))
  )
  ipcMain.handle(IPC.instStdSet, (_e, id: unknown, patch: StandardSettings) =>
    writeStandardSettings(gmll.gameDir(assertInstanceId(id)), patch)
  )
  ipcMain.handle(IPC.instImportSettings, async (_e, rawId: unknown) => {
    const id = assertInstanceId(rawId)
    const res = await dialog.showOpenDialog({
      title: 'Import a Minecraft options.txt',
      filters: [{ name: 'Minecraft options', extensions: ['txt'] }],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return { imported: importOptionsFile(gmll.gameDir(id), res.filePaths[0]) }
  })
  ipcMain.handle(IPC.instInstalledIds, () =>
    INSTANCE_IDS.filter((i) => ['ready', 'running', 'launching'].includes(states[i].state))
  )
  ipcMain.handle(
    IPC.instImportFromInstance,
    async (_e, rawTarget: unknown, rawSource: unknown, opts?: { worlds?: string[] }) => {
      const target = assertInstanceId(rawTarget)
      const source = assertInstanceId(rawSource)
      const copied = await copyInstanceSettings(gmll.gameDir(source), gmll.gameDir(target), {
        worlds: opts?.worlds ?? []
      })
      pushLog('system', `Imported from ${source} into ${target}: ${copied.join(', ') || 'nothing found'}.`)
      return { copied }
    }
  )
  ipcMain.handle(
    IPC.instImportFromFolderPath,
    async (_e, rawTarget: unknown, folder: string, opts?: { worlds?: string[] }) => {
      const target = assertInstanceId(rawTarget)
      const copied = await copyInstanceSettings(resolveGameDir(assertPicked(folder)), gmll.gameDir(target), {
        worlds: opts?.worlds ?? []
      })
      pushLog('system', `Imported from ${folder} into ${target}: ${copied.join(', ') || 'nothing found'}.`)
      return { copied }
    }
  )
  ipcMain.handle(IPC.instListWorlds, (_e, id: unknown) =>
    listWorlds(gmll.gameDir(assertInstanceId(id)))
  )
  ipcMain.handle(IPC.instListWorldsInFolder, (_e, folder: string) =>
    listWorlds(resolveGameDir(assertPicked(folder)))
  )
  ipcMain.handle(IPC.instSeedQueue, (_e, id: InstanceId) => seedQueueInfo(assertInstanceId(id)))
  ipcMain.handle(IPC.instTuneSeedQueue, (_e, id: InstanceId) => {
    const iid = assertInstanceId(id)
    if (BUSY_STATES.includes(states[iid].state)) {
      throw new Error('Close the game first, SeedQueue settings can’t change while it’s running.')
    }
    const changes = tuneSeedQueue(iid)
    if (changes.length > 0) pushLog('system', `[${iid}] Tuned SeedQueue for this PC: ${changes.join(', ')}`)
    return seedQueueInfo(iid)
  })
  ipcMain.handle(IPC.skinGet, (_e, idOrUuid: string, size: number, kind: 'avatar' | 'body') =>
    getSkin(idOrUuid, size, kind)
  )
  ipcMain.handle(IPC.matchCacheGet, (_e, id: unknown) => getCachedMatch(id))
  ipcMain.handle(IPC.matchCachePut, (_e, id: unknown, match: unknown) => putCachedMatch(id, match))
  ipcMain.handle(IPC.gapcheckCounts, (_e, filters: unknown) => gapcheck.counts(asGapCheckFilters(filters)))
  ipcMain.handle(IPC.gapcheckSeed, (_e, filters: unknown) => gapcheck.randomSeed(asGapCheckFilters(filters)))
  ipcMain.handle(IPC.sysJava, async () => ({ ...(await detectJava()), bundled: gmll.managedJavaOnDisk() }))

  ipcMain.handle(IPC.updCheck, () => checkForUpdates())
  ipcMain.handle(IPC.updStatus, () => currentUpdateStatus())
  ipcMain.handle(IPC.updInstall, () => quitAndInstall())
  ipcMain.handle(IPC.logHistory, () => logHistory())
  ipcMain.handle(IPC.logClear, () => clearLog())

  ipcMain.handle(IPC.paceSetKey, (_e, key: string) => tracker.setKey(key))
  ipcMain.handle(IPC.paceGetKey, () => tracker.getKey())
  ipcMain.handle(IPC.paceStatus, () => tracker.status())

  ipcMain.handle(IPC.cfgGet, () => store.getConfig())
  ipcMain.handle(IPC.cfgSet, (_e, patch: Partial<AppConfig>) => store.setConfig(guardConfigPatch(patch ?? {})))
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
    return picked(res.filePaths[0])
  })
  ipcMain.handle(IPC.cfgPickFolder, async () => {
    const res = await dialog.showOpenDialog({
      title: 'Choose an instance or .minecraft folder',
      properties: ['openDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return picked(res.filePaths[0])
  })
}
