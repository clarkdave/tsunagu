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
