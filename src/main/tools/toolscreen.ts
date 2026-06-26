// Toolscreen (screen-mirror / overlay tool). Toolscreen doesn't "install into a folder" — it
// injects an overlay DLL into the *running* Minecraft process via a background watcher
// (EasyInject). Launchers like Prism/MultiMC/Modrinth wire that watcher in as a pre-launch
// command; our client launches the game directly, so we play the launcher's role and spawn the
// watcher ourselves right before we start the game. It then waits for our Minecraft window and
// injects. Windows-only; the watcher jar needs a Java 17+ runtime (same one the other tools use).

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

/** Download the Toolscreen injector jar once into data/tools (idempotent). */
export async function ensureToolscreenJar(): Promise<void> {
  if (existsSync(jarPath())) return
  mkdirSync(paths.tools(), { recursive: true })
  const res = await fetch(JAR_URL, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Toolscreen download failed (${res.status})`)
  writeFileSync(jarPath(), Buffer.from(await res.arrayBuffer()))
}

/**
 * Spawn the Toolscreen watcher in pre-launch mode so it injects the overlay DLL into the
 * Minecraft process we're about to start. Detached and best-effort — it must never block or
 * break the game launch. On its first run Toolscreen prompts (UAC) to add the Windows Defender
 * exclusions its injected, unsigned DLLs need.
 *
 * @param javaw a Java 17+ launcher; defaults to `javaw` on PATH.
 */
export async function spawnToolscreenWatcher(javaw = 'javaw'): Promise<void> {
  if (process.platform !== 'win32') return
  await ensureToolscreenJar()
  // `--prelaunch` -> runLauncherMode: spawns a hidden watcher that waits for the game and injects.
  const child = spawn(javaw, ['-jar', jarPath(), '--prelaunch'], {
    cwd: paths.tools(),
    detached: true,
    stdio: 'ignore'
  })
  child.on('error', () => {
    /* javaw missing/blocked — Toolscreen just won't load this session */
  })
  child.unref()
}
