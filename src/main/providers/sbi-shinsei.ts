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
