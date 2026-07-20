import { safeStorage } from 'electron'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { paths } from './paths'
import { DEFAULT_CONFIG, type AppConfig, type InstanceId } from '../shared/types'

type RawConfig = {
  ram?: Partial<Record<InstanceId, number>>
  java?: Partial<Record<InstanceId, string | null>>
  maps?: Partial<Record<InstanceId, string[]>>
  /** Legacy single global RAM value, migrated to per-instance. */
  ramMb?: number
  seedQueueOverride?: string | null
  pacemanName?: string | null
  ninjabrain?: boolean
  toolscreen?: boolean
  favorites?: unknown[]
  friendsServerUrl?: string | null
  extraOptionsPromptSeen?: boolean
}

/** Coerce a stored (possibly legacy) config into the current AppConfig shape. */
function normalizeConfig(raw: RawConfig): AppConfig {
  const legacy = typeof raw.ramMb === 'number' ? raw.ramMb : undefined
  return {
    ram: {
      ranked: raw.ram?.ranked ?? legacy ?? DEFAULT_CONFIG.ram.ranked,
      rsg: raw.ram?.rsg ?? legacy ?? DEFAULT_CONFIG.ram.rsg,
      zsg: raw.ram?.zsg ?? legacy ?? DEFAULT_CONFIG.ram.zsg
    },
    java: {
      ranked: raw.java?.ranked ?? null,
      rsg: raw.java?.rsg ?? null,
      zsg: raw.java?.zsg ?? null
    },
    maps: {
      ranked: raw.maps?.ranked ?? [...DEFAULT_CONFIG.maps.ranked],
      rsg: raw.maps?.rsg ?? [...DEFAULT_CONFIG.maps.rsg],
      zsg: raw.maps?.zsg ?? [...DEFAULT_CONFIG.maps.zsg]
    },
    seedQueueOverride:
      typeof raw.seedQueueOverride === 'string'
        ? raw.seedQueueOverride
        : DEFAULT_CONFIG.seedQueueOverride,
    pacemanName: typeof raw.pacemanName === 'string' ? raw.pacemanName : DEFAULT_CONFIG.pacemanName,
    ninjabrain: typeof raw.ninjabrain === 'boolean' ? raw.ninjabrain : DEFAULT_CONFIG.ninjabrain,
    toolscreen: typeof raw.toolscreen === 'boolean' ? raw.toolscreen : DEFAULT_CONFIG.toolscreen,
    favorites: Array.isArray(raw.favorites)
      ? raw.favorites.filter((f): f is string => typeof f === 'string')
      : [...DEFAULT_CONFIG.favorites],
    friendsServerUrl:
      typeof raw.friendsServerUrl === 'string' && raw.friendsServerUrl
        ? raw.friendsServerUrl
        : DEFAULT_CONFIG.friendsServerUrl,
    extraOptionsPromptSeen:
      typeof raw.extraOptionsPromptSeen === 'boolean'
        ? raw.extraOptionsPromptSeen
        : DEFAULT_CONFIG.extraOptionsPromptSeen
  }
}

function ensureDir(file: string): void {
  mkdirSync(dirname(file), { recursive: true })
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback
    return { ...fallback, ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<T>) }
  } catch {
    return fallback
  }
}

function writeJson(file: string, value: unknown): void {
  ensureDir(file)
  writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
}

// --- App config (non-secret) ---
let config: AppConfig | null = null

export const store = {
  getConfig(): AppConfig {
    if (!config) config = normalizeConfig(readJson<RawConfig>(paths.configFile(), {}))
    return config
  },
  setConfig(patch: Partial<AppConfig>): AppConfig {
    config = { ...this.getConfig(), ...patch }
    writeJson(paths.configFile(), config)
    return config
  },

  // --- Secrets (encrypted via OS keychain through safeStorage) ---
  secret: {
    set(key: string, value: string): void {
      const all = readJson<Record<string, string>>(paths.secretsFile(), {})
      const enc = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(value).toString('base64')
        : Buffer.from(value, 'utf8').toString('base64')
      all[key] = enc
      writeJson(paths.secretsFile(), all)
    },
    get(key: string): string | null {
      const all = readJson<Record<string, string>>(paths.secretsFile(), {})
      const raw = all[key]
      if (!raw) return null
      try {
        const buf = Buffer.from(raw, 'base64')
        return safeStorage.isEncryptionAvailable()
          ? safeStorage.decryptString(buf)
          : buf.toString('utf8')
      } catch {
        return null
      }
    },
    delete(key: string): void {
      const all = readJson<Record<string, string>>(paths.secretsFile(), {})
      delete all[key]
      writeJson(paths.secretsFile(), all)
    }
  }
}
