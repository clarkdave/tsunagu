# Tsunagu Design Spec

Desktop app (Electron) that fetches transactions from Japanese financial sources and pushes them to Pocketsmith.

## Tech Stack

- **Runtime:** Electron (Node.js main process + Chromium renderer)
- **UI:** React + Vite (renderer process)
- **Language:** Strict TypeScript throughout
- **Database:** SQLite via better-sqlite3
- **Bank scraping:** Electron BrowserView (built-in Chromium, visible to user)
- **Package manager:** bun

## Architecture

Plugin-based provider architecture. Each financial source is a self-contained provider module implementing a common interface. The main process orchestrates scraping, database operations, and Pocketsmith API calls. The renderer communicates via IPC.

### Process Model

- **Main process:** Owns database, Pocketsmith client, BrowserView scraping, provider orchestration
- **Renderer process:** React UI, communicates via `ipcRenderer.invoke` / `ipcMain.handle`
- No direct DB access from renderer

### Project Structure

```
tsunagu/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── electron-builder.yml
├── src/
│   ├── main/
│   │   ├── index.ts              # App entry, window creation
│   │   ├── ipc.ts                # IPC handler registration
│   │   ├── database.ts           # SQLite setup, migrations, queries
│   │   ├── pocketsmith.ts        # Pocketsmith API client
│   │   ├── scraper.ts            # BrowserView orchestration
│   │   └── providers/
│   │       ├── types.ts          # Provider interface
│   │       ├── amex-japan.ts
│   │       ├── jp-post-bank.ts
│   │       ├── sbi-shinsei.ts
│   │       └── paypay.ts         # CSV import (no scraping)
│   ├── renderer/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── components/
│   │       ├── Sidebar.tsx
│   │       ├── SourceList.tsx
│   │       ├── SourceDetail.tsx
│   │       ├── AddSource.tsx
│   │       ├── Settings.tsx
│   │       └── TransactionList.tsx
│   └── shared/
│       └── types.ts              # Types shared between main & renderer
```

## Data Model

### Tables

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE sources (
  id                      INTEGER PRIMARY KEY,
  type                    TEXT NOT NULL,  -- amex-japan | jp-post-bank | sbi-shinsei | paypay
  name                    TEXT NOT NULL,
  config                  TEXT NOT NULL,  -- JSON: username, import path, etc. NO passwords
  pocketsmith_account_id  INTEGER,
  last_synced_at          TEXT,
  last_balance            REAL,
  created_at              TEXT NOT NULL
);

CREATE TABLE transactions (
  id                    INTEGER PRIMARY KEY,
  source_id             INTEGER NOT NULL REFERENCES sources(id),
  external_id           TEXT NOT NULL,
  date                  TEXT NOT NULL,     -- YYYY-MM-DD
  amount                REAL NOT NULL,
  description           TEXT NOT NULL,
  raw_data              TEXT,              -- JSON: original scraped data
  pocketsmith_pushed_at TEXT,              -- non-null = pushed
  created_at            TEXT NOT NULL,
  UNIQUE(source_id, external_id)
);
```

### Deduplication

Each provider generates an `external_id` from transaction data. Banks with real transaction IDs use those; otherwise hash `date + amount + description`. The UNIQUE constraint on `(source_id, external_id)` prevents duplicates at the DB level (INSERT OR IGNORE).

## Provider Interface

```typescript
interface Provider {
  type: SourceType;
  sync(config: SourceConfig, context: SyncContext): Promise<SyncResult>;
}

interface SyncContext {
  browserView?: BrowserView;
  promptPassword: (label: string) => Promise<string>;
  onProgress: (message: string) => void;
}

interface SyncResult {
  transactions: ParsedTransaction[];
  balance?: number;
}
```

### Providers

- **AmexJapan:** BrowserView login at americanexpress.com/ja-jp/account, scrape transaction list
- **JPPostBank:** BrowserView login at jp-bank.japanpost.jp, scrape transaction list
- **SBIShinsei:** BrowserView login at sbishinseibank.co.jp, may need 2FA handling (shown to user via BrowserView)
- **PayPay:** Read CSV files from configured iCloud directory, parse transactions

## Sync Flow

1. User clicks "Sync" on a source
2. Main process creates a BrowserView (skipped for PayPay)
3. Provider's `sync()` drives the browser or reads CSVs
4. Password needed → `promptPassword` triggers dialog in renderer
5. Provider returns parsed transactions
6. Main process inserts new transactions (dedup via UNIQUE, ignoring conflicts)
7. Main process pushes un-pushed transactions to Pocketsmith (unless dry run)
8. UI updates with results

## Pocketsmith Integration

- **Fetch accounts:** `GET /users/{id}/transaction_accounts` — populates per-source mapping dropdown
- **Push transactions:** `POST /transaction_accounts/{id}/transactions` — sends payee, amount, date
- **API key:** Stored in `settings` table, masked in UI after being set

### Dry Run Mode

Global toggle in settings. When enabled, the push step logs each API call (method, URL, body) to a visible log in the UI but doesn't execute. `pocketsmith_pushed_at` stays null.

## UI Design

Dark-themed, two-panel layout.

### Left Sidebar
- Source list: name, last synced time, last known balance
- Selected source highlighted with accent color border
- "+ Add Source" button near bottom
- Settings button at very bottom

### Right Panel — Source Detail
- Source name and last sync time
- "Sync Now" and "Settings" buttons
- Transaction list: date, description, amount, push status (checkmark = pushed, circle = not pushed)

### Add Source Flow
- Step 1: Choose source type (Amex Japan, JP Post Bank, SBI Shinsei, PayPay)
- Step 2: Configure — display name, username/customer number (type-dependent), Pocketsmith account mapping

### Settings Page
- Pocketsmith API key (masked, with Change button)
- Data directory path (defaults to `~/Library/Mobile Documents/com~apple~CloudDocs/Tsunagu/`, with Browse button)
- Dry run mode toggle

## Storage

- SQLite database stored at user-configurable path, defaulting to iCloud Drive (`~/Library/Mobile Documents/com~apple~CloudDocs/Tsunagu/`)
- Settings stored in same database (`settings` table)
- No passwords stored anywhere — prompted each sync
