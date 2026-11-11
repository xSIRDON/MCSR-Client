import { freemem } from 'node:os'
import { join } from 'node:path'
import type { InstanceId } from '../../shared/types'
import * as auth from '../auth/msmc-auth'
import * as gmll from '../launcher/gmll-adapter'
import { launchPrism, prismLaunchSecrets } from '../launcher/prism-adapter'
import { gameLogReader } from '../launcher/game-log'
import * as tracker from '../paceman/tracker'
import { fabricVersionString, PACK_MOD_UPGRADES } from '../instances/mrpack'
import { upgradeInstalledMods } from '../instances/mods'
import { launchNinjabrain, killNinjabrain } from '../tools/ninjabrain'
import { spawnToolscreenWatcher } from '../tools/toolscreen'
import { detectJava } from '../system/java'
import { gameWindowReady } from '../launcher/game-ready'
import { describeGcReport, readGcReport, saveLastSession } from '../launcher/gc-report'
import { makeLineScrubber } from '../line-scrub'
import { pushLog } from '../log'
import { paths } from '../paths'
import { store } from '../store'
import { installedVersion, launchSecrets, sendProgress, setState, states, win } from './instance-state'
import { ensureInstanceExtras, getIndex, installInstance, refreshIndex } from './install'
import { tuneSeedQueue } from './seedqueue-tuning'
import { prismRoot, syncPrismAfterClose } from './prism-settings'

export type LaunchOptions = { importFrom?: InstanceId | null; importFolder?: string | null; importWorlds?: string[] }

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
      await spawnToolscreenWatcher(join(prismRoot(id), 'instances', id, '.minecraft'), javaw)
      pushLog('system', 'Toolscreen watcher started, it will inject once the game window opens.')
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

export async function launchInstance(id: InstanceId, opts?: LaunchOptions): Promise<void> {
  const token = auth.getLaunchToken()
  if (!token) throw new Error('Sign in with Microsoft before launching.')

  let latest: string | undefined
  try {
    latest = (await refreshIndex()).versionId
  } catch {
  }
  const wasFresh =
    states[id].state === 'not-installed' || (states[id].state === 'error' && !installedVersion(id))
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
  const launchStartedAt = Date.now()
  let child: Awaited<ReturnType<typeof launchPrism>>
  try {
    const jvm = await gmll.prismJvm(id)
    pushLog('system', `Starting on ${jvm.label} with ${store.getConfig().ram[id]} MB.`)
    const freeMb = Math.round(freemem() / 1048576)
    if (freeMb < store.getConfig().ram[id] * 0.9) {
      pushLog('system', `Only ${freeMb} MB of RAM is currently free. Close other apps if Minecraft runs slowly.`)
    }
    child = await launchPrism(id, gmll.gameDir(id), fabric, jvm.java, sendProgress, jvm.args)
  } catch (e) {
    if (store.getConfig().ninjabrain) killNinjabrain()
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

  const secrets = [...launchSecrets(), ...prismLaunchSecrets(id)]
  const onGameText = (text: string): void => {
    pushLog('game', text)
    if (!steppedAside && gameWindowReady(text)) stepAside()
  }
  const scrub = makeLineScrubber(secrets, onGameText)
  const readGameLog = gameLogReader(join(gmll.gameDir(id), 'logs', 'latest.log'), launchStartedAt, (text) => scrub.push(text))
  const pollGameLog = (): void => {
    try { readGameLog() } catch (error) {
      pushLog('system', `Could not read Minecraft's log: ${error instanceof Error ? error.message : error}`)
      clearInterval(logWatch)
    }
  }
  const logWatch = setInterval(pollGameLog, 500)
  logWatch.unref()

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
    if (fallbackTimer) clearTimeout(fallbackTimer)
    clearInterval(logWatch)
    pollGameLog()
    scrub.flush()
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
    syncPrismAfterClose(id)
    const w = win()
    if (w?.isMinimized()) {
      w.restore()
      w.focus()
    }
  })

  child.unref()
}
