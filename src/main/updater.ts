// App auto-update via electron-updater (GitHub Releases provider — see the
// `build.publish` block in package.json). The renderer drives a manual check and
// the "restart to update" action; the main process streams lifecycle status.
//
// Updates only run in the *packaged* app: electron-updater needs the generated
// app-update.yml that electron-builder bakes into the installer, so in dev we
// short-circuit with a friendly note instead of throwing.

import { app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../shared/types'
import { IPC } from '../shared/ipc'

const { autoUpdater } = electronUpdater

let status: UpdateStatus = { state: 'idle' }

function win(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function emit(next: UpdateStatus): void {
  status = next
  win()?.webContents.send(IPC.updStatusChanged, status)
}

export function currentUpdateStatus(): UpdateStatus {
  return status
}

export function setupUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    emit({ state: 'downloading', version: info.version, progress: 0 })
  )
  autoUpdater.on('update-not-available', () => emit({ state: 'up-to-date' }))
  autoUpdater.on('download-progress', (p) =>
    emit({ state: 'downloading', version: status.version, progress: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => emit({ state: 'ready', version: info.version }))
  autoUpdater.on('update-cancelled', () => emit({ state: 'idle' }))
  autoUpdater.on('error', (e) =>
    emit({ state: 'error', error: String(e instanceof Error ? e.message : e) })
  )

  // Quietly check a few seconds after launch so we don't compete with first paint.
  if (app.isPackaged) setTimeout(() => void checkForUpdates(), 4000)
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    emit({ state: 'up-to-date', note: 'Auto-update runs in the installed app only.' })
    return status
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    emit({ state: 'error', error: String(e instanceof Error ? e.message : e) })
  }
  return status
}

export function quitAndInstall(): void {
  if (status.state === 'ready') autoUpdater.quitAndInstall()
}
