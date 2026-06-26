import { app } from 'electron'
import { existsSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { InstanceId } from '../shared/types'

const DATA_DIR = 'data'

/** Where the client itself lives: the project root in dev, beside the exe when packaged. */
function installBase(): string {
  return app.isPackaged ? dirname(app.getPath('exe')) : app.getAppPath()
}

// All data lives in a `data/` folder next to the client install — easy to find,
// and portable for the eventual installer.
function rootDir(): string {
  return join(installBase(), DATA_DIR)
}

/**
 * One-time move of an older data location (the legacy %APPDATA% folders) into the
 * new next-to-install `data/` dir, so existing installs aren't re-downloaded. Run
 * before anything touches the data root. The shared libraries/assets junctions
 * inside instances are absolute and are rebuilt on next launch (clearSharedLinks).
 */
export function migrateDataDir(): void {
  const current = rootDir()
  if (existsSync(current)) return
  const legacy = [join(app.getPath('appData'), 'MCSR-Client')]
  for (const old of legacy) {
    if (existsSync(old)) {
      try {
        renameSync(old, current)
        return
      } catch {
        // cross-volume / locked — fall through; the app re-provisions cleanly.
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
  configFile: () => join(rootDir(), 'config.json'),
  secretsFile: () => join(rootDir(), 'secrets.json'),
  /** A bundled resource (resources/ in dev, process.resourcesPath when packaged). */
  resource: (name: string): string =>
    app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), 'resources', name)
}
