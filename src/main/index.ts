import { app, BrowserWindow, dialog, session, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc, isGameRunning } from './ipc-handlers'
import { setupUpdater } from './updater'
import { migrateDataDir, migrateSessionState, paths } from './paths'
import { refreshNinjabrainShortcut } from './tools/ninjabrain'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

// The paceman stats API doesn't send CORS headers, so a renderer-side fetch is
// blocked. Inject an allow-origin header on its responses so the live-pace panel
// can read it. (The MCSR Ranked API already returns Access-Control-Allow-Origin.)
//
// Scoped to paceman URLs only: previously this hook ran for EVERY response and
// replied cb({}) to the rest, which can drop headers and break image rendering —
// the likely reason skins (mc-heads / minotar) failed to load in the renderer.
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

  // Open external links in the system browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Minecraft runs in its own window; don't yank it away if the user hits X on the launcher.
  // Offer to minimize and keep playing instead.
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
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'] as string)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Only one instance may run. Two processes would each call auth.restore() and refresh the
// SAME single-use msmc token from the shared secrets file, tripping reuse-detection and
// signing the user out — realistic during an update relaunch or an accidental double-launch.
// The first instance wins; a second hands off (focusing the existing window) and quits.
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
    // Bind the Windows taskbar/notification identity to the app (and its icon).
    if (process.platform === 'win32') app.setAppUserModelId('gg.mcsrclient.app')
    // Extract auth/config from the old install-dir data first, then move the bulk data dir.
    migrateSessionState()
    migrateDataDir()
    // The bundled-tool jar may have just relocated — keep its desktop shortcut valid.
    refreshNinjabrainShortcut()
    enablePacemanCors()
    registerIpc()
    createWindow()
    setupUpdater()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
