// Bundled Toolscreen (screen-mirror / window-resize injector). On an instance's first
// install we drop its installer into that instance's folder and run it there — Toolscreen
// stages itself into the instance and self-updates on later launches. Windows-only.

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

/**
 * First-install step for Toolscreen: download its installer into the instance folder and
 * run it from there so it targets this instance. Marks the instance afterwards so it never
 * re-runs (Toolscreen self-updates from then on). Windows-only and interactive — the player
 * clicks through and accepts the Defender prompt. Idempotent.
 */
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

  // Run the installer from inside the instance folder so it installs into this instance.
  await new Promise<void>((resolve) => {
    const child = spawn(exePath, [], { cwd: instanceDir, detached: false, stdio: 'ignore' })
    child.on('exit', () => resolve())
    child.on('error', () => resolve())
  })

  // The GUI installer gives no success signal, so mark after it exits (best effort).
  try {
    writeFileSync(markerPath(id), 'installed\n')
  } catch {
    /* non-fatal */
  }
}
