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
