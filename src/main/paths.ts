import { app } from 'electron'
import { existsSync, renameSync, mkdirSync, copyFileSync, unlinkSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { isInstanceId, type InstanceId } from '../shared/types'
import { logFailure } from './log'

const DATA_DIR = 'data'

function assertId(id: InstanceId): InstanceId {
  if (!isInstanceId(id)) throw new Error(`Unknown instance: ${String(id)}`)
  return id
}

function installBase(): string {
  return app.isPackaged ? dirname(app.getPath('exe')) : app.getAppPath()
}

function sessionDir(): string {
  return app.getPath('userData')
}

const LOCATION_FILE = 'data-location.txt'
let chosenRoot: string | null | undefined

export function defaultRoot(): string {
  return join(sessionDir(), DATA_DIR)
}

function rootDir(): string {
  if (chosenRoot === undefined) {
    try {
      const saved = readFileSync(join(sessionDir(), LOCATION_FILE), 'utf8').trim()
      chosenRoot = saved && isAbsolute(saved) ? saved : null
    } catch {
      chosenRoot = null
    }
  }
  return chosenRoot ?? defaultRoot()
}

export function setDataLocation(dir: string): void {
  const file = join(sessionDir(), LOCATION_FILE)
  if (resolve(dir).toLowerCase() === resolve(defaultRoot()).toLowerCase()) {
    rmSync(file, { force: true })
    chosenRoot = null
    return
  }
  const tmp = file + '.tmp'
  writeFileSync(tmp, resolve(dir), 'utf8')
  renameSync(tmp, file)
  chosenRoot = resolve(dir)
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
        } catch (e) {
          logFailure(`Could not move ${from} to ${to}`, e)
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
      } catch (e) {
        logFailure(`Could not move ${name} out of the install folder`, e)
      }
    }
  }
}

export const paths = {
  root: rootDir,
  runtime: () => join(rootDir(), 'runtime'),
  shared: () => join(rootDir(), 'shared'),
  instances: () => join(rootDir(), 'instances'),
  instanceDir: (id: InstanceId) => join(rootDir(), 'instances', assertId(id)),
  gameDir: (id: InstanceId) => join(rootDir(), 'instances', assertId(id), '.minecraft'),
  tracker: () => join(rootDir(), 'tracker'),
  tools: () => join(rootDir(), 'tools'),
  configFile: () => join(sessionDir(), 'config.json'),
  secretsFile: () => join(sessionDir(), 'secrets.json'),
  resource: (name: string): string =>
    app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), 'resources', name)
}
