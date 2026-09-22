// Manages the standalone paceman-tracker — no Julti/Jingle required.
// The tracker reads SpeedRunIGT records and uploads splits to paceman.gg.
// We write the access key into its options.json and run the jar (with its window, or headless with
// `--nogui`), starting it alongside an RSG launch and stopping it when the game or the client closes.

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { paths } from '../paths'
import { fetchVerified } from '../security/verified-download'
import { store } from '../store'
import type { TrackerStatus } from '../../shared/types'

const KEY_SECRET = 'paceman-key'
export const TRACKER_JAR = 'paceman-tracker-0.7.3.jar'
const TRACKER_DOWNLOAD =
  'https://github.com/PaceMan-MCSR/PaceMan-Tracker/releases/download/v0.7.3/paceman-tracker-0.7.3.jar'
// Pinned: this jar is executed with java alongside every RSG launch.
const TRACKER_SHA512 =
  'fe756f6b1f97ae4f32952701f58e9150a579c7ef1278959f77eadd5707a64c6dbc9597a1039f65b60b530281a069fa59aba546e17a7a44082497f3b0741bcb07'

/**
 * The tracker's command line. It matches flags literally: headless is `--nogui` (a bare `nogui`
 * is ignored, which is why its window used to open no matter what). With its window shown,
 * `--noreopen` makes a second copy exit quietly instead of popping an "already opened" dialog —
 * e.g. when one outlived an earlier session.
 */
export function trackerArgs(jar: string, showWindow: boolean): string[] {
  return ['-jar', jar, showWindow ? '--noreopen' : '--nogui']
}

let proc: ChildProcess | null = null
let statusSink: ((s: TrackerStatus) => void) | null = null

function jarPath(): string {
  return join(paths.tracker(), TRACKER_JAR)
}

/** paceman-tracker reads its config from the user home .config/PaceMan/options.json. */
function optionsPath(): string {
  return join(homedir(), '.config', 'PaceMan', 'options.json')
}

export function onStatus(cb: (s: TrackerStatus) => void): void {
  statusSink = cb
}

function emit(): void {
  statusSink?.({ running: proc !== null, hasKey: hasKey() })
}

export function hasKey(): boolean {
  return !!store.secret.get(KEY_SECRET)
}

/** The saved access key (decrypted), or null. Settings shows it so the box isn't
 *  mysteriously empty after a save — it renders masked (password input) there. */
export function getKey(): string | null {
  return store.secret.get(KEY_SECRET) ?? null
}

export function setKey(key: string): void {
  store.secret.set(KEY_SECRET, key.trim())
  writeOptions()
  emit()
}

/** Merge the access key into paceman-tracker's options.json (preserving other keys). */
export function writeOptions(): void {
  const key = store.secret.get(KEY_SECRET)
  if (!key) return
  const file = optionsPath()
  let existing: Record<string, unknown> = {}
  try {
    if (existsSync(file)) existing = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    existing = {}
  }
  const merged = {
    accessKey: key,
    enabledForPlugin: false,
    allowAnyWorldName: false,
    resetStatsEnabled: true,
    ...existing,
    accessKey_override: key
  }
  // Ensure accessKey wins even if an old file had a stale one.
  merged.accessKey = key
  delete (merged as Record<string, unknown>).accessKey_override
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(merged, null, 2), 'utf8')
}

/** Download the tracker jar if it isn't bundled/present, and drop the jars of older versions. */
export async function ensureJar(): Promise<void> {
  if (!existsSync(jarPath())) {
    mkdirSync(paths.tracker(), { recursive: true })
    writeFileSync(jarPath(), await fetchVerified(TRACKER_DOWNLOAD, TRACKER_SHA512, 'paceman-tracker'))
  }
  for (const f of readdirSync(paths.tracker())) {
    if (f !== TRACKER_JAR && /^paceman-tracker-.*\.jar$/i.test(f)) {
      try {
        rmSync(join(paths.tracker(), f), { force: true })
      } catch {
        // still open from an earlier session — try again next time
      }
    }
  }
}

/**
 * Start the tracker (idempotent). Requires an access key. `javaw` is the Java to run it on —
 * the client's bundled one when available, else whatever is on PATH.
 */
export async function start(javaw = 'javaw'): Promise<void> {
  if (proc) return
  if (!hasKey()) return
  await ensureJar()
  writeOptions()
  const showWindow = store.getConfig().pacemanShowWindow
  const child = spawn(javaw, trackerArgs(jarPath(), showWindow), {
    cwd: paths.tracker(),
    stdio: 'ignore',
    detached: false,
    // windowsHide also hides a GUI app's first window on Windows, so only set it when headless.
    windowsHide: !showWindow
  })
  proc = child
  const gone = (): void => {
    if (proc !== child) return
    proc = null
    emit()
  }
  // No Java at that path: report "not running" instead of an unhandled error event.
  child.on('error', gone)
  child.on('exit', gone)
  emit()
}

export function stop(): void {
  if (proc) {
    try {
      proc.kill()
    } catch {
      // already gone
    }
    proc = null
  }
  emit()
}

export function status(): TrackerStatus {
  return { running: proc !== null, hasKey: hasKey() }
}
