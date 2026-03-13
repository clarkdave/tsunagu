# Tsunagu Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop Electron app that fetches transactions from Japanese financial sources and pushes them to Pocketsmith.

**Architecture:** Plugin-based provider architecture with Electron main/renderer split. Main process owns database (SQLite), Pocketsmith API client, and WebContentsView-based scraping. Renderer is a React SPA communicating via typed IPC. Each financial source is a self-contained provider module.

**Tech Stack:** Electron, TypeScript (strict), React, Vite (via electron-vite), SQLite (better-sqlite3), Tailwind CSS v4, Vitest, bun

**Spec:** `docs/superpowers/specs/2026-03-11-tsunagu-design.md`

---

## File Structure

```
tsunagu/
├── package.json
├── electron.vite.config.ts
├── vitest.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── src/
│   ├── main/
│   │   ├── index.ts              # App entry, window creation, lifecycle
│   │   ├── ipc.ts                # IPC handler registration
│   │   ├── database.ts           # SQLite setup, migrations, all queries
│   │   ├── pocketsmith.ts        # Pocketsmith API client
│   │   ├── scraper.ts            # WebContentsView management
│   │   ├── sync.ts               # Sync orchestration
│   │   └── providers/
│   │       ├── types.ts          # Provider interface
│   │       ├── registry.ts       # Provider lookup by type
│   │       ├── amex-japan.ts
│   │       ├── jp-post-bank.ts
│   │       ├── sbi-shinsei.ts
│   │       └── paypay.ts         # File import (no scraping)
│   ├── preload/
│   │   └── index.ts              # contextBridge typed API
│   ├── renderer/
│   │   ├── index.html
│   │   ├── main.tsx              # React entry point
│   │   ├── App.tsx               # Two-panel layout, view switching
│   │   ├── app.css               # Tailwind import + global styles
│   │   ├── env.d.ts              # Window.api type declaration
│   │   └── components/
│   │       ├── Sidebar.tsx       # Left panel: source list + nav
│   │       ├── SourceDetail.tsx  # Right panel: source info + transactions
│   │       ├── AddSource.tsx     # Right panel: add source wizard
│   │       ├── Settings.tsx      # Right panel: app settings
│   │       ├── TransactionList.tsx
│   │       └── PasswordPrompt.tsx # Modal for password entry
│   └── shared/
│       └── types.ts              # Types shared between main & renderer
├── tests/
│   ├── main/
│   │   ├── database.test.ts
│   │   ├── pocketsmith.test.ts
│   │   ├── sync.test.ts
│   │   └── providers/
│   │       └── paypay.test.ts
│   └── fixtures/
│       └── paypay/
│           └── sample-export.csv
```

---

## Chunk 1: Project Foundation

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `vitest.config.ts`
- Create: `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/app.css`

- [ ] **Step 1: Initialize project and install dependencies**

```bash
cd /Volumes/development/clarkdave/tsunagu
bun init -y
bun add electron better-sqlite3 react react-dom
bun add -d electron-vite @vitejs/plugin-react @tailwindcss/vite tailwindcss \
  typescript @types/react @types/react-dom @types/better-sqlite3 \
  vitest electron-builder
```

- [ ] **Step 2: Create TypeScript configs**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

`tsconfig.node.json` (main + preload):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "declaration": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "composite": true
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*"]
}
```

`tsconfig.web.json` (renderer):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "outDir": "./dist",
    "declaration": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "composite": true
  },
  "include": ["src/renderer/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 3: Create electron-vite config**

`electron.vite.config.ts`:
```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react(), tailwindcss()]
  }
})
```

- [ ] **Step 4: Create vitest config**

`vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
})
```

- [ ] **Step 5: Create minimal main process entry**

`src/main/index.ts`:
```typescript
import { app, BrowserWindow } from 'electron'
import path from 'node:path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})
```

- [ ] **Step 6: Create minimal preload**

`src/preload/index.ts`:
```typescript
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {
  ping: () => 'pong'
})
```

- [ ] **Step 7: Create renderer files**

`src/renderer/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tsunagu</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

`src/renderer/app.css`:
```css
@import "tailwindcss";

body {
  margin: 0;
  background: #0f0f0f;
  color: #e5e5e5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
```

