export type SourceType = 'amex-japan' | 'jp-post-bank' | 'sbi-shinsei' | 'paypay'

export interface Source {
  id: number
  type: SourceType
  name: string
  config: SourceConfig
  pocketsmithAccountId: number | null
  lastSyncedAt: string | null
  lastBalance: number | null
  createdAt: string
}

/** Per-type configuration stored as JSON. No passwords. */
export type SourceConfig =
  | { type: 'amex-japan'; username: string }
  | { type: 'jp-post-bank'; customerNumber: string }
  | { type: 'sbi-shinsei'; username: string }
  | { type: 'paypay'; importPath: string }

export interface Transaction {
  id: number
  sourceId: number
  externalId: string
  date: string           // YYYY-MM-DD
  amount: number
  description: string
  rawData: string | null  // JSON
  pocketsmithPushedAt: string | null
  createdAt: string
}

export interface ParsedTransaction {
  externalId: string
  date: string
  amount: number
  description: string
  rawData?: Record<string, unknown>
}

export interface SyncProgress {
  status: 'scraping' | 'saving' | 'pushing' | 'done' | 'error'
  message: string
}

export interface SyncResult {
  newTransactions: number
  pushedTransactions: number
  error?: string
}

export interface PocketsmithAccount {
  id: number
  title: string
  currencyCode: string
}

/**
 * Typed API exposed to the renderer via contextBridge.
 * Each method maps to an IPC invoke call.
 */
export interface TsunaguAPI {
  // Settings (stored in SQLite)
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>

  // Data directory (stored in app-config.json, outside the DB)
  getDataDir(): Promise<string>
  setDataDir(path: string): Promise<void>

  // Sources
  getSources(): Promise<Source[]>
  getSource(id: number): Promise<Source | null>
  createSource(data: {
    type: SourceType
    name: string
    config: SourceConfig
    pocketsmithAccountId?: number
  }): Promise<Source>
  updateSource(id: number, data: {
    name?: string
    config?: SourceConfig
    pocketsmithAccountId?: number | null
  }): Promise<Source>
  deleteSource(id: number): Promise<void>

  // Transactions
  getTransactions(sourceId: number): Promise<Transaction[]>

  // Pocketsmith
  fetchPocketsmithAccounts(): Promise<PocketsmithAccount[]>

  // Sync
  syncSource(sourceId: number): Promise<SyncResult>
  onSyncProgress(callback: (sourceId: number, progress: SyncProgress) => void): () => void

  // Password prompt (main → renderer)
  onPasswordPrompt(callback: (label: string) => Promise<string>): () => void
}
