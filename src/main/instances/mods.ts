// Reads and toggles the mods inside an instance's mods/ folder.
// A disabled mod is parked as "<jar>.disabled" so the loader ignores it while we
// keep it on disk. Names/versions are derived heuristically from the filename.

import { existsSync, readdirSync, renameSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ModInfo } from '../../shared/types'
import { verifyBuffer } from './mrpack'

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

/** True if an extra-options jar is present in `modsDir` (enabled or parked as .disabled). */
export function hasExtraOptions(modsDir: string): boolean {
  return listMods(modsDir).some((m) => m.name.toLowerCase() === 'extra-options')
}
