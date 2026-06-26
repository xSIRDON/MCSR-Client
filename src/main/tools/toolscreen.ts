import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '../paths'

const TOOLSCREEN_JAR = 'Toolscreen.jar'
const JAR_URL =
  'https://github.com/jojoe77777/Toolscreen/releases/download/v1.4.4/Toolscreen-1.4.4-double-click-me.jar'

function jarPath(): string {
  return join(paths.tools(), TOOLSCREEN_JAR)
}

export async function ensureToolscreenJar(): Promise<void> {
  if (existsSync(jarPath())) return
  mkdirSync(paths.tools(), { recursive: true })
  const res = await fetch(JAR_URL, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Toolscreen download failed (${res.status})`)
  writeFileSync(jarPath(), Buffer.from(await res.arrayBuffer()))
}

export async function spawnToolscreenWatcher(javaw = 'javaw'): Promise<void> {
  if (process.platform !== 'win32') return
  await ensureToolscreenJar()
  const child = spawn(javaw, ['-jar', jarPath(), '--prelaunch'], {
    cwd: paths.tools(),
    detached: true,
    stdio: 'ignore'
  })
  child.on('error', () => {
  })
  child.unref()
}
