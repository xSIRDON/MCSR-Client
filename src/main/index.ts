import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc-handlers'
import { setupUpdater } from './updater'
import { migrateDataDir, paths } from './paths'

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
    width: 1040,
    height: 640,
    minWidth: 900,
    minHeight: 580,
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

  if (isDev) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'] as string)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Bind the Windows taskbar/notification identity to the app (and its icon).
  if (process.platform === 'win32') app.setAppUserModelId('gg.mcsrclient.app')
  migrateDataDir()
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
