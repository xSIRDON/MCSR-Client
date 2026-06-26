import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { InstanceId } from '../../shared/types'
import { paths } from '../paths'

const TOOLSCREEN_EXE = 'Toolscreen-1.4.4-double-click-me.exe'
const DOWNLOAD =
  'https://github.com/jojoe77777/Toolscreen/releases/download/v1.4.4/Toolscreen-1.4.4-double-click-me.exe'

function markerPath(id: InstanceId): string {
  return join(paths.instanceDir(id), '.toolscreen-installed')
}

export function isSetUp(id: InstanceId): boolean {
  return existsSync(markerPath(id))
}

export async function setupToolscreen(id: InstanceId): Promise<void> {
  if (process.platform !== 'win32') return
  if (isSetUp(id)) return

  const instanceDir = paths.instanceDir(id)
  mkdirSync(instanceDir, { recursive: true })
  const exePath = join(instanceDir, TOOLSCREEN_EXE)

  if (!existsSync(exePath)) {
    const res = await fetch(DOWNLOAD, { redirect: 'follow' })
    if (!res.ok) throw new Error(`Toolscreen download failed (${res.status})`)
    writeFileSync(exePath, Buffer.from(await res.arrayBuffer()))
  }

  await new Promise<void>((resolve) => {
    const child = spawn(exePath, [], { cwd: instanceDir, detached: false, stdio: 'ignore' })
    child.on('exit', () => resolve())
    child.on('error', () => resolve())
  })

  try {
    writeFileSync(markerPath(id), 'installed\n')
  } catch {
  }
}
