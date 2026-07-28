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
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '../paths'
import { fetchVerified } from '../security/verified-download'

const TOOLSCREEN_JAR = 'Toolscreen.jar'
const JAR_URL =
  'https://github.com/jojoe77777/Toolscreen/releases/download/v1.4.4/Toolscreen-1.4.4-double-click-me.jar'
// Pinned: this jar is executed with javaw, and a GitHub release asset can be replaced in
// place. A swapped artifact must fail loudly rather than run.
const JAR_SHA512 =
  'f8f93edc11b0dff1e51990b4d641733d0a6fcde0d2b82b14cc650ae46484355d77816ccf6da55c389d67c4562ffc3906ba22d4ed5d06570537afd2a354c38e5f'

/** Shared download cache so we fetch the jar once, then copy it into each instance. */
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

/**
 * Ensure Toolscreen.jar sits inside this instance's game dir — the watcher derives its set of
 * acceptable game working-directories from where this jar lives, so it must be here.
 */
export async function ensureToolscreenJar(gameDir: string): Promise<void> {
  const cached = await fetchCached()
  const inInstance = join(gameDir, TOOLSCREEN_JAR)
  if (!existsSync(inInstance)) {
    mkdirSync(gameDir, { recursive: true })
    copyFileSync(cached, inInstance)
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
