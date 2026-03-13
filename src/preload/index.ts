import { contextBridge, ipcRenderer } from 'electron'
import type { TsunaguAPI } from '../shared/types'

const api: TsunaguAPI = {
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getDataDir: () => ipcRenderer.invoke('settings:getDataDir'),
  setDataDir: (path) => ipcRenderer.invoke('settings:setDataDir', path),

  getSources: () => ipcRenderer.invoke('sources:getAll'),
  getSource: (id) => ipcRenderer.invoke('sources:get', id),
  createSource: (data) => ipcRenderer.invoke('sources:create', data),
  updateSource: (id, data) => ipcRenderer.invoke('sources:update', id, data),
  deleteSource: (id) => ipcRenderer.invoke('sources:delete', id),

  getTransactions: (sourceId) => ipcRenderer.invoke('transactions:get', sourceId),

  validatePocketsmithKey: (apiKey) => ipcRenderer.invoke('pocketsmith:validateKey', apiKey),
  fetchPocketsmithAccounts: () => ipcRenderer.invoke('pocketsmith:accounts'),

  syncSource: (sourceId) => ipcRenderer.invoke('sync:source', sourceId),

  onSyncProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, sourceId: number, progress: any) => {
      callback(sourceId, progress)
    }
    ipcRenderer.on('sync:progress', handler)
    return () => ipcRenderer.removeListener('sync:progress', handler)
  },

  onPasswordPrompt: (callback) => {
    const handler = async (_event: Electron.IpcRendererEvent, label: string) => {
      const password = await callback(label)
      ipcRenderer.send('password:response', password)
    }
    ipcRenderer.on('password:prompt', handler)
    return () => ipcRenderer.removeListener('password:prompt', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