`src/renderer/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

`src/renderer/App.tsx`:
```tsx
export function App(): JSX.Element {
  return (
    <div className="flex h-screen">
      <div className="w-64 bg-neutral-900 border-r border-neutral-800 p-4">
        <h1 className="text-lg font-semibold">Tsunagu</h1>
      </div>
      <div className="flex-1 p-6">
        <p className="text-neutral-400">Select a source or add a new one.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Update package.json scripts and main entry**

Add to `package.json`:
```json
{
  "main": "./dist/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 9: Verify the app launches**

Run: `bun run dev`
Expected: Electron window opens showing "Tsunagu" in the sidebar and placeholder text in the right panel.

- [ ] **Step 10: Commit**

```bash
git add package.json bun.lockb electron.vite.config.ts vitest.config.ts \
  tsconfig.json tsconfig.node.json tsconfig.web.json \
  src/main/index.ts src/preload/index.ts \
  src/renderer/index.html src/renderer/main.tsx src/renderer/App.tsx src/renderer/app.css
git commit -m "feat: scaffold Electron app with electron-vite, React, Tailwind"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Define all shared types**

`src/shared/types.ts`:
```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: define shared types for sources, transactions, and IPC API"
```

---

### Task 3: Database Layer (TDD)

**Files:**
- Create: `src/main/database.ts`
- Create: `tests/main/database.test.ts`

- [ ] **Step 1: Write database tests**

`tests/main/database.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { Database } from '../../src/main/database'

describe('Database', () => {
  let db: Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  describe('initialization', () => {
    it('creates tables on init', () => {
      // Tables should exist after construction
      const sources = db.getAllSources()
      expect(sources).toEqual([])
      const txns = db.getTransactions(1)
      expect(txns).toEqual([])
    })
  })

  describe('settings', () => {
    it('returns null for unknown key', () => {
      expect(db.getSetting('unknown')).toBeNull()
    })

    it('sets and gets a value', () => {
      db.setSetting('apiKey', 'test-key-123')
      expect(db.getSetting('apiKey')).toBe('test-key-123')
    })

    it('overwrites existing value', () => {
      db.setSetting('apiKey', 'old')
      db.setSetting('apiKey', 'new')
      expect(db.getSetting('apiKey')).toBe('new')
    })
  })

  describe('sources', () => {
    it('creates and retrieves a source', () => {
      const source = db.createSource({
        type: 'amex-japan',
        name: 'My Amex',
        config: { type: 'amex-japan', username: 'user1' }
      })

      expect(source.id).toBeGreaterThan(0)
      expect(source.type).toBe('amex-japan')
      expect(source.name).toBe('My Amex')
      expect(source.config).toEqual({ type: 'amex-japan', username: 'user1' })
      expect(source.pocketsmithAccountId).toBeNull()
      expect(source.lastSyncedAt).toBeNull()
      expect(source.lastBalance).toBeNull()

      const fetched = db.getSource(source.id)
      expect(fetched).toEqual(source)
    })

    it('lists all sources', () => {
      db.createSource({ type: 'amex-japan', name: 'Amex', config: { type: 'amex-japan', username: 'u' } })
      db.createSource({ type: 'paypay', name: 'PayPay', config: { type: 'paypay', importPath: '/tmp' } })
      expect(db.getAllSources()).toHaveLength(2)
    })

    it('updates a source', () => {
      const source = db.createSource({
        type: 'amex-japan',
        name: 'Old Name',
        config: { type: 'amex-japan', username: 'u' }
      })

      const updated = db.updateSource(source.id, {
        name: 'New Name',
        pocketsmithAccountId: 42
      })

      expect(updated.name).toBe('New Name')
      expect(updated.pocketsmithAccountId).toBe(42)
      expect(updated.type).toBe('amex-japan') // unchanged
    })

    it('deletes a source and its transactions', () => {
      const source = db.createSource({
        type: 'amex-japan',
        name: 'Amex',
        config: { type: 'amex-japan', username: 'u' }
      })
      db.insertTransactions(source.id, [{
        externalId: 'tx1', date: '2026-01-01', amount: -1000, description: 'Test'
      }])

      db.deleteSource(source.id)
      expect(db.getSource(source.id)).toBeNull()
      expect(db.getTransactions(source.id)).toEqual([])
    })

    it('updates sync metadata', () => {
      const source = db.createSource({
        type: 'amex-japan',
        name: 'Amex',
        config: { type: 'amex-japan', username: 'u' }
      })

      db.updateSourceSyncMeta(source.id, { lastBalance: 50000 })
      const updated = db.getSource(source.id)!
      expect(updated.lastSyncedAt).not.toBeNull()
      expect(updated.lastBalance).toBe(50000)
    })
  })

  describe('transactions', () => {
    let sourceId: number

    beforeEach(() => {
      const source = db.createSource({
        type: 'amex-japan',
        name: 'Amex',
        config: { type: 'amex-japan', username: 'u' }
      })
      sourceId = source.id
    })

    it('inserts transactions and returns count of new', () => {
      const count = db.insertTransactions(sourceId, [
        { externalId: 'tx1', date: '2026-01-01', amount: -1000, description: 'Store A' },
        { externalId: 'tx2', date: '2026-01-02', amount: -2000, description: 'Store B' }
      ])

      expect(count).toBe(2)
      expect(db.getTransactions(sourceId)).toHaveLength(2)
    })

    it('deduplicates by external_id', () => {
      db.insertTransactions(sourceId, [
        { externalId: 'tx1', date: '2026-01-01', amount: -1000, description: 'Store A' }
      ])
      const count = db.insertTransactions(sourceId, [
        { externalId: 'tx1', date: '2026-01-01', amount: -1000, description: 'Store A' },
        { externalId: 'tx2', date: '2026-01-02', amount: -2000, description: 'Store B' }
      ])

      expect(count).toBe(1) // only tx2 is new
      expect(db.getTransactions(sourceId)).toHaveLength(2)
    })

    it('returns transactions ordered by date desc', () => {
      db.insertTransactions(sourceId, [
        { externalId: 'tx1', date: '2026-01-01', amount: -1000, description: 'Old' },
        { externalId: 'tx2', date: '2026-01-15', amount: -2000, description: 'New' }
      ])

      const txns = db.getTransactions(sourceId)
      expect(txns[0].date).toBe('2026-01-15')
      expect(txns[1].date).toBe('2026-01-01')
    })

    it('gets unpushed transactions', () => {
      db.insertTransactions(sourceId, [
        { externalId: 'tx1', date: '2026-01-01', amount: -1000, description: 'A' },
        { externalId: 'tx2', date: '2026-01-02', amount: -2000, description: 'B' }
      ])

      // getTransactions returns date DESC: [tx2, tx1]
      const all = db.getTransactions(sourceId)
      db.markTransactionPushed(all[0].id) // mark tx2 as pushed

      const unpushed = db.getUnpushedTransactions(sourceId)
      expect(unpushed).toHaveLength(1)
      expect(unpushed[0].externalId).toBe('tx1')
    })

    it('marks a transaction as pushed', () => {
      db.insertTransactions(sourceId, [
        { externalId: 'tx1', date: '2026-01-01', amount: -1000, description: 'A' }
      ])

      const txns = db.getTransactions(sourceId)
      expect(txns[0].pocketsmithPushedAt).toBeNull()

      db.markTransactionPushed(txns[0].id)

      const updated = db.getTransactions(sourceId)
      expect(updated[0].pocketsmithPushedAt).not.toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/main/database.test.ts`
Expected: FAIL — `../../src/main/database` module not found

- [ ] **Step 3: Implement the database module**

`src/main/database.ts`:
```typescript
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
  )`
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

  markTransactionPushed(id: number): void {
    const now = new Date().toISOString()
    this.db.prepare(
      'UPDATE transactions SET pocketsmith_pushed_at = ? WHERE id = ?'
    ).run(now, id)
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
      createdAt: row.created_at
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/main/database.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/database.ts tests/main/database.test.ts
git commit -m "feat: add shared types and database layer with full test coverage"
```

---

## Chunk 2: IPC, Settings & Source Management

### Task 4: Preload & IPC

**Files:**
- Modify: `src/preload/index.ts`
- Create: `src/main/ipc.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Implement typed preload script**

`src/preload/index.ts`:
```typescript
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
```

- [ ] **Step 2: Create IPC handler registration**

`src/main/ipc.ts`:
```typescript
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

  // Pocketsmith (stubbed — implemented in Task 7)
  ipcMain.handle('pocketsmith:accounts', () => {
    return []
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
    // Note: changing this requires an app restart to take effect
  })

  // Sync (stubbed — implemented in Task 9)
  ipcMain.handle('sync:source', () => {
    return { newTransactions: 0, pushedTransactions: 0, error: 'Not yet implemented' }
  })
}
```

- [ ] **Step 3: Wire IPC and database into main process**

Update `src/main/index.ts`:
```typescript
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
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
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
```

- [ ] **Step 4: Add window.api type declaration for renderer**

Add to `src/renderer/env.d.ts`:
```typescript
import type { TsunaguAPI } from '../shared/types'

declare global {
  interface Window {
    api: TsunaguAPI
  }
}
```

- [ ] **Step 5: Verify app launches with IPC wired**

Run: `bun run dev`
Expected: App launches without errors. Open DevTools console and run `window.api.getSources()` — should return `[]`.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/main/ipc.ts src/preload/index.ts src/renderer/env.d.ts
git commit -m "feat: wire up IPC handlers and typed preload bridge"
```

---

### Task 5: Settings Page

**Files:**
- Create: `src/renderer/components/Settings.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Build Settings component**

`src/renderer/components/Settings.tsx`:
```tsx
import { useState, useEffect } from 'react'

export function Settings(): JSX.Element {
  const [apiKey, setApiKey] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [dataDir, setDataDir] = useState('')
  const [dryRun, setDryRun] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const key = await window.api.getSetting('pocketsmithApiKey')
      setHasApiKey(!!key)

      const dir = await window.api.getDataDir()
      setDataDir(dir)

      const dry = await window.api.getSetting('dryRun')
      setDryRun(dry === 'true')
    }
    load()
  }, [])

  async function saveApiKey() {
    if (!apiKey.trim()) return
    await window.api.setSetting('pocketsmithApiKey', apiKey.trim())
    setHasApiKey(true)
    setApiKey('')
    flash()
  }

  async function saveDataDir() {
    await window.api.setDataDir(dataDir)
    flash()
  }

  async function toggleDryRun() {
    const next = !dryRun
    setDryRun(next)
    await window.api.setSetting('dryRun', String(next))
    flash()
  }

  function flash() {
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-semibold mb-6">Settings</h2>

      {saved && (
        <div className="mb-4 text-sm text-green-400">Saved.</div>
      )}

      {/* Pocketsmith API Key */}
      <section className="mb-6">
        <label className="block text-sm text-neutral-400 mb-1">Pocketsmith API Key</label>
        {hasApiKey ? (
          <div className="flex items-center gap-2">
            <span className="text-neutral-500">••••••••••••</span>
            <button
              onClick={() => setHasApiKey(false)}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key"
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm"
            />
            <button
              onClick={saveApiKey}
              className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-sm"
            >
              Save
            </button>
          </div>
        )}
      </section>

      {/* Data Directory */}
      <section className="mb-6">
        <label className="block text-sm text-neutral-400 mb-1">Data Directory</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={dataDir}
            onChange={(e) => setDataDir(e.target.value)}
            placeholder="~/Library/Mobile Documents/com~apple~CloudDocs/Tsunagu/"
            className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm"
          />
          <button
            onClick={saveDataDir}
            className="bg-neutral-700 hover:bg-neutral-600 px-3 py-1.5 rounded text-sm"
          >
            Save
          </button>
        </div>
      </section>

      {/* Dry Run */}
      <section className="mb-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={toggleDryRun}
            className="rounded"
          />
          <span className="text-sm">Dry run mode</span>
        </label>
        <p className="text-xs text-neutral-500 mt-1">
          When enabled, Pocketsmith API calls are logged but not executed.
        </p>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Add view switching to App.tsx**

`src/renderer/App.tsx`:
```tsx
import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Settings } from './components/Settings'

export type View =
  | { type: 'empty' }
  | { type: 'settings' }
  | { type: 'addSource' }
  | { type: 'sourceDetail'; sourceId: number }

export function App(): JSX.Element {
  const [view, setView] = useState<View>({ type: 'empty' })

  return (
    <div className="flex h-screen">
      <Sidebar
        onNavigate={setView}
        selectedSourceId={view.type === 'sourceDetail' ? view.sourceId : null}
      />
      <main className="flex-1 p-6 overflow-y-auto">
        {view.type === 'settings' && <Settings />}
        {view.type === 'empty' && (
          <p className="text-neutral-400">Select a source or add a new one.</p>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Create Sidebar component**

`src/renderer/components/Sidebar.tsx`:
```tsx
import { useState, useEffect } from 'react'
import type { Source } from '../../shared/types'
import type { View } from '../App'

interface Props {
  onNavigate: (view: View) => void
  selectedSourceId: number | null
}

export function Sidebar({ onNavigate, selectedSourceId }: Props): JSX.Element {
  const [sources, setSources] = useState<Source[]>([])

  useEffect(() => {
    window.api.getSources().then(setSources)
  }, [])

  // Expose refresh for other components to call after mutations
  useEffect(() => {
    (window as any).__refreshSources = () => window.api.getSources().then(setSources)
    return () => { delete (window as any).__refreshSources }
  }, [])

  return (
    <aside className="w-64 bg-neutral-900 border-r border-neutral-800 flex flex-col h-full">
      <div className="p-4 pt-10">
        <h1 className="text-lg font-semibold tracking-tight">Tsunagu</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {sources.map((source) => (
          <button
            key={source.id}
            onClick={() => onNavigate({ type: 'sourceDetail', sourceId: source.id })}
            className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
              selectedSourceId === source.id
                ? 'bg-neutral-800 border border-neutral-700'
                : 'hover:bg-neutral-800/50'
            }`}
          >
            <div className="text-sm font-medium">{source.name}</div>
            <div className="text-xs text-neutral-500">
              {source.lastSyncedAt
                ? `Synced ${new Date(source.lastSyncedAt).toLocaleDateString()}`
                : 'Never synced'}
              {source.lastBalance != null && (
                <span className="ml-2">¥{source.lastBalance.toLocaleString()}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="p-2 border-t border-neutral-800 space-y-1">
        <button
          onClick={() => onNavigate({ type: 'addSource' })}
          className="w-full text-left px-3 py-2 text-sm text-blue-400 hover:bg-neutral-800/50 rounded-lg"
        >
          + Add Source
        </button>
        <button
          onClick={() => onNavigate({ type: 'settings' })}
          className="w-full text-left px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800/50 rounded-lg"
        >
          Settings
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Verify settings page works**

Run: `bun run dev`
Expected: Click "Settings" in the sidebar → Settings panel appears. Can enter and save an API key. Key shows as masked after saving.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/Sidebar.tsx src/renderer/components/Settings.tsx
git commit -m "feat: add settings page and sidebar navigation"
```

---

### Task 6: Source Management

**Files:**
- Create: `src/renderer/components/AddSource.tsx`
- Create: `src/renderer/components/SourceDetail.tsx`
- Create: `src/renderer/components/TransactionList.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Build AddSource component**

`src/renderer/components/AddSource.tsx`:
```tsx
import { useState, useEffect } from 'react'
import type { SourceType, SourceConfig, PocketsmithAccount } from '../../shared/types'

interface Props {
  onCreated: (sourceId: number) => void
}

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: 'amex-japan', label: 'American Express Japan' },
  { value: 'jp-post-bank', label: 'JP Post Bank' },
  { value: 'sbi-shinsei', label: 'SBI Shinsei Bank' },
  { value: 'paypay', label: 'PayPay' },
]

export function AddSource({ onCreated }: Props): JSX.Element {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedType, setSelectedType] = useState<SourceType | null>(null)
  const [name, setName] = useState('')
  const [credential, setCredential] = useState('')  // username, customer number, or import path
  const [pocketsmithAccountId, setPocketsmithAccountId] = useState<number | undefined>()
  const [psAccounts, setPsAccounts] = useState<PocketsmithAccount[]>([])

  useEffect(() => {
    window.api.fetchPocketsmithAccounts().then(setPsAccounts).catch(() => {})
  }, [])

  function selectType(type: SourceType) {
    setSelectedType(type)
    setName(SOURCE_TYPES.find((t) => t.value === type)!.label)
    setStep(2)
  }

  function credentialLabel(): string {
    switch (selectedType) {
      case 'amex-japan': return 'Username'
      case 'jp-post-bank': return 'Customer Number'
      case 'sbi-shinsei': return 'Username'
      case 'paypay': return 'Import Directory Path'
      default: return 'Credential'
    }
  }

  function buildConfig(): SourceConfig {
    switch (selectedType!) {
      case 'amex-japan': return { type: 'amex-japan', username: credential }
      case 'jp-post-bank': return { type: 'jp-post-bank', customerNumber: credential }
      case 'sbi-shinsei': return { type: 'sbi-shinsei', username: credential }
      case 'paypay': return { type: 'paypay', importPath: credential }
    }
  }

  async function save() {
    if (!selectedType || !name.trim() || !credential.trim()) return
    const source = await window.api.createSource({
      type: selectedType,
      name: name.trim(),
      config: buildConfig(),
      pocketsmithAccountId
    })
    ;(window as any).__refreshSources?.()
    onCreated(source.id)
  }

  if (step === 1) {
    return (
      <div className="max-w-md">
        <h2 className="text-xl font-semibold mb-4">Add Source</h2>
        <div className="space-y-2">
          {SOURCE_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => selectType(t.value)}
              className="w-full text-left px-4 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md">
      <h2 className="text-xl font-semibold mb-4">
        Add {SOURCE_TYPES.find((t) => t.value === selectedType)!.label}
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-neutral-400 mb-1">Display Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm text-neutral-400 mb-1">{credentialLabel()}</label>
          <input
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm"
          />
        </div>

        {psAccounts.length > 0 && (
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Pocketsmith Account</label>
            <select
              value={pocketsmithAccountId ?? ''}
              onChange={(e) => setPocketsmithAccountId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm"
            >
              <option value="">None (map later)</option>
              {psAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.title} ({a.currencyCode})</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={() => setStep(1)} className="text-sm text-neutral-400 hover:text-neutral-300">
            Back
          </button>
          <button
            onClick={save}
            className="bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded text-sm"
          >
            Create Source
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build TransactionList component**

`src/renderer/components/TransactionList.tsx`:
```tsx
import type { Transaction } from '../../shared/types'

interface Props {
  transactions: Transaction[]
}

export function TransactionList({ transactions }: Props): JSX.Element {
  if (transactions.length === 0) {
    return <p className="text-sm text-neutral-500 py-4">No transactions yet. Run a sync to fetch them.</p>
  }

  return (
    <div className="space-y-1">
      {transactions.map((tx) => (
        <div
          key={tx.id}
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800/50"
        >
          <span className={`text-xs ${tx.pocketsmithPushedAt ? 'text-green-500' : 'text-neutral-600'}`}>
            {tx.pocketsmithPushedAt ? '✓' : '○'}
          </span>
          <span className="text-sm text-neutral-500 w-24 shrink-0">{tx.date}</span>
          <span className="text-sm flex-1 truncate">{tx.description}</span>
          <span className={`text-sm font-mono ${tx.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>
            ¥{tx.amount.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Build SourceDetail component**

`src/renderer/components/SourceDetail.tsx`:
```tsx
import { useState, useEffect } from 'react'
import type { Source, Transaction, SyncProgress, SyncResult } from '../../shared/types'
import { TransactionList } from './TransactionList'

interface Props {
  sourceId: number
}

export function SourceDetail({ sourceId }: Props): JSX.Element {
  const [source, setSource] = useState<Source | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)

  useEffect(() => {
    loadData()

    const cleanup = window.api.onSyncProgress((id, prog) => {
      if (id === sourceId) setProgress(prog)
    })

    return cleanup
  }, [sourceId])

  async function loadData() {
    const [s, txns] = await Promise.all([
      window.api.getSource(sourceId),
      window.api.getTransactions(sourceId)
    ])
    setSource(s)
    setTransactions(txns)
  }

  async function handleSync() {
    setSyncing(true)
    setProgress(null)
    setLastResult(null)

    try {
      const result = await window.api.syncSource(sourceId)
      setLastResult(result)
      await loadData()
      ;(window as any).__refreshSources?.()
    } finally {
      setSyncing(false)
      setProgress(null)
    }
  }

  if (!source) return <p className="text-neutral-500">Loading...</p>

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{source.name}</h2>
          <p className="text-sm text-neutral-500">
            {source.lastSyncedAt
              ? `Last synced ${new Date(source.lastSyncedAt).toLocaleString()}`
              : 'Never synced'}
            {source.lastBalance != null && ` · Balance: ¥${source.lastBalance.toLocaleString()}`}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-1.5 rounded text-sm"
        >
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {progress && (
        <div className="mb-4 px-3 py-2 bg-neutral-800 rounded text-sm text-neutral-300">
          {progress.message}
        </div>
      )}

      {lastResult && (
        <div className={`mb-4 px-3 py-2 rounded text-sm ${
          lastResult.error ? 'bg-red-900/30 text-red-300' : 'bg-green-900/30 text-green-300'
        }`}>
          {lastResult.error
            ? `Error: ${lastResult.error}`
            : `${lastResult.newTransactions} new transactions, ${lastResult.pushedTransactions} pushed to Pocketsmith`}
        </div>
      )}

      <TransactionList transactions={transactions} />
    </div>
  )
}
```

- [ ] **Step 4: Wire new components into App.tsx**

Update `src/renderer/App.tsx` to handle all view types:
```tsx
import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Settings } from './components/Settings'
import { AddSource } from './components/AddSource'
import { SourceDetail } from './components/SourceDetail'

export type View =
  | { type: 'empty' }
  | { type: 'settings' }
  | { type: 'addSource' }
  | { type: 'sourceDetail'; sourceId: number }

export function App(): JSX.Element {
  const [view, setView] = useState<View>({ type: 'empty' })

  return (
    <div className="flex h-screen">
      <Sidebar
        onNavigate={setView}
        selectedSourceId={view.type === 'sourceDetail' ? view.sourceId : null}
      />
      <main className="flex-1 p-6 overflow-y-auto">
        {view.type === 'settings' && <Settings />}
        {view.type === 'addSource' && (
          <AddSource onCreated={(id) => setView({ type: 'sourceDetail', sourceId: id })} />
        )}
        {view.type === 'sourceDetail' && <SourceDetail sourceId={view.sourceId} />}
        {view.type === 'empty' && (
          <p className="text-neutral-400">Select a source or add a new one.</p>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Verify source management works end-to-end**

Run: `bun run dev`
Expected: Can add a new source (e.g. PayPay), see it in the sidebar, click it to see the detail view with "Never synced" and empty transaction list. "Sync Now" button shows but returns stub error.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/AddSource.tsx \
  src/renderer/components/SourceDetail.tsx src/renderer/components/TransactionList.tsx
git commit -m "feat: add source management UI with add, detail, and transaction list views"
```

---

## Chunk 3: Pocketsmith, Providers & Sync

### Task 7: Pocketsmith Client (TDD)

**Files:**
- Create: `src/main/pocketsmith.ts`
- Create: `tests/main/pocketsmith.test.ts`
- Modify: `src/main/ipc.ts`

- [ ] **Step 1: Write Pocketsmith client tests**

`tests/main/pocketsmith.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PocketsmithClient } from '../../src/main/pocketsmith'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('PocketsmithClient', () => {
  let client: PocketsmithClient

  beforeEach(() => {
    mockFetch.mockReset()
    client = new PocketsmithClient('test-api-key')
  })

  describe('getCurrentUser', () => {
    it('fetches current user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 123, name: 'Test User' })
      })

      const user = await client.getCurrentUser()
      expect(user.id).toBe(123)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.pocketsmith.com/v2/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Developer-Key': 'test-api-key'
          })
        })
      )
    })

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized')
      })

      await expect(client.getCurrentUser()).rejects.toThrow('Pocketsmith API error 401')
    })
  })

  describe('getTransactionAccounts', () => {
    it('fetches transaction accounts for a user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { id: 1, title: 'Checking', currency_code: 'JPY' },
          { id: 2, title: 'Credit Card', currency_code: 'JPY' }
        ])
      })

      const accounts = await client.getTransactionAccounts(123)
      expect(accounts).toEqual([
        { id: 1, title: 'Checking', currencyCode: 'JPY' },
        { id: 2, title: 'Credit Card', currencyCode: 'JPY' }
      ])
    })
  })

  describe('pushTransaction', () => {
    it('posts a transaction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 999 })
      })

      await client.pushTransaction(42, {
        date: '2026-01-15',
        amount: -1500,
        payee: 'Convenience Store'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.pocketsmith.com/v2/transaction_accounts/42/transactions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            payee: 'Convenience Store',
            amount: -1500,
            date: '2026-01-15',
            is_transfer: false
          })
        })
      )
    })
  })

  describe('dry run mode', () => {
    it('logs instead of calling API', async () => {
      const logs: string[] = []
      const dryClient = new PocketsmithClient('key', { dryRun: true, onLog: (msg) => logs.push(msg) })

      await dryClient.pushTransaction(42, {
        date: '2026-01-15',
        amount: -1500,
        payee: 'Test'
      })

      expect(mockFetch).not.toHaveBeenCalled()
      expect(logs).toHaveLength(1)
      expect(logs[0]).toContain('POST')
      expect(logs[0]).toContain('42')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/main/pocketsmith.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Pocketsmith client**

`src/main/pocketsmith.ts`:
```typescript
import type { PocketsmithAccount } from '../shared/types'

const BASE_URL = 'https://api.pocketsmith.com/v2'

interface PushTransactionData {
  date: string
  amount: number
  payee: string
}

interface PocketsmithOptions {
  dryRun?: boolean
  onLog?: (message: string) => void
}

export class PocketsmithClient {
  constructor(
    private apiKey: string,
    private options: PocketsmithOptions = {}
  ) {}

  async getCurrentUser(): Promise<{ id: number; name: string }> {
    return this.request('GET', '/me')
  }

  async getTransactionAccounts(userId: number): Promise<PocketsmithAccount[]> {
    const raw: any[] = await this.request('GET', `/users/${userId}/transaction_accounts`)
    return raw.map((a) => ({
      id: a.id,
      title: a.title,
      currencyCode: a.currency_code
    }))
  }

  async pushTransaction(accountId: number, data: PushTransactionData): Promise<void> {
    const body = {
      payee: data.payee,
      amount: data.amount,
      date: data.date,
      is_transfer: false
    }

    if (this.options.dryRun) {
      const msg = `[DRY RUN] POST /transaction_accounts/${accountId}/transactions ${JSON.stringify(body)}`
      this.options.onLog?.(msg)
      return
    }

    await this.request('POST', `/transaction_accounts/${accountId}/transactions`, body)
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'X-Developer-Key': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Pocketsmith API error ${response.status}: ${text}`)
    }

    return response.json()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/main/pocketsmith.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Wire Pocketsmith accounts into IPC**

Update `src/main/ipc.ts` — replace the stubbed `pocketsmith:accounts` handler:
```typescript
import { PocketsmithClient } from './pocketsmith'

// Inside registerIpcHandlers, replace the stub:
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
```

- [ ] **Step 6: Commit**

```bash
git add src/main/pocketsmith.ts tests/main/pocketsmith.test.ts src/main/ipc.ts
git commit -m "feat: add Pocketsmith API client with dry run support"
```

---

### Task 8: PayPay Provider (TDD)

**Files:**
- Create: `src/main/providers/types.ts`
- Create: `src/main/providers/registry.ts`
- Create: `src/main/providers/paypay.ts`
- Create: `tests/main/providers/paypay.test.ts`
- Create: `tests/fixtures/paypay/sample-export.csv`

The PayPay provider reads exported CSV files from a configured directory. The exact CSV format will need to be confirmed from real exports, but we'll implement a reasonable parser based on typical Japanese financial CSV formats that can be adjusted once real data is available.

- [ ] **Step 1: Create provider interface and registry**

`src/main/providers/types.ts`:
```typescript
import type { SourceType, SourceConfig, ParsedTransaction } from '../../shared/types'
import type { Scraper } from '../scraper'

export interface SyncContext {
  /** Scraper instance for browser-based providers. Not set for file-based providers like PayPay. */
  scraper?: Scraper
  /** Callback to request a password from the user via UI modal. */
  promptPassword: (label: string) => Promise<string>
  /** Callback to report progress to the UI. */
  onProgress: (message: string) => void
}

export interface ProviderSyncResult {
  transactions: ParsedTransaction[]
  balance?: number
}

export interface Provider {
  type: SourceType
  sync(config: SourceConfig, context: SyncContext): Promise<ProviderSyncResult>
}
```

`src/main/providers/registry.ts`:
```typescript
import type { Provider } from './types'
import type { SourceType } from '../../shared/types'
import { PayPayProvider } from './paypay'

const providers: Record<string, Provider> = {
  paypay: new PayPayProvider()
}

export function getProvider(type: SourceType): Provider {
  const provider = providers[type]
  if (!provider) throw new Error(`No provider for source type: ${type}`)
  return provider
}
```

- [ ] **Step 2: Create sample PayPay CSV fixture**

`tests/fixtures/paypay/sample-export.csv`:
```csv
取引日時,取引内容,取引金額,取引後残高
2026-01-15 10:30:00,セブンイレブン,-350,9650
2026-01-14 18:45:00,ローソン,-210,10000
2026-01-10 12:00:00,チャージ,10000,10210
```

- [ ] **Step 3: Write PayPay provider tests**

`tests/main/providers/paypay.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { PayPayProvider, parsePayPayCSV } from '../../../src/main/providers/paypay'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('PayPay Provider', () => {
  describe('parsePayPayCSV', () => {
    it('parses a CSV string into transactions', () => {
      const csv = readFileSync(
        path.join(__dirname, '../../fixtures/paypay/sample-export.csv'),
        'utf-8'
      )

      const result = parsePayPayCSV(csv)
      expect(result.transactions).toHaveLength(3)

      expect(result.transactions[0]).toEqual({
        externalId: expect.any(String),
        date: '2026-01-15',
        amount: -350,
        description: 'セブンイレブン',
        rawData: { datetime: '2026-01-15 10:30:00', balanceAfter: 9650 }
      })

      expect(result.transactions[2]).toEqual({
        externalId: expect.any(String),
        date: '2026-01-10',
        amount: 10000,
        description: 'チャージ',
        rawData: { datetime: '2026-01-10 12:00:00', balanceAfter: 10210 }
      })
    })

    it('generates deterministic external IDs', () => {
      const csv = '取引日時,取引内容,取引金額,取引後残高\n2026-01-15 10:30:00,Store,-350,9650'
      const result1 = parsePayPayCSV(csv)
      const result2 = parsePayPayCSV(csv)
      expect(result1.transactions[0].externalId).toBe(result2.transactions[0].externalId)
    })

    it('extracts balance from latest transaction', () => {
      const csv = readFileSync(
        path.join(__dirname, '../../fixtures/paypay/sample-export.csv'),
        'utf-8'
      )
      const result = parsePayPayCSV(csv)
      expect(result.balance).toBe(9650)  // Balance after the most recent transaction
    })

    it('handles empty CSV', () => {
      const csv = '取引日時,取引内容,取引金額,取引後残高\n'
      const result = parsePayPayCSV(csv)
      expect(result.transactions).toEqual([])
      expect(result.balance).toBeUndefined()
    })
  })

  describe('sync', () => {
    it('reads all CSV files from the import directory', async () => {
      const provider = new PayPayProvider()
      const fixtureDir = path.join(__dirname, '../../fixtures/paypay')

      const result = await provider.sync(
        { type: 'paypay', importPath: fixtureDir },
        {
          promptPassword: async () => '',
          onProgress: () => {}
        }
      )

      expect(result.transactions.length).toBeGreaterThan(0)
      expect(result.balance).toBe(9650)
    })
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `bunx vitest run tests/main/providers/paypay.test.ts`
Expected: FAIL — module not found

- [ ] **Step 5: Implement PayPay provider**

`src/main/providers/paypay.ts`:
```typescript
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { SourceConfig, ParsedTransaction } from '../../shared/types'
import type { Provider, ProviderSyncResult, SyncContext } from './types'

interface PayPayParseResult {
  transactions: ParsedTransaction[]
  balance?: number
}

export function parsePayPayCSV(csv: string): PayPayParseResult {
  const lines = csv.trim().split('\n')
  if (lines.length <= 1) return { transactions: [] }

  const transactions: ParsedTransaction[] = []
  let latestBalance: number | undefined

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Simple CSV split — PayPay exports shouldn't have commas in values
    const parts = line.split(',')
    if (parts.length < 4) continue

    const datetime = parts[0]
    const description = parts[1]
    const amount = Number(parts[2])
    const balanceAfter = Number(parts[3])
    const date = datetime.split(' ')[0]

    const hash = createHash('sha256')
      .update(`${datetime}|${description}|${amount}`)
      .digest('hex')
      .slice(0, 16)

    transactions.push({
      externalId: `paypay-${hash}`,
      date,
      amount,
      description,
      rawData: { datetime, balanceAfter }
    })

    if (i === 1) latestBalance = balanceAfter  // First data row is most recent
  }

  return { transactions, balance: latestBalance }
}

export class PayPayProvider implements Provider {
  type = 'paypay'

  async sync(config: SourceConfig, context: SyncContext): Promise<ProviderSyncResult> {
    if (config.type !== 'paypay') throw new Error('Invalid config type')

    context.onProgress('Scanning import directory...')

    const dir = config.importPath
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.csv'))
      .sort()  // Sort alphabetically so behavior is deterministic

    const allTransactions: ParsedTransaction[] = []
    let latestBalance: number | undefined

    for (const file of files) {
      context.onProgress(`Reading ${file}...`)
      const csv = readFileSync(path.join(dir, file), 'utf-8')
      const result = parsePayPayCSV(csv)
      allTransactions.push(...result.transactions)

      // Last file processed wins for balance (files are sorted alphabetically)
      if (result.balance !== undefined) {
        latestBalance = result.balance
      }
    }

    context.onProgress(`Found ${allTransactions.length} transactions in ${files.length} files`)

    return { transactions: allTransactions, balance: latestBalance }
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bunx vitest run tests/main/providers/paypay.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/providers/types.ts src/main/providers/registry.ts \
  src/main/providers/paypay.ts tests/main/providers/paypay.test.ts \
  tests/fixtures/paypay/sample-export.csv
git commit -m "feat: add provider interface, registry, and PayPay CSV import provider"
```

---

### Task 9: Sync Orchestration

**Files:**
- Create: `src/main/sync.ts`
- Create: `tests/main/sync.test.ts`
- Modify: `src/main/ipc.ts`

- [ ] **Step 1: Write sync orchestration tests**

`tests/main/sync.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Database } from '../../src/main/database'
import { runSync } from '../../src/main/sync'

// Mock the provider
vi.mock('../../src/main/providers/registry', () => ({
  getProvider: () => ({
    type: 'paypay',
    sync: vi.fn().mockResolvedValue({
      transactions: [
        { externalId: 'tx1', date: '2026-01-01', amount: -500, description: 'Store' },
        { externalId: 'tx2', date: '2026-01-02', amount: -300, description: 'Cafe' }
      ],
      balance: 9200
    })
  })
}))

describe('runSync', () => {
  let db: Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  it('saves fetched transactions to database', async () => {
    const source = db.createSource({
      type: 'paypay',
      name: 'PayPay',
      config: { type: 'paypay', importPath: '/tmp' }
    })

    const result = await runSync(db, source, {
      promptPassword: async () => '',
      onProgress: () => {},
      dryRun: false
    })

    expect(result.newTransactions).toBe(2)
    expect(db.getTransactions(source.id)).toHaveLength(2)

    // Verify sync metadata was updated
    const updated = db.getSource(source.id)!
    expect(updated.lastSyncedAt).not.toBeNull()
    expect(updated.lastBalance).toBe(9200)
  })

  it('skips Pocketsmith push when no account mapped', async () => {
    const source = db.createSource({
      type: 'paypay',
      name: 'PayPay',
      config: { type: 'paypay', importPath: '/tmp' }
      // No pocketsmithAccountId
    })

    const result = await runSync(db, source, {
      promptPassword: async () => '',
      onProgress: () => {},
      dryRun: false
    })

    expect(result.newTransactions).toBe(2)
    expect(result.pushedTransactions).toBe(0)
  })

  it('does not push in dry run mode', async () => {
    const source = db.createSource({
      type: 'paypay',
      name: 'PayPay',
      config: { type: 'paypay', importPath: '/tmp' },
      pocketsmithAccountId: 42
    })

    const result = await runSync(db, source, {
      promptPassword: async () => '',
      onProgress: () => {},
      dryRun: true,
      apiKey: 'test-key'
    })

    expect(result.newTransactions).toBe(2)
    // In dry run, transactions aren't marked as pushed
    expect(db.getUnpushedTransactions(source.id)).toHaveLength(2)
  })

  it('deduplicates on re-sync', async () => {
    const source = db.createSource({
      type: 'paypay',
      name: 'PayPay',
      config: { type: 'paypay', importPath: '/tmp' }
    })

    await runSync(db, source, { promptPassword: async () => '', onProgress: () => {}, dryRun: false })
    const result = await runSync(db, source, { promptPassword: async () => '', onProgress: () => {}, dryRun: false })

    expect(result.newTransactions).toBe(0)
    expect(db.getTransactions(source.id)).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/main/sync.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement sync orchestration**

`src/main/sync.ts`:
```typescript
import type { Source, SyncResult, ParsedTransaction } from '../shared/types'
import type { Database } from './database'
import { getProvider } from './providers/registry'
import { PocketsmithClient } from './pocketsmith'

interface SyncOptions {
  promptPassword: (label: string) => Promise<string>
  onProgress: (message: string) => void
  dryRun: boolean
  apiKey?: string
}

export async function runSync(
  db: Database,
  source: Source,
  options: SyncOptions
): Promise<SyncResult> {
  const provider = getProvider(source.type)
  let newTransactions = 0
  let pushedTransactions = 0

  // Step 1: Fetch transactions from provider
  // If scraping fails mid-sync, save any transactions already parsed
  options.onProgress('Fetching transactions...')
  let providerResult: { transactions: ParsedTransaction[]; balance?: number }
  let syncError: string | undefined
  try {
    providerResult = await provider.sync(source.config, {
      promptPassword: options.promptPassword,
      onProgress: options.onProgress
    })
  } catch (err) {
    syncError = String(err)
    options.onProgress(`Scraping error: ${syncError}`)
    providerResult = { transactions: [] }
  }

  // Step 2: Save to database (even if partial)
  if (providerResult.transactions.length > 0) {
    options.onProgress('Saving transactions...')
    newTransactions = db.insertTransactions(source.id, providerResult.transactions)
  }

  // Step 3: Update sync metadata
  db.updateSourceSyncMeta(source.id, {
    lastBalance: providerResult.balance
  })

  // If scraping failed, return early with the error
  if (syncError) {
    return { newTransactions, pushedTransactions: 0, error: syncError }
  }

  // Step 4: Push unpushed transactions to Pocketsmith
  if (source.pocketsmithAccountId && options.apiKey) {
    const client = new PocketsmithClient(options.apiKey, {
      dryRun: options.dryRun,
      onLog: (msg) => options.onProgress(msg)
    })

    const unpushed = db.getUnpushedTransactions(source.id)
    options.onProgress(`Pushing ${unpushed.length} transactions to Pocketsmith...`)

    for (const tx of unpushed) {
      try {
        await client.pushTransaction(source.pocketsmithAccountId, {
          date: tx.date,
          amount: tx.amount,
          payee: tx.description
        })
        if (!options.dryRun) {
          db.markTransactionPushed(tx.id)
          pushedTransactions++
        }
      } catch (err) {
        options.onProgress(`Failed to push transaction ${tx.externalId}: ${err}`)
        break  // Stop on first failure, retry on next sync
      }
    }
  } else if (source.pocketsmithAccountId && !options.apiKey) {
    options.onProgress('Warning: No Pocketsmith API key configured, skipping push')
  }

  options.onProgress('Sync complete')
  return { newTransactions, pushedTransactions }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/main/sync.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Wire sync into IPC**

Update `src/main/ipc.ts` — replace the stubbed `sync:source` handler:
```typescript
import { runSync } from './sync'

// Inside registerIpcHandlers, replace the sync stub:
ipcMain.handle('sync:source', async (event, sourceId: number) => {
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
```

- [ ] **Step 6: Run all tests**

Run: `bunx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/sync.ts tests/main/sync.test.ts src/main/ipc.ts
git commit -m "feat: add sync orchestration with Pocketsmith push and dry run support"
```

---

### Task 10: Password Prompt Modal

**Files:**
- Create: `src/renderer/components/PasswordPrompt.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Build PasswordPrompt component**

`src/renderer/components/PasswordPrompt.tsx`:
```tsx
import { useState } from 'react'

interface Props {
  label: string
  onSubmit: (password: string) => void
  onCancel: () => void
}

export function PasswordPrompt({ label, onSubmit, onCancel }: Props): JSX.Element {
  const [password, setPassword] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(password)
    setPassword('')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 w-80"
      >
        <h3 className="text-sm font-semibold mb-3">Password Required</h3>
        <p className="text-sm text-neutral-400 mb-4">{label}</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="w-full bg-neutral-900 border border-neutral-600 rounded px-3 py-2 text-sm mb-4"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-neutral-700 hover:bg-neutral-600 rounded py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 bg-blue-600 hover:bg-blue-500 rounded py-2 text-sm"
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Wire password prompt into App.tsx**

Add to `src/renderer/App.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { PasswordPrompt } from './components/PasswordPrompt'
// ... existing imports ...

export function App(): JSX.Element {
  const [view, setView] = useState<View>({ type: 'empty' })
  const [passwordPrompt, setPasswordPrompt] = useState<{
    label: string
    resolve: (password: string) => void
  } | null>(null)

  useEffect(() => {
    const cleanup = window.api.onPasswordPrompt(async (label) => {
      return new Promise<string>((resolve) => {
        setPasswordPrompt({ label, resolve })
      })
    })
    return cleanup
  }, [])

  function handlePasswordSubmit(password: string) {
    passwordPrompt?.resolve(password)
    setPasswordPrompt(null)
  }

  function handlePasswordCancel() {
    passwordPrompt?.resolve('')  // Resolve with empty string to signal cancellation
    setPasswordPrompt(null)
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        onNavigate={setView}
        selectedSourceId={view.type === 'sourceDetail' ? view.sourceId : null}
      />
      <main className="flex-1 p-6 overflow-y-auto">
        {view.type === 'settings' && <Settings />}
        {view.type === 'addSource' && (
          <AddSource onCreated={(id) => setView({ type: 'sourceDetail', sourceId: id })} />
        )}
        {view.type === 'sourceDetail' && <SourceDetail sourceId={view.sourceId} />}
        {view.type === 'empty' && (
          <p className="text-neutral-400">Select a source or add a new one.</p>
        )}
      </main>
      {passwordPrompt && (
        <PasswordPrompt
          label={passwordPrompt.label}
          onSubmit={handlePasswordSubmit}
          onCancel={handlePasswordCancel}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/PasswordPrompt.tsx src/renderer/App.tsx
git commit -m "feat: add password prompt modal for bank scraping auth"
```

---

### Task 11: Bank Provider Skeletons & Scraper

**Files:**
- Create: `src/main/scraper.ts`
- Create: `src/main/providers/amex-japan.ts`
- Create: `src/main/providers/jp-post-bank.ts`
- Create: `src/main/providers/sbi-shinsei.ts`
- Modify: `src/main/providers/registry.ts`

These providers require iterative development against real bank websites. This task creates the skeleton infrastructure so that scraping can be built incrementally.

- [ ] **Step 1: Create scraper module**

`src/main/scraper.ts`:
```typescript
import { WebContentsView, type BrowserWindow } from 'electron'

export class Scraper {
  private view: WebContentsView | null = null

  constructor(private mainWindow: BrowserWindow) {}

  async open(url: string, bounds: { x: number; y: number; width: number; height: number }): Promise<WebContentsView> {
    this.view = new WebContentsView()
    this.mainWindow.contentView.addChildView(this.view)
    this.view.setBounds(bounds)
    this.view.webContents.loadURL(url)

    await new Promise<void>((resolve) => {
      this.view!.webContents.on('did-finish-load', () => resolve())
    })

    return this.view
  }

  async executeJS(script: string): Promise<any> {
    if (!this.view) throw new Error('No scraper view open')
    return this.view.webContents.executeJavaScript(script)
  }

  async waitForNavigation(): Promise<void> {
    if (!this.view) throw new Error('No scraper view open')
    return new Promise((resolve) => {
      this.view!.webContents.on('did-finish-load', () => resolve())
    })
  }

  close(): void {
    if (this.view) {
      this.mainWindow.contentView.removeChildView(this.view)
      this.view.webContents.close()
      this.view = null
    }
  }
}
```

- [ ] **Step 2: Create bank provider skeletons**

`src/main/providers/amex-japan.ts`:
```typescript
import type { SourceType, SourceConfig } from '../../shared/types'
import type { Provider, ProviderSyncResult, SyncContext } from './types'

export class AmexJapanProvider implements Provider {
  type: SourceType = 'amex-japan'

  async sync(config: SourceConfig, context: SyncContext): Promise<ProviderSyncResult> {
    if (config.type !== 'amex-japan') throw new Error('Invalid config type')

    // TODO: Implement scraping via Scraper class
    // 1. Open https://www.americanexpress.com/ja-jp/account/login
    // 2. Fill username from config.username
    // 3. Prompt for password via context.promptPassword('Amex Japan password')
    // 4. Submit login form
    // 5. Navigate to transaction list
    // 6. Scrape transactions from DOM
    // 7. Parse into ParsedTransaction[]

    throw new Error('Amex Japan provider not yet implemented — requires interactive scraping development')
  }
}
```

`src/main/providers/jp-post-bank.ts`:
```typescript
import type { SourceType, SourceConfig } from '../../shared/types'
import type { Provider, ProviderSyncResult, SyncContext } from './types'

export class JPPostBankProvider implements Provider {
  type: SourceType = 'jp-post-bank'

  async sync(config: SourceConfig, context: SyncContext): Promise<ProviderSyncResult> {
    if (config.type !== 'jp-post-bank') throw new Error('Invalid config type')

    // TODO: Implement scraping
    // 1. Open https://www.jp-bank.japanpost.jp/ direct banking login
    // 2. Fill customer number from config.customerNumber
    // 3. Prompt for password
    // 4. Navigate to transaction history
    // 5. Scrape and parse transactions

    throw new Error('JP Post Bank provider not yet implemented — requires interactive scraping development')
  }
}
```

`src/main/providers/sbi-shinsei.ts`:
```typescript
import type { SourceType, SourceConfig } from '../../shared/types'
import type { Provider, ProviderSyncResult, SyncContext } from './types'

export class SBIShinseiProvider implements Provider {
  type: SourceType = 'sbi-shinsei'

  async sync(config: SourceConfig, context: SyncContext): Promise<ProviderSyncResult> {
    if (config.type !== 'sbi-shinsei') throw new Error('Invalid config type')

    // TODO: Implement scraping
    // 1. Open https://www.sbishinseibank.co.jp login page
    // 2. Fill username from config.username
    // 3. Prompt for password
    // 4. Handle potential 2FA (user can interact via visible WebContentsView)
    // 5. Navigate to transaction history
    // 6. Scrape and parse transactions

    throw new Error('SBI Shinsei provider not yet implemented — requires interactive scraping development')
  }
}
```

- [ ] **Step 3: Register all providers**

Update `src/main/providers/registry.ts`:
```typescript
import type { Provider } from './types'
import type { SourceType } from '../../shared/types'
import { PayPayProvider } from './paypay'
import { AmexJapanProvider } from './amex-japan'
import { JPPostBankProvider } from './jp-post-bank'
import { SBIShinseiProvider } from './sbi-shinsei'

const providers: Record<string, Provider> = {
  'paypay': new PayPayProvider(),
  'amex-japan': new AmexJapanProvider(),
  'jp-post-bank': new JPPostBankProvider(),
  'sbi-shinsei': new SBIShinseiProvider()
}

export function getProvider(type: SourceType): Provider {
  const provider = providers[type]
  if (!provider) throw new Error(`No provider for source type: ${type}`)
  return provider
}
```

- [ ] **Step 4: Verify app compiles and launches**

Run: `bun run dev`
Expected: App launches. PayPay sync works end-to-end (with CSV files in the import directory). Bank sources show "not yet implemented" error when sync is attempted.

- [ ] **Step 5: Run all tests**

Run: `bunx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/scraper.ts src/main/providers/amex-japan.ts \
  src/main/providers/jp-post-bank.ts src/main/providers/sbi-shinsei.ts \
  src/main/providers/registry.ts
git commit -m "feat: add scraper infrastructure and bank provider skeletons"
```

---

## Summary

After completing all tasks, the app will have:

1. **Working end-to-end flow** for PayPay (CSV import → database → Pocketsmith push)
2. **Full UI** with source management, settings, transaction list, and password prompt
3. **Tested core logic** (database, Pocketsmith client, PayPay parser, sync orchestration)
4. **Scraper infrastructure** ready for bank provider implementation
5. **Bank provider skeletons** with clear TODOs for interactive development

### Next steps (not in this plan):
- Implement bank scraping providers one at a time against real websites
- Confirm PayPay CSV format against real exports and adjust parser
- Add electron-builder packaging config for distributing the .app
- Polish UI (loading states, error boundaries, keyboard shortcuts)
