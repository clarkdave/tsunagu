import BetterSqlite3 from 'better-sqlite3'
import type { Source, SourceConfig, SourceType, Transaction, ParsedTransaction } from '../shared/types'

const MIGRATIONS = [
  `CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE sources (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    type                    TEXT NOT NULL,
    name                    TEXT NOT NULL,
    config                  TEXT NOT NULL,
    pocketsmith_account_id  INTEGER,
    last_synced_at          TEXT,
    last_balance            REAL,
    created_at              TEXT NOT NULL
  )`,
  `CREATE TABLE transactions (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id             INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    external_id           TEXT NOT NULL,
    date                  TEXT NOT NULL,
    amount                REAL NOT NULL,
    description           TEXT NOT NULL,
    raw_data              TEXT,
    pocketsmith_pushed_at TEXT,
    created_at            TEXT NOT NULL,
    UNIQUE(source_id, external_id)
  )`,
  `ALTER TABLE transactions ADD COLUMN pocketsmith_transaction_id INTEGER`
]

export class Database {
  private db: BetterSqlite3.Database

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
  }

  private migrate(): void {
    const version = this.db.pragma('user_version', { simple: true }) as number
    const pending = MIGRATIONS.slice(version)
    if (pending.length === 0) return

    const runMigrations = this.db.transaction(() => {
      for (const sql of pending) {
        this.db.exec(sql)
      }
      this.db.pragma(`user_version = ${MIGRATIONS.length}`)
    })
    runMigrations()
  }

  close(): void {
    this.db.close()
  }

  // --- Settings ---

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  setSetting(key: string, value: string): void {
    this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
    ).run(key, value, value)
  }

  // --- Sources ---

  getAllSources(): Source[] {
    const rows = this.db.prepare('SELECT * FROM sources ORDER BY created_at').all() as any[]
    return rows.map((row) => this.rowToSource(row))
  }

  getSource(id: number): Source | null {
    const row = this.db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as any | undefined
    return row ? this.rowToSource(row) : null
  }

  createSource(data: {
    type: SourceType
    name: string
    config: SourceConfig
    pocketsmithAccountId?: number
  }): Source {
    const now = new Date().toISOString()
    const result = this.db.prepare(
      `INSERT INTO sources (type, name, config, pocketsmith_account_id, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(data.type, data.name, JSON.stringify(data.config), data.pocketsmithAccountId ?? null, now)

    return this.getSource(Number(result.lastInsertRowid))!
  }

  updateSource(id: number, data: {
    name?: string
    config?: SourceConfig
    pocketsmithAccountId?: number | null
  }): Source {
    const current = this.getSource(id)
    if (!current) throw new Error(`Source ${id} not found`)

    this.db.prepare(
      `UPDATE sources SET name = ?, config = ?, pocketsmith_account_id = ? WHERE id = ?`
    ).run(
      data.name ?? current.name,
      data.config ? JSON.stringify(data.config) : JSON.stringify(current.config),
      data.pocketsmithAccountId !== undefined ? data.pocketsmithAccountId : current.pocketsmithAccountId,
      id
    )

    return this.getSource(id)!
  }

  deleteSource(id: number): void {
    this.db.prepare('DELETE FROM sources WHERE id = ?').run(id)
  }

  updateSourceSyncMeta(id: number, meta: { lastBalance?: number }): void {
    const now = new Date().toISOString()
    this.db.prepare(
      'UPDATE sources SET last_synced_at = ?, last_balance = COALESCE(?, last_balance) WHERE id = ?'
    ).run(now, meta.lastBalance ?? null, id)
  }

  // --- Transactions ---

  getTransactions(sourceId: number): Transaction[] {
    const rows = this.db.prepare(
      'SELECT * FROM transactions WHERE source_id = ? ORDER BY date DESC, id DESC'
    ).all(sourceId) as any[]
    return rows.map((row) => this.rowToTransaction(row))
  }

  getUnpushedTransactions(sourceId: number): Transaction[] {
    const rows = this.db.prepare(
      'SELECT * FROM transactions WHERE source_id = ? AND pocketsmith_pushed_at IS NULL ORDER BY date ASC'
    ).all(sourceId) as any[]
    return rows.map((row) => this.rowToTransaction(row))
  }

  insertTransactions(sourceId: number, transactions: ParsedTransaction[]): number {
    const now = new Date().toISOString()
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO transactions (source_id, external_id, date, amount, description, raw_data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )

    let inserted = 0
    const runInsert = this.db.transaction(() => {
      for (const tx of transactions) {
        const result = insert.run(
          sourceId,
          tx.externalId,
          tx.date,
          tx.amount,
          tx.description,
          tx.rawData ? JSON.stringify(tx.rawData) : null,
          now
        )
        if (result.changes > 0) inserted++
      }
    })
    runInsert()

    return inserted
  }

  markTransactionPushed(id: number, pocketsmithTransactionId: number): void {
    const now = new Date().toISOString()
    this.db.prepare(
      'UPDATE transactions SET pocketsmith_pushed_at = ?, pocketsmith_transaction_id = ? WHERE id = ?'
    ).run(now, pocketsmithTransactionId, id)
  }

  // --- Row mapping ---

  private rowToSource(row: any): Source {
    return {
      id: row.id,
      type: row.type as SourceType,
      name: row.name,
      config: JSON.parse(row.config) as SourceConfig,
      pocketsmithAccountId: row.pocketsmith_account_id,
      lastSyncedAt: row.last_synced_at,
      lastBalance: row.last_balance,
      createdAt: row.created_at
    }
  }

  private rowToTransaction(row: any): Transaction {
    return {
      id: row.id,
      sourceId: row.source_id,
      externalId: row.external_id,
      date: row.date,
      amount: row.amount,
      description: row.description,
      rawData: row.raw_data,
      pocketsmithPushedAt: row.pocketsmith_pushed_at,
      pocketsmithTransactionId: row.pocketsmith_transaction_id,
      createdAt: row.created_at
    }
  }
}
