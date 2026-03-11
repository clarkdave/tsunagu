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
- **Security:** `nodeIntegration: false`, `contextIsolation: true`. A preload script exposes a typed API object via `contextBridge.exposeInMainWorld`

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

**Known limitation:** Hash-based dedup can collide if two transactions on the same day have identical amount and description (e.g. two identical convenience store purchases). This is acceptable for now — can be mitigated later by incorporating row index or time if available.

### Migrations

Schema versioning via a `schema_version` pragma or settings key. On app startup, `database.ts` checks the current version and runs any pending migrations sequentially. Migrations are defined as an ordered array of SQL statements in `database.ts`.

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
- **PayPay:** Read export files from configured iCloud directory, parse transactions. Files are left in place after import (dedup prevents re-import). Exact file format TBD — will be determined from actual PayPay exports

## Sync Flow

1. User clicks "Sync" on a source
2. Main process creates a BrowserView (skipped for PayPay)
3. The BrowserView is shown in the right panel area, replacing the transaction list, so the user can observe the scraping and handle 2FA if needed
4. Provider's `sync()` drives the browser or reads CSVs
5. Password needed → `promptPassword` triggers an in-app modal dialog over the main window
6. Provider returns parsed transactions
7. BrowserView is hidden, right panel returns to transaction list view
8. Main process inserts new transactions (dedup via UNIQUE, ignoring conflicts)
9. Main process pushes ALL un-pushed transactions for the source to Pocketsmith (including any from prior failed pushes), one at a time, unless dry run
10. UI updates with results

### Error Handling

- If scraping fails mid-sync, any transactions already parsed are still saved to the database. The error is shown to the user in the right panel.
- If Pocketsmith push fails partway through, successfully pushed transactions are marked (`pocketsmith_pushed_at` set). Remaining un-pushed transactions can be retried on the next sync.
- If a source has no `pocketsmith_account_id` mapped, the sync still scrapes and saves transactions but skips the push step with a warning.

## Pocketsmith Integration

- **Get current user:** `GET /me` — retrieves user ID on API key setup
- **Fetch accounts:** `GET /users/{id}/transaction_accounts` — populates per-source mapping dropdown
- **Push transactions:** `POST /transaction_accounts/{id}/transactions` — sends payee, amount, date
- **API key:** Stored in `settings` table as plaintext (acceptable since the entire DB is local/iCloud-only, not shared). Masked in UI after being set.

### Dry Run Mode

Global toggle in settings. When enabled, the push step logs each API call (method, URL, body) to a log area shown below the transaction list in the source detail view. `pocketsmith_pushed_at` stays null.

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

### Source Settings (Edit)
- Same form as Add Source Step 2, pre-filled with existing values
- All fields editable: display name, username, Pocketsmith account mapping

### Settings Page
- Pocketsmith API key (masked, with Change button)
- Data directory path (defaults to `~/Library/Mobile Documents/com~apple~CloudDocs/Tsunagu/`, with Browse button)
- Dry run mode toggle

## Storage

- SQLite database stored at user-configurable path, defaulting to iCloud Drive (`~/Library/Mobile Documents/com~apple~CloudDocs/Tsunagu/`)
- SQLite WAL mode enabled for safer iCloud syncing (reduces corruption risk vs default journal mode)
- The data directory setting is stored in Electron's `app.getPath('userData')` (local, outside iCloud) so the app knows where to find the database on startup. Changing the path in settings points the app at a different (possibly new) database — no automatic migration of data.
- Settings stored in same database (`settings` table)
- No passwords stored anywhere — prompted each sync
