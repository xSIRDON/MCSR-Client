import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '../paths'

const TOOLSCREEN_JAR = 'Toolscreen.jar'
const JAR_URL =
  'https://github.com/jojoe77777/Toolscreen/releases/download/v1.4.4/Toolscreen-1.4.4-double-click-me.jar'

function cachedJar(): string {
  return join(paths.tools(), TOOLSCREEN_JAR)
}

async function fetchCached(): Promise<string> {
  const dst = cachedJar()
  if (existsSync(dst)) return dst
  mkdirSync(paths.tools(), { recursive: true })
  const res = await fetch(JAR_URL, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Toolscreen download failed (${res.status})`)
  writeFileSync(dst, Buffer.from(await res.arrayBuffer()))
  return dst
}

export async function ensureToolscreenJar(gameDir: string): Promise<void> {
  const cached = await fetchCached()
  const inInstance = join(gameDir, TOOLSCREEN_JAR)
  if (!existsSync(inInstance)) {
    mkdirSync(gameDir, { recursive: true })
    copyFileSync(cached, inInstance)
  }
}

export async function spawnToolscreenWatcher(gameDir: string, javaw = 'javaw'): Promise<void> {
  if (process.platform !== 'win32') return
  await ensureToolscreenJar(gameDir)
  const child = spawn(javaw, ['-jar', join(gameDir, TOOLSCREEN_JAR), '--watcher'], {
    cwd: gameDir,
    detached: true,
    stdio: 'ignore'
  })
  child.on('error', () => {
  })
  child.unref()
}
