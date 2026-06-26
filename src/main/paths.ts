import { app } from 'electron'
import { existsSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { InstanceId } from '../shared/types'

const DATA_DIR = 'data'

function installBase(): string {
  return app.isPackaged ? dirname(app.getPath('exe')) : app.getAppPath()
}

function rootDir(): string {
  return join(installBase(), DATA_DIR)
}

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
  gameDir: (id: InstanceId) => join(rootDir(), 'instances', id, '.minecraft'),
  tracker: () => join(rootDir(), 'tracker'),
  configFile: () => join(rootDir(), 'config.json'),
  secretsFile: () => join(rootDir(), 'secrets.json'),
  resource: (name: string): string =>
    app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), 'resources', name)
}
