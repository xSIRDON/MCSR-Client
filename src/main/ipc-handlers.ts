import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { availableParallelism, freemem, totalmem } from 'node:os'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'
import type {
  AppConfig,
  GapCheckFilters,
  InstanceId,
  InstanceStatus,
  ProgressEvent,
  SeedQueueInfo,
  StandardSettings
} from '../shared/types'
import { isInstanceId } from '../shared/types'
import { store } from './store'
import * as auth from './auth/msmc-auth'
import * as gmll from './launcher/gmll-adapter'
import * as tracker from './paceman/tracker'
import * as gapcheck from './gapcheck'
import * as friends from './friends/service'
import {
  fetchPack,
  installPackFiles,
  installLatestRankedMod,
  fabricVersionString,
  PACK_MOD_UPGRADES,
  RSG_EXCLUDE_PREFIXES,
  type ModrinthIndex
} from './instances/mrpack'
import { writeRankedConfigs, writeRsgConfigs } from './instances/configs'
import {
  planTune,
  readSeedQueue,
  recommendedRamMb,
  recommendedSeedQueue,
  suggestLowerRam,
  writeSeedQueue
} from './instances/seedqueue'
import { syncMaps } from './instances/maps'
import {
  listMods,
  setModEnabled,
  installModJar,
  hasExtraOptions,
  shouldPromptExtraOptions,
  pruneSupersededMods,
  upgradeInstalledMods
} from './instances/mods'
import { readStandardSettings, writeStandardSettings, importOptionsFile } from './instances/standard-settings'
import { copyInstanceSettings, resolveGameDir, listWorlds } from './instances/copy-instance'
import { formatBytes, type CopyProgress } from './instances/copy-tree'
import { makeLineScrubber } from './line-scrub'
import { getSkin } from './skins'
import { checkForUpdates, currentUpdateStatus, quitAndInstall } from './updater'
import { setupNinjabrain, launchNinjabrain, killNinjabrain } from './tools/ninjabrain'
import { ensureToolscreenJar, spawnToolscreenWatcher } from './tools/toolscreen'
import { detectJava } from './system/java'
import { removeLinkIfPresent } from './launcher/links'
import { gameWindowReady } from './launcher/game-ready'
import { describeGcReport, readGcReport, readLastSession, saveLastSession } from './launcher/gc-report'
import { pushLog, onLog, logHistory, clearLog } from './log'
import { paths } from './paths'
import { createKeyedQueue } from './keyed-queue'

const states: Record<InstanceId, InstanceStatus> = {
  ranked: { id: 'ranked', state: 'not-installed' },
  rsg: { id: 'rsg', state: 'not-installed' },
  zsg: { id: 'zsg', state: 'not-installed' }
}

function assertInstanceId(id: unknown): InstanceId {
  if (!isInstanceId(id)) throw new Error('Unknown instance.')
  return id
}

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

