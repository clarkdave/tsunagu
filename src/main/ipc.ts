import { ipcMain, app, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Database } from './database'

export function registerIpcHandlers(db: Database, _mainWindow: BrowserWindow): void {
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

  // Pocketsmith (stubbed — implemented in Task 7)
  ipcMain.handle('pocketsmith:accounts', () => {
    return []
  })

  // Sync (stubbed — implemented in Task 9)
  ipcMain.handle('sync:source', () => {
    return { newTransactions: 0, pushedTransactions: 0, error: 'Not yet implemented' }
  })
}
