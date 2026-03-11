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
        break
      }
    }
  } else if (source.pocketsmithAccountId && !options.apiKey) {
    options.onProgress('Warning: No Pocketsmith API key configured, skipping push')
  } else if (!source.pocketsmithAccountId) {
    options.onProgress('No Pocketsmith account mapped for this source, skipping push')
  }

  options.onProgress('Sync complete')
  return { newTransactions, pushedTransactions }
}