function win(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function launchSecrets(): string[] {
  const t = auth.getLaunchToken() as { access_token?: string; profile?: { id?: string } } | null
  return [t?.access_token ?? '', t?.profile?.id ?? '']
}

function setState(id: InstanceId, patch: Partial<InstanceStatus>): void {
  states[id] = { ...states[id], ...patch }
  win()?.webContents.send(IPC.instStateChanged, states[id])
}

function sendProgress(e: ProgressEvent): void {
  win()?.webContents.send(IPC.instProgress, e)
  pushLog('system', `[${e.instance}] ${e.message}`)
}

const syncQueue = createKeyedQueue<InstanceId>(['ranked', 'rsg', 'zsg'])
const installQueue = createKeyedQueue<InstanceId>(['ranked', 'rsg', 'zsg'])

function runSyncMaps(id: InstanceId, label: string): Promise<void> {
  return syncQueue.run(id, () =>
    syncMaps(join(gmll.gameDir(id), 'saves'), store.getConfig().maps[id], (done, total, lbl) =>
      sendProgress({
        instance: id,
        phase: 'configs',
        fraction: total > 0 ? done / total : null,
        message:
          total === 0
            ? `${label}: nothing to download`
            : done >= total
              ? `${label}: ${total} installed`
              : `${label}: ${lbl} (${done + 1}/${total})`
      })
    )
  )
}

function copyProgress(id: InstanceId): {
  onScan: (files: number) => void
  onProgress: (p: CopyProgress) => void
} {
  let last = 0
  const due = (): boolean => {
    const now = Date.now()
    if (now - last < 150) return false
    last = now
    return true
  }
  return {
    onScan: (files) => {
      if (due()) sendProgress({ instance: id, phase: 'configs', fraction: null, message: `Finding files to copy… ${files}` })
    },
    onProgress: (p) => {
      if (!due() && p.doneFiles < p.totalFiles) return
      sendProgress({
        instance: id,
        phase: 'configs',
        fraction: p.totalBytes > 0 ? p.doneBytes / p.totalBytes : null,
        message: `Copying worlds & settings: ${formatBytes(p.doneBytes)} of ${formatBytes(p.totalBytes)} (${p.doneFiles}/${p.totalFiles} files)`
      })
    }
  }
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

function hydrateStates(): void {
  for (const id of ['ranked', 'rsg', 'zsg'] as InstanceId[]) {
    const v = installedVersion(id)
    if (v && hasMods(id)) setState(id, { state: 'ready', versionId: v })
  }
}

let cachedIndex: ModrinthIndex | null = null

const pickedPaths = new Set<string>()
function picked(path: string): string {
  pickedPaths.add(path)
  return path
}
function assertPicked(path: unknown): string {
  if (typeof path !== 'string' || !pickedPaths.has(path)) {
    throw new Error('Choose that folder again with Browse.')
  }
  return path
}

function guardConfigPatch(patch: Partial<AppConfig>): Partial<AppConfig> {
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
  delete out.friendsServerUrl
  return out
}
async function getIndex(): Promise<ModrinthIndex> {
  if (!cachedIndex) cachedIndex = await fetchPack()
  return cachedIndex
}

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
  }
}

async function ensureInstanceExtras(id: InstanceId, gameDir: string): Promise<void> {
  try {
    const hotbar = join(gameDir, 'hotbar.nbt')
    if (!existsSync(hotbar)) copyFileSync(paths.resource('hotbar.nbt'), hotbar)
  } catch {
  }
  if (id === 'rsg' || id === 'zsg') ensureWalls(gameDir)
  await runSyncMaps(id, 'Practice maps')
}

const EXTRA_OPTIONS_MOD = {
  file: 'extra-options-2.2.1+1.16.1.jar',
  urls: [
    'https://github.com/tildejustin/extra-options/releases/download/v2.2.1/extra-options-2.2.1+1.16.1.jar',
    'https://github.com/Minecraft-Java-Edition-Speedrunning/legal-mods/raw/2ba63fc475270404e4a1c1f910f22bdc9bc14186/legal-mods/extra-options/1.16-1.16.1/extra-options-2.2.1+1.16.1.jar'
  ],
  sha512:
    'd2a997eb2a19c09fb2d548df4f7de85020079124fe64a1a5b5393419df3a070d76faee11f6df364310145baeccbbc99c9237bf8264bf1419f98482a82c2dc544'
}

const FSG_MOD = {
  file: 'FSG-Mod-5.3.0+MC1.16.1.jar',
  urls: ['https://cdn.modrinth.com/data/XZOGBIpM/versions/qc4OUmcd/FSG-Mod-5.3.0%2BMC1.16.1.jar'],
  sha512:
    '93f8d9b30f828938b57737ed6ad0c7ac85d2af709e3f389bf829d986f81e2c50d252f1ea3142e9f3bf5226a597f432e878c75ab9794411d120e986842ceab11b'
}

async function installInstanceMod(
  gameDir: string,
  id: InstanceId,
  mod: { file: string; urls: string[]; sha512?: string },
  label: string
): Promise<void> {
  sendProgress({ instance: id, phase: 'mods', fraction: null, message: `Installing ${label}…` })
  await installModJar(join(gameDir, 'mods'), mod)
}

const SEEDQUEUE_INSTANCES: readonly InstanceId[] = ['rsg', 'zsg']

function machine(): { threads: number; memMb: number } {
  return { threads: availableParallelism(), memMb: Math.round(totalmem() / 1048576) }
}

