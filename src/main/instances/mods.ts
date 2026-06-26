// Reads and toggles the mods inside an instance's mods/ folder.
// A disabled mod is parked as "<jar>.disabled" so the loader ignores it while we
// keep it on disk. Names/versions are derived heuristically from the filename.

import { existsSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { ModInfo } from '../../shared/types'

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
