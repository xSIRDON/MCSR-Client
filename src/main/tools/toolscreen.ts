// Toolscreen (screen-mirror / overlay tool). Toolscreen injects an overlay DLL into the
// running Minecraft process via a background watcher (EasyInject). Launchers like Prism/MultiMC
// wire that watcher in as a pre-launch command; our client launches the game directly, so we
// spawn the watcher ourselves at launch.
//
// Two things the watcher requires that bit us before:
//  - It only injects into a game whose working directory matches the directory tree the WATCHER
//    JAR lives in. GMLL runs the game with cwd = the instance game dir, so the jar must live
//    THERE (not in a shared tools folder) or the watcher rejects our game.
//  - The game's command line must carry a launcher token; stock Minecraft 1.16.1 already does
//    (its JVM args include "...MojangTricksIntelDriversForPerformance..."), and the watcher's
//    check is case-insensitive — so no extra JVM arg is needed.
// Windows-only; the watcher jar needs a Java 17+ runtime (same one the other tools use).

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '../paths'
import { fetchVerified, sha512Of } from '../security/verified-download'

const TOOLSCREEN_JAR = 'Toolscreen.jar'
const JAR_URL =
  'https://github.com/jojoe77777/Toolscreen/releases/download/v1.4.7/Toolscreen-1.4.7-double-click-me.jar'
// Pinned: this jar is executed with javaw, and a GitHub release asset can be replaced in
// place. A swapped artifact must fail loudly rather than run.
const JAR_SHA512 =
  '4e80ed61772e556e8be23882af9b60bddfffda297b25edb815a56269b4eec05a2a2a4d0fadf734af746381ffed73b70a80571c0f9645d956fddf50e2bad9c6a4'

/** Shared download cache so we fetch the jar once, then copy it into each instance. */
function cachedJar(): string {
  return join(paths.tools(), TOOLSCREEN_JAR)
}

/** True when `file` exists and is exactly the pinned jar (older versions and partial writes fail). */
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

/**
 * Ensure Toolscreen.jar sits inside this instance's game dir — the watcher derives its set of
 * acceptable game working-directories from where this jar lives, so it must be here. An older
 * copy is replaced; if it can't be (a watcher from an earlier session still holds it open), the
 * existing jar keeps working for this launch.
 */
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

/**
 * Spawn the Toolscreen watcher (with cwd = the game dir, where the jar lives) so it injects the
 * overlay into the game we're about to launch. Detached and best-effort — never blocks or breaks
 * the launch. `javaw` must be a Java 17+ launcher.
 */
export async function spawnToolscreenWatcher(gameDir: string, javaw = 'javaw'): Promise<void> {
  if (process.platform !== 'win32') return
  await ensureToolscreenJar(gameDir)
  const child = spawn(javaw, ['-jar', join(gameDir, TOOLSCREEN_JAR), '--watcher'], {
    cwd: gameDir,
    detached: true,
    stdio: 'ignore'
  })
  child.on('error', () => {
    /* javaw missing/blocked — Toolscreen just won't load this session */
  })
  child.unref()
}
