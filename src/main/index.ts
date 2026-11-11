import { app, BrowserWindow, dialog, session, shell } from 'electron'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { registerIpc, isGameRunning } from './ipc-handlers'
import * as gmll from './launcher/gmll-adapter'
import * as tracker from './paceman/tracker'
import { setupUpdater, skipInstallOnQuit } from './updater'
import { migrateDataDir, migrateSessionState, paths } from './paths'
import { removeDesktopShortcut } from './tools/ninjabrain'
import { isSafeExternalUrl, isSameOrigin } from './security/url-safety'

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']

function enablePacemanCors(): void {
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['https://paceman.gg/*', 'https://*.paceman.gg/*'] },
    (details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Access-Control-Allow-Origin': ['*']
        }
      })
    }
  )
}

async function warmLauncher(): Promise<void> {
  try {
    await gmll.ensureCore()
    await gmll.ensureManagedJava()
  } catch {
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1060,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#0d0d0f',
    title: 'MCSR Client',
    icon: paths.resource('icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.on('session-end', skipInstallOnQuit)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (e, url) => {
    if (!isSameOrigin(url, win.webContents.getURL())) e.preventDefault()
  })

  let confirmedQuit = false
  win.on('close', (e) => {
    if (confirmedQuit || !isGameRunning()) return
    e.preventDefault()
    void dialog
      .showMessageBox(win, {
        type: 'question',
        title: 'Minecraft is running',
        message: 'Minecraft is still running.',
        detail: 'Minimize MCSR Client and keep playing, or quit the launcher?',
        buttons: ['Minimize', 'Quit', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        noLink: true
      })
      .then(({ response }) => {
        if (response === 0) win.minimize()
        else if (response === 1) {
          confirmedQuit = true
          win.close()
        }
      })
  })

  if (isDev) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'] + (process.env.DEMO_ROUTE ? '#/' + process.env.DEMO_ROUTE : ''))
    if (process.env.DEMO_HEIGHT) win.setSize(1060, Number(process.env.DEMO_HEIGHT))
    const shot = process.env.RENDERER_VITE_DEMO_PLAYER && process.env.DEMO_SHOT
    if (shot) {
      win.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          void win.webContents.capturePage().then((img) => writeFileSync(shot, img.toPNG()))
        }, 15000)
      })
    }
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (!app.isPackaged && process.env.RENDERER_VITE_DEMO_PLAYER) {
  app.setPath('userData', join(app.getPath('appData'), 'mcsr-client-demo'))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w) {
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('gg.mcsrclient.app')
    migrateSessionState()
    migrateDataDir()
    removeDesktopShortcut()
    enablePacemanCors()
    registerIpc()
    createWindow()
    setupUpdater(isGameRunning)
    void warmLauncher()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', () => tracker.stop())

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
