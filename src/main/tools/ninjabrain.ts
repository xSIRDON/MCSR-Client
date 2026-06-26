// Bundled Ninjabrain Bot (stronghold calculator). On instance install we download the
// jar into data/tools and drop a "Ninjabrain Bot" shortcut on the desktop so the player
// can launch it.

import { app, shell } from 'electron'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '../paths'

export const NINJABRAIN_JAR = 'Ninjabrain-Bot-1.5.2.jar'
const DOWNLOAD =
  'https://github.com/Ninjabrain1/Ninjabrain-Bot/releases/download/1.5.2/Ninjabrain-Bot-1.5.2.jar'

function jarPath(): string {
  return join(paths.tools(), NINJABRAIN_JAR)
}

async function downloadJar(): Promise<void> {
  mkdirSync(paths.tools(), { recursive: true })
  const res = await fetch(DOWNLOAD, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Ninjabrain Bot download failed (${res.status})`)
  writeFileSync(jarPath(), Buffer.from(await res.arrayBuffer()))
}

/** Create/refresh a "Ninjabrain Bot" desktop shortcut. Windows-only, best effort. */
export function createDesktopShortcut(): void {
  if (process.platform !== 'win32') return
  try {
    const lnk = join(app.getPath('desktop'), 'Ninjabrain Bot.lnk')
    // Targeting the jar opens it with the Java (.jar) association the player already
    // has — Ninjabrain needs Java to run, so it's present.
    shell.writeShortcutLink(lnk, {
      target: jarPath(),
      cwd: paths.tools(),
      description: 'Ninjabrain Bot — stronghold calculator'
    })
  } catch {
    // a missing .jar association or a locked desktop must never break an install
  }
}

/**
 * Download Ninjabrain Bot (once) and add a desktop shortcut. Idempotent: a present jar
 * just refreshes the shortcut.
 */
export async function setupNinjabrain(): Promise<void> {
  if (!existsSync(jarPath())) await downloadJar()
  createDesktopShortcut()
}

/**
 * True if a Ninjabrain Bot process is already running. Filtered to java/javaw so the query's own
 * powershell process can't match itself (the bug that made earlier "already running" checks
 * misfire). Best-effort and fails open (false), so we never refuse to open the tool.
 */
function isRunning(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "@(Get-CimInstance Win32_Process -Filter \"Name='javaw.exe' OR Name='java.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*Ninjabrain-Bot*' }).Count"
      ],
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => resolve(!err && parseInt(String(stdout).trim(), 10) > 0)
    )
  })
}

/**
 * Open Ninjabrain Bot alongside the game, unless it's already running. Spawned detached with a
 * Java 17+ launcher. Best-effort — never blocks or breaks the game launch.
 */
export async function launchNinjabrain(javaw = 'javaw'): Promise<ChildProcess | null> {
  if (!existsSync(jarPath())) await downloadJar()
  if (await isRunning()) return null
  const child = spawn(javaw, ['-jar', jarPath()], {
    cwd: paths.tools(),
    detached: true,
    stdio: 'ignore'
  })
  child.on('error', () => {
    /* javaw missing/blocked — the desktop shortcut still works as a fallback */
  })
  child.unref()
  return child
}

/**
 * Close Ninjabrain Bot — kills any java/javaw process running the Ninjabrain jar (more reliable
 * than tracking the one child, which misses an instance left open by an earlier launch). Filtered
 * to java processes so the query can't match its own powershell. Best-effort, Windows-only.
 */
export function killNinjabrain(): void {
  if (process.platform !== 'win32') return
  execFile(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='javaw.exe' OR Name='java.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*Ninjabrain-Bot*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
    ],
    { windowsHide: true, timeout: 5000 },
    () => {}
  )
}
