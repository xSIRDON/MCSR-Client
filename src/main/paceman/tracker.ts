// Manages the standalone paceman-tracker — no Julti/Jingle required.
// The tracker reads SpeedRunIGT records and uploads splits to paceman.gg.
// We write the access key into its options.json and run the jar with `nogui`,
// starting it alongside an RSG launch and stopping it when the game closes.

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { paths } from '../paths'
import { store } from '../store'
import type { TrackerStatus } from '../../shared/types'

const KEY_SECRET = 'paceman-key'
export const TRACKER_JAR = 'paceman-tracker-0.7.2.jar'
const TRACKER_DOWNLOAD =
  'https://github.com/PaceMan-MCSR/PaceMan-Tracker/releases/download/v0.7.2/paceman-tracker-0.7.2.jar'

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

/** Download the tracker jar if it isn't bundled/present. */
export async function ensureJar(): Promise<void> {
  if (existsSync(jarPath())) return
  mkdirSync(paths.tracker(), { recursive: true })
  const res = await fetch(TRACKER_DOWNLOAD, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Failed to download paceman-tracker (${res.status})`)
  writeFileSync(jarPath(), Buffer.from(await res.arrayBuffer()))
}

/** Start the tracker (idempotent). Requires an access key. */
export async function start(): Promise<void> {
  if (proc) return
  if (!hasKey()) return
  await ensureJar()
  writeOptions()
  proc = spawn('java', ['-jar', jarPath(), 'nogui'], {
    cwd: paths.tracker(),
    stdio: 'ignore',
    detached: false
  })
  proc.on('exit', () => {
    proc = null
    emit()
  })
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
