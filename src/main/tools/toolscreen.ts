import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '../paths'
import { fetchVerified, sha512Of } from '../security/verified-download'

const TOOLSCREEN_JAR = 'Toolscreen.jar'
const JAR_URL =
  'https://github.com/jojoe77777/Toolscreen/releases/download/v1.4.7/Toolscreen-1.4.7-double-click-me.jar'
const JAR_SHA512 =
  '4e80ed61772e556e8be23882af9b60bddfffda297b25edb815a56269b4eec05a2a2a4d0fadf734af746381ffed73b70a80571c0f9645d956fddf50e2bad9c6a4'

function cachedJar(): string {
  return join(paths.tools(), TOOLSCREEN_JAR)
}

function isPinnedJar(file: string): boolean {
  try {
    return existsSync(file) && sha512Of(readFileSync(file)) === JAR_SHA512
  } catch {
    return false
  }
}

async function fetchCached(): Promise<string> {
  const dst = cachedJar()
  if (isPinnedJar(dst)) return dst
  mkdirSync(paths.tools(), { recursive: true })
  writeFileSync(dst, await fetchVerified(JAR_URL, JAR_SHA512, 'Toolscreen'))
  return dst
}

export async function ensureToolscreenJar(gameDir: string): Promise<void> {
  const cached = await fetchCached()
  const inInstance = join(gameDir, TOOLSCREEN_JAR)
  if (isPinnedJar(inInstance)) return
  try {
    mkdirSync(gameDir, { recursive: true })
    copyFileSync(cached, inInstance)
  } catch (e) {
    if (!existsSync(inInstance)) throw e
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
