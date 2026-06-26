// Bundled Ninjabrain Bot (stronghold calculator). On instance install we download the
// jar into data/tools and drop a "Ninjabrain Bot" shortcut on the desktop so the player
// can launch it.

import { app, shell } from 'electron'
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
