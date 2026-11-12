import { existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { InstanceId } from '../../shared/types'
import * as gmll from '../launcher/gmll-adapter'
import { removeLinkIfPresent } from '../launcher/links'
import { detachPrismInstance, prismSessionActive } from '../launcher/prism-instance'
import {
  installPackFiles,
  installLatestRankedMod,
  fabricVersionString,
  PACK_MOD_UPGRADES,
  RSG_EXCLUDE_PREFIXES
} from '../instances/mrpack'
import { writeRankedConfigs, writeRsgConfigs } from '../instances/configs'
import { syncMaps } from '../instances/maps'
import { installModJar, pruneSupersededMods } from '../instances/mods'
import { copyInstanceSettings, resolveGameDir } from '../instances/copy-instance'
import { formatBytes, type CopyProgress } from '../instances/copy-tree'
import { setupNinjabrain } from '../tools/ninjabrain'
import { ensureToolscreenJar } from '../tools/toolscreen'
import { createKeyedQueue } from '../keyed-queue'
import { logFailure, pushLog } from '../log'
import { paths } from '../paths'
import { store } from '../store'
import { BUSY_STATES, sendProgress, setState, states, writeInstalledVersion } from './instance-state'
import { getIndex } from './pack-index'
import { prismRoot, syncPrismInstance } from './prism-settings'

const syncQueue = createKeyedQueue<InstanceId>(['ranked', 'rsg', 'zsg'])
export const installQueue = createKeyedQueue<InstanceId>(['ranked', 'rsg', 'zsg'])

export { getIndex, refreshIndex } from './pack-index'

export const EXTRA_OPTIONS_MOD = {
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

export async function installInstanceMod(
  gameDir: string,
  id: InstanceId,
  mod: { file: string; urls: string[]; sha512?: string },
  label: string
): Promise<void> {
  sendProgress({ instance: id, phase: 'mods', fraction: null, message: `Installing ${label}…` })
  await installModJar(join(gameDir, 'mods'), mod)
}

export function runSyncMaps(id: InstanceId, label: string): Promise<string[]> {
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
  } catch (e) {
    logFailure('Could not copy the SeedQueue wall packs', e)
  }
}

export async function ensureInstanceExtras(id: InstanceId, gameDir: string): Promise<void> {
  try {
    const hotbar = join(gameDir, 'hotbar.nbt')
    if (!existsSync(hotbar)) copyFileSync(paths.resource('hotbar.nbt'), hotbar)
  } catch (e) {
    logFailure('Could not copy the default hotbar', e)
  }
  if (id === 'rsg' || id === 'zsg') ensureWalls(gameDir)
  await runSyncMaps(id, 'Practice maps')
}

export function installInstance(
  id: InstanceId,
  importFrom: InstanceId | null = null,
  importFolder: string | null = null,
  importWorlds: string[] = []
): Promise<void> {
  return installQueue.run(id, () => doInstallInstance(id, importFrom, importFolder, importWorlds))
}

async function doInstallInstance(
  id: InstanceId,
  importFrom: InstanceId | null,
  importFolder: string | null,
  importWorlds: string[]
): Promise<void> {
  if (BUSY_STATES.includes(states[id].state) || prismSessionActive(prismRoot(id))) {
    throw new Error('Close the game and wait for this instance to finish before reinstalling it.')
  }
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

    let latestRanked = false
    if (id === 'ranked') {
      sendProgress({ instance: id, phase: 'mods', fraction: null, message: 'Installing the latest MCSR Ranked mod…' })
      try {
        const v = await installLatestRankedMod(gameDir)
        latestRanked = true
        pushLog('system', `MCSR Ranked ${v} installed from Modrinth.`)
      } catch (e) {
        pushLog('system', `Latest Ranked mod fetch failed; using the pack version. ${e instanceof Error ? e.message : e}`)
      }
    }

    sendProgress({ instance: id, phase: 'mods', fraction: 0, message: 'Installing mods…' })
    const packPaths = await installPackFiles(index, gameDir, {
      excludePrefixes: id === 'rsg' || id === 'zsg' ? RSG_EXCLUDE_PREFIXES : latestRanked ? ['mcsrranked'] : [],
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

    writeInstalledVersion(id, index.versionId)
    await syncPrismInstance(id, fabric, true)
    setState(id, { state: 'ready', versionId: index.versionId })
  } catch (e) {
    setState(id, { state: 'error', error: String(e instanceof Error ? e.message : e) })
    throw e
  }
}

export async function deleteInstance(id: InstanceId): Promise<void> {
  if (BUSY_STATES.includes(states[id].state) || prismSessionActive(prismRoot(id))) {
    throw new Error('Close the game before deleting this instance.')
  }
  detachPrismInstance(prismRoot(id), id, gmll.gameDir(id))
  removeLinkIfPresent(join(paths.instanceDir(id), 'libraries'))
  removeLinkIfPresent(join(paths.instanceDir(id), 'assets'))
  setState(id, { state: 'installing' })
  try {
    await rm(paths.instanceDir(id), { recursive: true, force: true })
  } catch (error) {
    setState(id, { state: 'error', error: String(error) })
    throw error
  }
  setState(id, { state: 'not-installed', versionId: undefined, error: undefined })
}
