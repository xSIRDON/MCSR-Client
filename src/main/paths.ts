import { app } from 'electron'
import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { InstanceId } from '../shared/types'

const DIR_NAME = 'MCSR-Client'
const LEGACY_DIR_NAME = 'Obsidian'

function rootDir(): string {
  return join(app.getPath('appData'), DIR_NAME)
}

export function migrateDataDir(): void {
  const legacy = join(app.getPath('appData'), LEGACY_DIR_NAME)
  const current = rootDir()
  if (existsSync(legacy) && !existsSync(current)) {
    try {
      renameSync(legacy, current)
    } catch {
    }
  }
}

export const paths = {
  root: rootDir,
  runtime: () => join(rootDir(), 'runtime'),
  shared: () => join(rootDir(), 'shared'),
  instances: () => join(rootDir(), 'instances'),
  instanceDir: (id: InstanceId) => join(rootDir(), 'instances', id),
  gameDir: (id: InstanceId) => join(rootDir(), 'instances', id, '.minecraft'),
  tracker: () => join(rootDir(), 'tracker'),
  configFile: () => join(rootDir(), 'config.json'),
  secretsFile: () => join(rootDir(), 'secrets.json'),
  resource: (name: string): string =>
    app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), 'resources', name)
}
