import { app } from 'electron'
import { existsSync, renameSync, mkdirSync, copyFileSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { InstanceId } from '../shared/types'

const DATA_DIR = 'data'

/** Where the client itself lives: the project root in dev, beside the exe when packaged. */
function installBase(): string {
  return app.isPackaged ? dirname(app.getPath('exe')) : app.getAppPath()
}

// All app data — instances, runtime, shared libs, bundled tools, skins — lives under userData.
// The NSIS updater wipes the whole install dir on every update (RMDir /r $INSTDIR), so anything
// kept next to the exe is deleted on update; userData is the one location it never touches.
function sessionDir(): string {
  return app.getPath('userData')
}

function rootDir(): string {
  return join(sessionDir(), DATA_DIR)
}

/**
 * Bring an older data location into the userData `data/` dir, so existing installs aren't
 * re-downloaded. Moves the heavy sub-folders individually and idempotently, so a lock on one
 * (or a half-finished earlier attempt that already created `data/`) never strands the rest.
 * Sources newest-first: the v0.x–1.0 next-to-install `data/`, then the legacy %APPDATA% folder.
 * The shared libraries/assets junctions are absolute and get rebuilt on next launch.
 */
export function migrateDataDir(): void {
  const current = rootDir()
  const sources = [
    join(installBase(), DATA_DIR), // v0.x–1.0: next to the exe
    join(app.getPath('appData'), 'MCSR-Client') // pre-0.x
  ]
  for (const old of sources) {
    if (old === current || !existsSync(old)) continue
    mkdirSync(current, { recursive: true })
    for (const sub of ['instances', 'shared', 'tools', 'tracker', 'runtime']) {
      const from = join(old, sub)
      const to = join(current, sub)
      if (existsSync(from) && !existsSync(to)) {
        try {
          renameSync(from, to)
        } catch {
          // locked / cross-volume — leave it; that piece re-provisions on next launch.
        }
      }
    }
    return // first source that exists wins
  }
}

/**
 * One-time move of session state (auth token + config) out of the install-dir `data/` folder
 * and into userData. The NSIS auto-updater deletes the whole install dir on update, so a token
 * stored there was lost on every update — signing the user out. userData survives updates.
 * Safe to call on every launch; only acts when an old file exists and the new one doesn't.
 */
export function migrateSessionState(): void {
  const dest = sessionDir()
  for (const name of ['secrets.json', 'config.json']) {
    const from = join(installBase(), DATA_DIR, name)
    const to = join(dest, name)
    if (!existsSync(from) || existsSync(to)) continue
    try {
      mkdirSync(dest, { recursive: true })
      renameSync(from, to)
    } catch {
      // Cross-volume (userData on C:, install elsewhere) — copy then remove the original.
      try {
        copyFileSync(from, to)
        unlinkSync(from)
      } catch {
        // Leave the original in place; the user re-signs-in / reconfigures once.
      }
    }
  }
}

export const paths = {
  root: rootDir,
  runtime: () => join(rootDir(), 'runtime'),
  shared: () => join(rootDir(), 'shared'),
  instances: () => join(rootDir(), 'instances'),
  instanceDir: (id: InstanceId) => join(rootDir(), 'instances', id),
  /** The .minecraft game directory for an instance. */
  gameDir: (id: InstanceId) => join(rootDir(), 'instances', id, '.minecraft'),
  tracker: () => join(rootDir(), 'tracker'),
  /** Bundled standalone tools (Ninjabrain Bot, etc.). */
  tools: () => join(rootDir(), 'tools'),
  // Session state in userData so it survives auto-updates (the install dir is wiped on update).
  configFile: () => join(sessionDir(), 'config.json'),
  secretsFile: () => join(sessionDir(), 'secrets.json'),
  /** Local DM cache — in userData so a friend's chat history survives auto-updates. */
  messagesFile: () => join(sessionDir(), 'friends-messages.json'),
  /** A bundled resource (resources/ in dev, process.resourcesPath when packaged). */
  resource: (name: string): string =>
    app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), 'resources', name)
}
