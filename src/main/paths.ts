import { app } from 'electron'
import { join } from 'node:path'
import type { InstanceId } from '../shared/types'

// All Obsidian data lives under %APPDATA%/Obsidian (or the platform equivalent).
function rootDir(): string {
  // app.getPath('appData') -> %APPDATA% on Windows.
  return join(app.getPath('appData'), 'Obsidian')
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
  secretsFile: () => join(rootDir(), 'secrets.json')
}
