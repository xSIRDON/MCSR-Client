import { app } from 'electron'
import { existsSync, renameSync, mkdirSync, copyFileSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { InstanceId } from '../shared/types'

const DATA_DIR = 'data'

function installBase(): string {
  return app.isPackaged ? dirname(app.getPath('exe')) : app.getAppPath()
}

function sessionDir(): string {
  return app.getPath('userData')
}

function rootDir(): string {
  return join(sessionDir(), DATA_DIR)
}

export function migrateDataDir(): void {
  const current = rootDir()
  const sources = [
    join(installBase(), DATA_DIR),
    join(app.getPath('appData'), 'MCSR-Client')
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
        }
      }
    }
    return
  }
}

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
      try {
        copyFileSync(from, to)
        unlinkSync(from)
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
  tools: () => join(rootDir(), 'tools'),
  configFile: () => join(sessionDir(), 'config.json'),
  secretsFile: () => join(sessionDir(), 'secrets.json'),
  resource: (name: string): string =>
    app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), 'resources', name)
}
