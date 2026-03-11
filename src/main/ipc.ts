import { ipcMain, app, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Database } from './database'
import { PocketsmithClient } from './pocketsmith'
import { runSync } from './sync'

export function registerIpcHandlers(db: Database, mainWindow: BrowserWindow): void {
  // Settings
  ipcMain.handle('settings:get', (_event, key: string) => {
    return db.getSetting(key)
  })

  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    db.setSetting(key, value)
  })

  // Sources
  ipcMain.handle('sources:getAll', () => {
    return db.getAllSources()
  })

  ipcMain.handle('sources:get', (_event, id: number) => {
    return db.getSource(id)
  })

  ipcMain.handle('sources:create', (_event, data) => {
    return db.createSource(data)
  })

  ipcMain.handle('sources:update', (_event, id: number, data) => {
    return db.updateSource(id, data)
  })

  ipcMain.handle('sources:delete', (_event, id: number) => {
    db.deleteSource(id)
  })

  // Transactions
  ipcMain.handle('transactions:get', (_event, sourceId: number) => {
    return db.getTransactions(sourceId)
  })

  // Data directory — stored in app-config.json (outside the DB, so app knows where to find DB)
  ipcMain.handle('settings:getDataDir', () => {
    const settingsPath = path.join(app.getPath('userData'), 'app-config.json')
    try {
      const config = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      return config.dataDir ?? ''
    } catch {
      return ''
    }
  })

  ipcMain.handle('settings:setDataDir', (_event, dataDir: string) => {
    const settingsPath = path.join(app.getPath('userData'), 'app-config.json')
    let config: Record<string, unknown> = {}
    try { config = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) } catch {}
    config.dataDir = dataDir
    fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2))
  })

  // Pocketsmith
  ipcMain.handle('pocketsmith:accounts', async () => {
    const apiKey = db.getSetting('pocketsmithApiKey')
    if (!apiKey) return []
    try {
      const client = new PocketsmithClient(apiKey)
      const user = await client.getCurrentUser()
      return await client.getTransactionAccounts(user.id)
    } catch {
      return []
    }
  })

  // Sync
  ipcMain.handle('sync:source', async (_event, sourceId: number) => {
    const source = db.getSource(sourceId)
    if (!source) throw new Error(`Source ${sourceId} not found`)

    const apiKey = db.getSetting('pocketsmithApiKey') ?? undefined
    const dryRun = db.getSetting('dryRun') === 'true'

    return runSync(db, source, {
      promptPassword: async (label) => {
        mainWindow.webContents.send('password:prompt', label)
        return new Promise((resolve) => {
          ipcMain.once('password:response', (_e, password: string) => resolve(password))
        })
      },
      onProgress: (message) => {
        mainWindow.webContents.send('sync:progress', sourceId, { status: 'scraping', message })
      },
      dryRun,
      apiKey
    })
  })
}