function seedQueueInfo(id: InstanceId): SeedQueueInfo | null {
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

function tuneSeedQueue(id: InstanceId): string[] {
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

async function companionJavaw(id: InstanceId): Promise<string | null> {
  const bundled = await gmll.ensureManagedJava(id, sendProgress)
  if (bundled) return bundled
  return (await detectJava()).ok ? 'javaw' : null
}

async function startCompanions(id: InstanceId, javaw: string | null): Promise<void> {
  const cfg = store.getConfig()
  if (!cfg.toolscreen && !cfg.ninjabrain) return
  if (!javaw) {
    pushLog('system', 'Companion tools (Toolscreen / Ninjabrain) need Java 17+; skipped this launch.')
    return
  }
  if (cfg.toolscreen) {
    try {
      await spawnToolscreenWatcher(gmll.gameDir(id), javaw)
      pushLog('system', 'Toolscreen watcher started — it will inject once the game window opens.')
    } catch (e) {
      pushLog('system', `Toolscreen skipped: ${e instanceof Error ? e.message : e}`)
    }
  }
  if (cfg.ninjabrain) {
    try {
      const opened = await launchNinjabrain(javaw)
      if (opened) pushLog('system', 'Ninjabrain Bot opened.')
    } catch (e) {
      pushLog('system', `Ninjabrain Bot skipped: ${e instanceof Error ? e.message : e}`)
    }
  }
}

function installInstance(
  id: InstanceId,
  importFrom: InstanceId | null = null,
  importFolder: string | null = null,
  importWorlds: string[] = []
): Promise<void> {
  return installQueue.run(id, () => doInstallInstance(id, importFrom, importFolder, importWorlds))
}

async function doInstallInstance(
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

    try {
      if (store.getConfig().toolscreen) {
        sendProgress({ instance: id, phase: 'configs', fraction: null, message: 'Downloading Toolscreen…' })
        await ensureToolscreenJar(gameDir)
      }
    } catch (e) {
      pushLog('system', `Toolscreen download skipped: ${e instanceof Error ? e.message : e}`)
    }

    sendProgress({ instance: id, phase: 'mods', fraction: 0, message: 'Installing mods…' })
    const packPaths = await installPackFiles(index, gameDir, {
      excludePrefixes: id === 'rsg' || id === 'zsg' ? RSG_EXCLUDE_PREFIXES : [],
      upgrades: id === 'ranked' ? [] : PACK_MOD_UPGRADES,
      seedQueueOverride: store.getConfig().seedQueueOverride,
      onProgress: (done, total, label) =>
        sendProgress({
          instance: id,
          phase: 'mods',
          fraction: total > 0 ? done / total : null,
          message: `Mods: ${label} (${done}/${total})`
        })
    })
    const packJars = packPaths.filter((p) => /^mods\/[^/]+\.jar$/i.test(p)).map((p) => p.slice('mods/'.length))
    const pruned = pruneSupersededMods(join(gameDir, 'mods'), packJars)
    if (pruned.length > 0) pushLog('system', `Removed replaced mod versions: ${pruned.join(', ')}.`)

    sendProgress({ instance: id, phase: 'configs', fraction: null, message: 'Writing configs…' })
    if (id === 'ranked') writeRankedConfigs(gameDir)
    else writeRsgConfigs(gameDir)

    if (id === 'rsg' || id === 'zsg') {
      try {
        await installInstanceMod(gameDir, id, EXTRA_OPTIONS_MOD, 'extra-options')
      } catch (e) {
        pushLog('system', `extra-options install skipped: ${e instanceof Error ? e.message : e}`)
      }
    }
    if (id === 'zsg') {
      try {
        await installInstanceMod(gameDir, id, FSG_MOD, 'FSG mod')
      } catch (e) {
        pushLog('system', `FSG mod install skipped: ${e instanceof Error ? e.message : e}`)
      }
    }

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

    if (importFrom && importFrom !== id) {
      try {
        const copied = await copyInstanceSettings(gmll.gameDir(importFrom), gameDir, {
          worlds: importWorlds,
          ...copyProgress(id)
        })
        pushLog('system', `Imported from ${importFrom}: ${copied.join(', ') || 'nothing found'}.`)
      } catch (e) {
        pushLog('system', `Import skipped: ${e instanceof Error ? e.message : e}`)
      }
    } else if (importFolder) {
      try {
        const copied = await copyInstanceSettings(resolveGameDir(importFolder), gameDir, {
          worlds: importWorlds,
          ...copyProgress(id)
        })
        pushLog('system', `Imported from ${importFolder}: ${copied.join(', ') || 'nothing found'}.`)
      } catch (e) {
        pushLog('system', `Import skipped: ${e instanceof Error ? e.message : e}`)
      }
    }

    try {
      sendProgress({ instance: id, phase: 'configs', fraction: null, message: 'Finishing up…' })
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

  let latest: string | undefined
  try {
    cachedIndex = await fetchPack()
    latest = cachedIndex.versionId
  } catch {
  }
  const wasFresh = states[id].state === 'not-installed'
  const stale = latest !== undefined && installedVersion(id) !== latest
  if (states[id].state !== 'ready' || stale) {
    if (stale) {
      sendProgress({ instance: id, phase: 'mods', fraction: null, message: `Updating MCSR pack to ${latest}…` })
    }
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
  sendProgress({ instance: id, phase: 'launch', fraction: null, message: 'Getting ready to launch…' })

  if (id !== 'ranked') {
    try {
      const updated = await upgradeInstalledMods(join(gmll.gameDir(id), 'mods'), PACK_MOD_UPGRADES)
      if (updated.length > 0) {
        sendProgress({ instance: id, phase: 'mods', fraction: null, message: `Updated ${updated.join(', ')}` })
      }
    } catch (e) {
      pushLog('system', `Mod update skipped: ${e instanceof Error ? e.message : e}`)
    }
  }

  if (store.getConfig().seedQueueAutoTune) {
    try {
      const changes = tuneSeedQueue(id)
      if (changes.length > 0) {
        sendProgress({
          instance: id,
          phase: 'configs',
          fraction: null,
          message: `Tuned SeedQueue for this PC: ${changes.join(', ')}`
        })
      }
    } catch (e) {
      pushLog('system', `SeedQueue tuning skipped: ${e instanceof Error ? e.message : e}`)
    }
  }

  const javaw = await companionJavaw(id)
  void startCompanions(id, javaw)

  pushLog('system', `Launching ${id}…`)
  const skipVerify = states[id].state === 'launching' && !!installedVersion(id)
  let child: Awaited<ReturnType<typeof gmll.launch>>
  try {
    child = await gmll.launch(id, token, fabric, sendProgress, (line) => pushLog('system', line), {
      skipVerify
    })
  } catch (e) {
    setState(id, { state: 'ready' })
    throw e
  }
  setState(id, { state: 'running' })

  let steppedAside = false
  let fallbackTimer: NodeJS.Timeout | null = null
  const stepAside = (): void => {
    if (steppedAside) return
    steppedAside = true
    if (fallbackTimer) clearTimeout(fallbackTimer)
    const w = win()
    if (w && !w.isMinimized()) w.minimize()
  }
  fallbackTimer = setTimeout(stepAside, 45_000)

  const secrets = launchSecrets()
  const onGameText = (text: string): void => {
    pushLog('game', text)
    if (!steppedAside && gameWindowReady(text)) stepAside()
  }
  for (const stream of [child.stdout, child.stderr]) {
    const scrub = makeLineScrubber(secrets, onGameText)
    stream.on('data', (d: Buffer) => scrub.push(d.toString()))
    stream.on('end', () => scrub.flush())
  }

  if (id === 'rsg') {
    tracker.start(javaw ?? undefined).catch((e) =>
      pushLog('system', `paceman tracker skipped: ${e instanceof Error ? e.message : e}`)
    )
  }

  const startedAt = Date.now()
  let lowestFreeMemMb = Math.round(freemem() / 1048576)
  const memWatch = setInterval(() => {
    lowestFreeMemMb = Math.min(lowestFreeMemMb, Math.round(freemem() / 1048576))
  }, 5000)
  memWatch.unref()
  child.on('close', (code) => {
    clearInterval(memWatch)
    if (code !== 0 && Date.now() - startedAt < 20_000) {
      pushLog(
        'system',
        `${id} exited immediately (code ${code}). If this repeats, use Edit instance → Verify files.`
      )
    }
    if (id === 'rsg') tracker.stop()
    const gc = readGcReport(gmll.gameDir(id))
    if (gc) {
      const report = { ...gc, lowestFreeMemMb }
      saveLastSession(paths.instanceDir(id), report)
      pushLog('system', `${id} session: ${describeGcReport(report)}.`)
    }
    if (store.getConfig().ninjabrain) killNinjabrain()
    pushLog('system', `${id} closed.`)
    setState(id, { state: 'ready' })
    const win = BrowserWindow.getAllWindows()[0]
    if (win?.isMinimized()) {
      win.restore()
      win.focus()
    }
  })

  child.unref()
}

export function isGameRunning(): boolean {
  return (['ranked', 'rsg', 'zsg'] as InstanceId[]).some(
    (id) => states[id]?.state === 'running' || states[id]?.state === 'launching'
  )
}

const BUSY_STATES = ['installing', 'launching', 'running']

async function deleteInstance(id: InstanceId): Promise<void> {
  if (BUSY_STATES.includes(states[id].state)) {
    throw new Error('Close the game before deleting this instance.')
  }
  removeLinkIfPresent(join(paths.instanceDir(id), 'libraries'))
  removeLinkIfPresent(join(paths.instanceDir(id), 'assets'))
  await rm(paths.instanceDir(id), { recursive: true, force: true })
  setState(id, { state: 'not-installed', versionId: undefined, error: undefined })
}

export function registerIpc(): void {
  hydrateStates()
  tracker.onStatus((s) => win()?.webContents.send(IPC.paceStatusChanged, s))
  onLog((l) => win()?.webContents.send(IPC.logLine, l))

  friends.setStateProvider(() => {
    for (const id of ['ranked', 'rsg', 'zsg'] as const) {
      if (states[id].state === 'running') return id
    }
    return 'idle'
  })
  friends.onChanged((s) => win()?.webContents.send(IPC.friendsChanged, s))
  friends.onMessages((e) => win()?.webContents.send(IPC.friendsMessagesChanged, e))

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
    (
      _e,
      id: unknown,
      opts?: { importFrom?: InstanceId | null; importFolder?: string | null; importWorlds?: string[] }
    ) => {
      if (opts?.importFolder != null) assertPicked(opts.importFolder)
      return launchInstance(assertInstanceId(id), opts)
    }
  )
  ipcMain.handle(IPC.instVerify, (_e, id: unknown) => installInstance(assertInstanceId(id)))
  ipcMain.handle(IPC.instDelete, (_e, id: unknown) => deleteInstance(assertInstanceId(id)))
  ipcMain.handle(IPC.instSyncMaps, (_e, id: unknown) => runSyncMaps(assertInstanceId(id), 'Maps'))
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
    (['ranked', 'rsg', 'zsg'] as InstanceId[]).filter((i) =>
      ['ready', 'running', 'launching'].includes(states[i].state)
    )
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
      throw new Error('Close the game first — SeedQueue settings can’t change while it’s running.')
    }
    const changes = tuneSeedQueue(iid)
    if (changes.length > 0) pushLog('system', `[${iid}] Tuned SeedQueue for this PC: ${changes.join(', ')}`)
    return seedQueueInfo(iid)
  })
  ipcMain.handle(IPC.skinGet, (_e, idOrUuid: string, size: number, kind: 'avatar' | 'body') =>
    getSkin(idOrUuid, size, kind)
  )
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

  ipcMain.handle(IPC.friendsState, () => friends.getState())
  ipcMain.handle(IPC.friendsAutoConnect, () => friends.autoConnect())
  ipcMain.handle(IPC.friendsConnect, () => friends.connect())
  ipcMain.handle(IPC.friendsDisconnect, () => friends.disconnect())
  ipcMain.handle(IPC.friendsRequest, (_e, uuid: string, nickname?: string) =>
    friends.request(uuid, nickname)
  )
  ipcMain.handle(IPC.friendsAccept, (_e, uuid: string) => friends.accept(uuid))
  ipcMain.handle(IPC.friendsDecline, (_e, uuid: string) => friends.decline(uuid))
  ipcMain.handle(IPC.friendsRemove, (_e, uuid: string) => friends.remove(uuid))
  ipcMain.handle(IPC.friendsMessages, () => friends.getMessages())
  ipcMain.handle(IPC.friendsSendMessage, (_e, uuid: string, body: string) =>
    friends.sendMessage(uuid, body)
  )
  ipcMain.handle(IPC.friendsMarkRead, (_e, uuid: string) => friends.markRead(uuid))

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
