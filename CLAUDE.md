# Tsunagu

Electron desktop app that syncs transactions from Japanese financial sources to Pocketsmith. Runs entirely locally — no server, no stored passwords.

## Quick Reference

```bash
bun run dev          # Start dev mode (rebuilds native modules + hot reload)
bun run build        # Production build → out/
bun test             # Run tests (rebuilds better-sqlite3 first)
bun test:watch       # Tests in watch mode
```

Build check without starting Electron:
```bash
npx electron-vite build
```

## Architecture

Three Electron processes, each with its own tsconfig:

- **Main** (`src/main/`, `tsconfig.node.json`) — Node.js process: database, IPC handlers, scraping, sync orchestration, Pocketsmith API
- **Preload** (`src/preload/`, `tsconfig.node.json`) — Typed bridge exposing `window.api` via `contextBridge`
- **Renderer** (`src/renderer/`, `tsconfig.web.json`) — React 19 UI, no direct Node/DB access

All communication between renderer and main goes through typed IPC. The full API surface is defined in `src/shared/types.ts` as the `TsunaguAPI` interface. Any new IPC method must be added in three places:

1. `src/shared/types.ts` — add to `TsunaguAPI` interface
2. `src/main/ipc.ts` — add `ipcMain.handle(...)` handler
3. `src/preload/index.ts` — add `ipcRenderer.invoke(...)` mapping

## Database

SQLite via `better-sqlite3` with WAL mode. Schema lives in `src/main/database.ts` as a `MIGRATIONS` array. Each entry is a SQL statement; the array index is the migration version (tracked via `PRAGMA user_version`).

**To add a migration:** append a new SQL string to the `MIGRATIONS` array. Never modify existing entries.

Key constraints:
- `transactions` has `UNIQUE(source_id, external_id)` for deduplication
- `INSERT OR IGNORE` is used for transaction upserts
- Foreign keys are enabled (`PRAGMA foreign_keys = ON`)

## Providers

Each financial source has a provider in `src/main/providers/`. Providers implement the `Provider` interface from `src/main/providers/types.ts`:

```typescript
interface Provider {
  type: SourceType
  sync(config: SourceConfig, context: SyncContext): Promise<ProviderSyncResult>
}
```

Registered in `src/main/providers/registry.ts`.

**Two kinds of providers:**
- **File-based** (PayPay): reads CSV files from a local directory, no scraper needed
- **Scraper-based** (Amex Japan, JP Post Bank): opens a `BrowserWindow` to navigate the bank's website, extract data via `executeJavaScript`

**Provider design rules:**
- Scraping logic is inherently untestable — keep it thin
- Extract all parsing/transformation into exported pure functions (e.g. `parseAmexTransactions`, `reiwaToISO`)
- Unit tests go in `tests/main/providers/` and cover the parsing functions
- Passwords are never stored; prompted via in-page overlay (`scraper.promptPassword`)
- Use `clickAndWaitForNavigation` (not separate click + waitForNavigation) to avoid race conditions
- Use `waitForSelector` for SPA content that loads after `did-finish-load`

## Sync Flow

Orchestrated in `src/main/sync.ts`:

1. Provider fetches transactions (and optionally a balance)
2. Transactions saved to DB (deduped by `external_id`)
3. Source sync metadata updated (`last_synced_at`, `last_balance`)
4. Unpushed transactions pushed to Pocketsmith (if account mapped + API key configured)
5. Each pushed transaction marked with `pocketsmith_pushed_at` and `pocketsmith_transaction_id`

Dry run mode (toggled in Settings) logs Pocketsmith API calls to console without executing them.

## Pocketsmith Integration

- API key and user ID stored in the `settings` table
- User ID is fetched and saved when the API key is first configured (via `/me` endpoint)
- Transaction accounts fetched via `/users/{id}/transaction_accounts`
- Transactions pushed via `POST /transaction_accounts/{id}/transactions` with `needs_review: true`

## Frontend

React 19 + Tailwind CSS 4 (via `@tailwindcss/vite` plugin). Dark theme (`bg-neutral-950`).

Two-panel layout: `Sidebar` (source list) + main content area. Navigation is state-based via a `View` discriminated union in `App.tsx`.

View types: `empty`, `settings`, `addSource`, `sourceDetail`, `sourceSettings`

Cross-component refresh pattern: `(window as any).__refreshSources?.()` triggers sidebar reload after mutations.

## Testing

Vitest 4 with Node environment. Tests live in `tests/` mirroring `src/` structure.

Note: `better-sqlite3` and `electron` tests may fail under `bun test` due to native module ABI mismatches. The provider parsing tests (which don't use native modules) are the primary test suite. Use `npx vitest run` if `bun test` has issues with native modules.

## Build

electron-vite 5 handles the three-process build:
- Main → `out/main/index.js` (ESM)
- Preload → `out/preload/index.cjs` (CJS, required by Electron)
- Renderer → `out/renderer/` (Vite client build)

Preload changes require a full app restart (not just HMR).
