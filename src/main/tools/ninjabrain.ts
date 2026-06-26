// Bundled Ninjabrain Bot (stronghold calculator). On instance install we download
// the jar into data/tools and drop a "Ninjabrain Bot" shortcut on the desktop so the
// player can launch it. If they already have Ninjabrain Bot open, we ask first.

import { app, dialog, shell, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '../paths'

export const NINJABRAIN_JAR = 'Ninjabrain-Bot-1.5.2.jar'
const DOWNLOAD =
  'https://github.com/Ninjabrain1/Ninjabrain-Bot/releases/download/1.5.2/Ninjabrain-Bot-1.5.2.jar'

function jarPath(): string {
  return join(paths.tools(), NINJABRAIN_JAR)
}

function win(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

/** Is a Ninjabrain Bot process already running? Windows-only, best effort. */
export function isRunning(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  return new Promise((resolve) => {
    const ps = spawn(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "if (Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*ninjabrain*' -or $_.CommandLine -like '*Ninjabrain*' }) { 'yes' }"
      ],
      { windowsHide: true }
    )
    let out = ''
    ps.stdout.on('data', (d) => (out += d.toString()))
    ps.on('close', () => resolve(out.toLowerCase().includes('yes')))
    ps.on('error', () => resolve(false))
  })
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
 * Download Ninjabrain Bot (once) and add a desktop shortcut. If the player already has
 * it running, confirm before downloading our own copy. Idempotent: a present jar just
 * refreshes the shortcut.
 */
export async function setupNinjabrain(): Promise<void> {
  if (existsSync(jarPath())) {
    createDesktopShortcut()
    return
  }
  if (await isRunning()) {
    const opts = {
      type: 'question' as const,
      buttons: ['Download anyway', 'Skip'],
      defaultId: 0,
      cancelId: 1,
      title: 'Ninjabrain Bot',
      message: 'Ninjabrain Bot is already running.',
      detail: 'Download the bundled copy into MCSR Client anyway? It also adds a desktop shortcut.'
    }
    const w = win()
    const res = w ? await dialog.showMessageBox(w, opts) : await dialog.showMessageBox(opts)
    if (res.response !== 0) return
  }
  await downloadJar()
  createDesktopShortcut()
}
