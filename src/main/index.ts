import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc-handlers'
import { migrateDataDir } from './paths'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

function enablePacemanCors(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    if (details.url.includes('paceman.gg')) {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Access-Control-Allow-Origin': ['*']
        }
      })
    } else {
      cb({})
    }
  })
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

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
  migrateDataDir()
  enablePacemanCors()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
