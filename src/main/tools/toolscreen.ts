import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '../paths'
import { fetchVerified } from '../security/verified-download'

const TOOLSCREEN_JAR = 'Toolscreen.jar'
const JAR_URL =
  'https://github.com/jojoe77777/Toolscreen/releases/download/v1.4.4/Toolscreen-1.4.4-double-click-me.jar'
const JAR_SHA512 =
  'f8f93edc11b0dff1e51990b4d641733d0a6fcde0d2b82b14cc650ae46484355d77816ccf6da55c389d67c4562ffc3906ba22d4ed5d06570537afd2a354c38e5f'

function cachedJar(): string {
  return join(paths.tools(), TOOLSCREEN_JAR)
}

async function fetchCached(): Promise<string> {
  const dst = cachedJar()
  if (existsSync(dst)) return dst
  mkdirSync(paths.tools(), { recursive: true })
  writeFileSync(dst, await fetchVerified(JAR_URL, JAR_SHA512, 'Toolscreen'))
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
