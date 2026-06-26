import { app } from 'electron'
import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { InstanceId } from '../shared/types'

const DIR_NAME = 'MCSR-Client'
const LEGACY_DIR_NAME = 'Obsidian'

// All MCSR Client data lives under %APPDATA%/MCSR-Client (or the platform equivalent).
function rootDir(): string {
  // app.getPath('appData') -> %APPDATA% on Windows.
  return join(app.getPath('appData'), DIR_NAME)
}

/**
 * One-time move of the legacy %APPDATA%/Obsidian data folder to the new name so
 * existing installs (game files, config, saved login) survive the rename instead
 * of re-downloading. Run before anything touches the data root. The shared
 * libraries/assets junctions inside instances are absolute and are rebuilt on the
 * next launch (see clearSharedLinks in the launcher).
 */
export function migrateDataDir(): void {
  const legacy = join(app.getPath('appData'), LEGACY_DIR_NAME)
  const current = rootDir()
  if (existsSync(legacy) && !existsSync(current)) {
    try {
      renameSync(legacy, current)
    } catch {
      // Best effort: if the move fails, the app re-provisions into the new dir.
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
