// Reads and toggles the mods inside an instance's mods/ folder.
// A disabled mod is parked as "<jar>.disabled" so the loader ignores it while we
// keep it on disk. Names/versions are derived heuristically from the filename.

import { existsSync, readdirSync, renameSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { InstanceId, ModInfo } from '../../shared/types'
import { assertTrustedDownloadUrl, verifyBuffer, type PackModUpgrade } from './mrpack'

const DISABLED = '.disabled'

/** Split a jar filename into a mod name + version using common naming patterns. */
export function parseModFilename(file: string): { name: string; version: string } {
  const base = file.replace(/\.disabled$/i, '').replace(/\.jar$/i, '')
  // The version starts at the first '-' or '_' that is followed by a digit.
  const m = base.match(/^(.*?)[-_](\d.*)$/)
  if (m) return { name: m[1], version: m[2] }
  return { name: base, version: '' }
}

/** Build a ModInfo from a raw directory entry (which may carry a .disabled suffix). */
export function modFromFile(entry: string): ModInfo {
  const enabled = !entry.toLowerCase().endsWith(DISABLED)
  const jar = enabled ? entry : entry.slice(0, -DISABLED.length)
  const { name, version } = parseModFilename(jar)
  return { file: jar, name, version, enabled }
}

/** List every mod jar in `modsDir`, enabled and disabled, sorted by name. */
export function listMods(modsDir: string): ModInfo[] {
  if (!existsSync(modsDir)) return []
  return readdirSync(modsDir)
    .filter((f) => /\.jar(\.disabled)?$/i.test(f))
    .map(modFromFile)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Enable or disable a mod by toggling its ".disabled" suffix. `file` is the base
 * jar filename (no suffix). No-op if the target state is already in place.
 */
export function setModEnabled(modsDir: string, file: string, enabled: boolean): void {
  // `file` crosses the IPC boundary, and join() collapses "../" — without this an
  // arbitrary path could be renamed to "<path>.disabled". listMods only ever yields
  // bare ".jar" basenames, so legitimate callers are unaffected.
  if (file !== basename(file) || !/\.jar$/i.test(file)) {
    throw new Error(`Invalid mod file: ${file}`)
  }
  const jar = join(modsDir, file)
  const disabled = jar + DISABLED
  if (enabled) {
    if (existsSync(disabled)) renameSync(disabled, jar)
  } else {
    if (existsSync(jar)) renameSync(jar, disabled)
  }
}

export type FetchBuffer = (url: string) => Promise<Buffer>

const nodeFetchBuffer: FetchBuffer = async (url) => {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`download failed ${res.status} for ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

export interface JarMod {
  /** Destination filename inside mods/. */
  file: string
  /** Mirror URLs, tried in order until one downloads and verifies. */
  urls: string[]
  /** Expected sha512 (hex); when set, a downloaded jar must match or it's rejected. */
  sha512?: string
}

/**
 * Download a single mod jar into `modsDir`, verifying its sha512 when provided.
 * Idempotent: if the jar (or its ".disabled" twin) is already present it does nothing
 * and returns false. Tries each URL until one downloads and verifies; returns true when a
 * jar was written, throws if every URL fails.
 */
export async function installModJar(
  modsDir: string,
  mod: JarMod,
  fetchBuffer: FetchBuffer = nodeFetchBuffer
): Promise<boolean> {
  mkdirSync(modsDir, { recursive: true })
  const dest = join(modsDir, mod.file)
  if (existsSync(dest) || existsSync(dest + DISABLED)) return false
  let lastErr: unknown
  for (const url of mod.urls) {
    try {
      const buf = await fetchBuffer(url)
      if (mod.sha512) verifyBuffer(buf, { sha512: mod.sha512 })
      writeFileSync(dest, buf)
      return true
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(`Failed to install ${mod.file}: ${String(lastErr)}`)
}

/**
 * Delete other versions of the mods that were just installed — `installed` is their jar names.
 * The pack is rewritten on every update without clearing mods/, so without this a version bump
 * leaves two jars of one mod behind and Fabric refuses to start. Parked (.disabled) copies of an
 * old version go too. Returns the removed file names.
 */
export function pruneSupersededMods(modsDir: string, installed: string[]): string[] {
  if (!existsSync(modsDir)) return []
  const keep = new Set(installed.map((f) => f.toLowerCase()))
  const names = new Set(installed.map((f) => parseModFilename(f).name.toLowerCase()))
  const removed: string[] = []
  for (const entry of readdirSync(modsDir)) {
    if (!/\.jar(\.disabled)?$/i.test(entry)) continue
    const mod = modFromFile(entry)
    if (keep.has(mod.file.toLowerCase()) || !names.has(mod.name.toLowerCase())) continue
    try {
      rmSync(join(modsDir, entry), { force: true })
      removed.push(entry)
    } catch {
      // locked by a running game — the next install tries again
    }
  }
  return removed
}

/**
 * Apply PACK_MOD_UPGRADES to an installed instance without a full reinstall: for each superseded
 * jar still in mods/, fetch the newer build (hash-checked), keep the old jar's enabled/disabled
 * state, then drop the old jar. Returns the jar names installed.
 */
export async function upgradeInstalledMods(
  modsDir: string,
  upgrades: readonly PackModUpgrade[],
  fetchBuffer: FetchBuffer = nodeFetchBuffer
): Promise<string[]> {
  const done: string[] = []
  for (const up of upgrades) {
    const oldJar = join(modsDir, basename(up.replaces))
    const wasEnabled = existsSync(oldJar)
    if (!wasEnabled && !existsSync(oldJar + DISABLED)) continue
    const file = basename(up.path)
    const dest = join(modsDir, file) + (wasEnabled ? '' : DISABLED)
    if (!existsSync(join(modsDir, file)) && !existsSync(join(modsDir, file) + DISABLED)) {
      let buf: Buffer | null = null
      let lastErr: unknown
      for (const url of up.urls) {
        try {
          const got = await fetchBuffer(assertTrustedDownloadUrl(url))
          verifyBuffer(got, { sha512: up.sha512 })
          buf = got
          break
        } catch (e) {
          lastErr = e
        }
      }
      if (!buf) throw new Error(`Failed to update to ${file}: ${String(lastErr)}`)
      writeFileSync(dest, buf)
      done.push(file)
    }
    rmSync(oldJar, { force: true })
    rmSync(oldJar + DISABLED, { force: true })
  }
  return done
}

/** True if an extra-options jar is present in `modsDir` (enabled or parked as .disabled). */
export function hasExtraOptions(modsDir: string): boolean {
  return listMods(modsDir).some((m) => m.name.toLowerCase() === 'extra-options')
}

/** Precomputed per-instance facts the prompt-eligibility check needs. */
export interface InstanceModState {
  id: InstanceId
  ready: boolean
  hasExtraOptions: boolean
}

/**
 * Decide whether to show the one-time "add extra-options" prompt. Show it when the prompt
 * hasn't been answered and at least one installed (ready) instance is missing extra-options;
 * `instances` is exactly those installed-and-missing instances.
 */
export function shouldPromptExtraOptions(
  seen: boolean,
  states: InstanceModState[]
): { show: boolean; instances: InstanceId[] } {
  if (seen) return { show: false, instances: [] }
  const instances = states.filter((s) => s.ready && !s.hasExtraOptions).map((s) => s.id)
  return { show: instances.length > 0, instances }
}
