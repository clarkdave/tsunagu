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
