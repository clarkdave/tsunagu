import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Database } from './database'
import { registerIpcHandlers } from './ipc'

let db: Database

function getDbPath(): string {
  // Default to iCloud path; overridden by app-config.json in userData
  const settingsPath = path.join(app.getPath('userData'), 'app-config.json')
  try {
    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    if (config.dataDir) return path.join(config.dataDir, 'tsunagu.db')
  } catch {
    // No config file yet — use default
  }
  const defaultDir = path.join(
    app.getPath('home'),
    'Library/Mobile Documents/com~apple~CloudDocs/Tsunagu'
  )
  fs.mkdirSync(defaultDir, { recursive: true })
  return path.join(defaultDir, 'tsunagu.db')
}

function createWindow(): void {
  db = new Database(getDbPath())

  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, '../../resources/icon.png'),
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  registerIpcHandlers(db, win)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  db?.close()
  app.quit()
})
