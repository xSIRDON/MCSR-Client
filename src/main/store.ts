import { safeStorage } from 'electron'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { paths } from './paths'
import { DEFAULT_CONFIG, type AppConfig } from '../shared/types'

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
    if (!config) config = readJson<AppConfig>(paths.configFile(), DEFAULT_CONFIG)
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
