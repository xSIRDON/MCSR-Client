import { existsSync, readdirSync, renameSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { InstanceId, ModInfo } from '../../shared/types'
import { verifyBuffer } from './mrpack'

const DISABLED = '.disabled'

export function parseModFilename(file: string): { name: string; version: string } {
  const base = file.replace(/\.disabled$/i, '').replace(/\.jar$/i, '')
  const m = base.match(/^(.*?)[-_](\d.*)$/)
  if (m) return { name: m[1], version: m[2] }
  return { name: base, version: '' }
}

export function modFromFile(entry: string): ModInfo {
  const enabled = !entry.toLowerCase().endsWith(DISABLED)
  const jar = enabled ? entry : entry.slice(0, -DISABLED.length)
  const { name, version } = parseModFilename(jar)
  return { file: jar, name, version, enabled }
}

export function listMods(modsDir: string): ModInfo[] {
  if (!existsSync(modsDir)) return []
  return readdirSync(modsDir)
    .filter((f) => /\.jar(\.disabled)?$/i.test(f))
    .map(modFromFile)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function setModEnabled(modsDir: string, file: string, enabled: boolean): void {
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
  file: string
  urls: string[]
  sha512?: string
}

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

export function hasExtraOptions(modsDir: string): boolean {
  return listMods(modsDir).some((m) => m.name.toLowerCase() === 'extra-options')
}

export interface InstanceModState {
  id: InstanceId
  ready: boolean
  hasExtraOptions: boolean
}

export function shouldPromptExtraOptions(
  seen: boolean,
  states: InstanceModState[]
): { show: boolean; instances: InstanceId[] } {
  if (seen) return { show: false, instances: [] }
  const instances = states.filter((s) => s.ready && !s.hasExtraOptions).map((s) => s.id)
  return { show: instances.length > 0, instances }
}
