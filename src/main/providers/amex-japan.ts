import type { SourceConfig, ParsedTransaction } from '../../shared/types'
import type { Provider, ProviderSyncResult, SyncContext } from './types'

export interface AmexRawTransaction {
  id: string
  status: string
  date: string
  description: string
  referenceId: string
  amount: string
}

/** Parse the yen amount text from Amex (e.g. "￥31,419" or "￥491") into a negative number (credit card charges). */
function parseAmexAmount(text: string): number {
  const cleaned = text.replace(/[￥¥,\s]/g, '')
  const num = Number(cleaned)
  if (isNaN(num)) return 0
  // Amex shows charges as positive numbers — negate since these are expenses
  return -num
}

/** Parse the balance text from the dashboard (e.g. "￥236,285") into a number. */
export function parseAmexBalance(text: string): number | undefined {
  const cleaned = text.replace(/[￥¥,\s]/g, '')
  if (cleaned === '') return undefined
  const num = Number(cleaned)
  return isNaN(num) ? undefined : num
}

/** Convert raw Amex transaction data (extracted from DOM) into ParsedTransactions. */
export function parseAmexTransactions(raw: AmexRawTransaction[]): ParsedTransaction[] {
  return raw
    .filter((t) => t.status === 'posted')
    .map((t) => ({
      externalId: t.referenceId,
      date: t.date,
      amount: parseAmexAmount(t.amount),
      description: t.description.trim(),
      rawData: {
        amexId: t.id,
        status: t.status,
        referenceId: t.referenceId
      }
    }))
}

/** JS to execute in the browser to extract transaction data from the search results page. */
const EXTRACT_TRANSACTIONS_JS = `
  (function() {
    var rows = document.querySelectorAll('tr[data-testid^="transaction-row-"]');
    return Array.from(rows).map(function(row) {
      var p = row.querySelector('p[status]');
      if (!p) return null;
      return {
        id: p.getAttribute('id') || '',
        status: p.getAttribute('status') || '',
        date: p.getAttribute('date') || '',
        description: p.getAttribute('description') || '',
        referenceId: p.getAttribute('reference_id') || '',
        amount: p.textContent.trim()
      };
    }).filter(Boolean);
  })()
`

/** JS to extract the balance from the dashboard page. */
const EXTRACT_BALANCE_JS = `
  (function() {
    var el = document.querySelector('[data-locator-id="new_usage_title_amount"]');
    return el ? el.textContent.trim() : null;
  })()
`

export class AmexJapanProvider implements Provider {
  type: 'amex-japan' = 'amex-japan'

  async sync(config: SourceConfig, context: SyncContext): Promise<ProviderSyncResult> {
    if (config.type !== 'amex-japan') throw new Error('Invalid config type')
    if (!context.scraper) throw new Error('Amex Japan provider requires a scraper')

    const scraper = context.scraper

    // Step 1: Open login page
    context.onProgress('Opening Amex Japan login page...')
    await scraper.open('https://www.americanexpress.com/ja-jp/account/login')

    // Step 2: Prompt for password in the scraper window, then fill credentials
    const password = await scraper.promptPassword('Amex Japan パスワード')

    context.onProgress('Logging in...')
    await scraper.executeJS(`
      (function() {
        var nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        var userInput = document.getElementById('eliloUserID');
        var passInput = document.getElementById('eliloPassword');
        nativeSetter.call(userInput, ${JSON.stringify(config.username)});
        userInput.dispatchEvent(new Event('input', { bubbles: true }));
        nativeSetter.call(passInput, ${JSON.stringify(password)});
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `)

    await scraper.clickAndWaitForNavigation(`
      document.querySelector('button[type="submit"]').click();
    `)

    // Step 3: Extract balance from dashboard
    context.onProgress('Reading balance...')
    await scraper.waitForSelector('[data-locator-id="new_usage_title_amount"]')
    const balanceText: string | null = await scraper.executeJS(EXTRACT_BALANCE_JS)
    const balance = balanceText ? parseAmexBalance(balanceText) : undefined

    // Step 4: Navigate to search page
    context.onProgress('Navigating to transaction search...')
    await scraper.clickAndWaitForNavigation(`
      window.location.href = 'https://global.americanexpress.com/activity/search';
    `)

    // Wait for the date picker to render (SPA content loads after page load)
    await scraper.waitForSelector('[aria-label="Start date"]')

    // Calculate date range: 2 months ago to today
    const now = new Date()
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())
    const startYear = String(twoMonthsAgo.getFullYear())
    const startMonth = String(twoMonthsAgo.getMonth() + 1).padStart(2, '0')
    const startDay = String(twoMonthsAgo.getDate()).padStart(2, '0')
    const endYear = String(now.getFullYear())
    const endMonth = String(now.getMonth() + 1).padStart(2, '0')
    const endDay = String(now.getDate()).padStart(2, '0')

    context.onProgress(`Searching transactions from ${startYear}-${startMonth}-${startDay}...`)

    // Fill in the date range inputs using stable aria-label selectors
    await scraper.executeJS(`
      (function() {
        function setInput(input, value) {
          var nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        var startGroup = document.querySelector('[aria-label="Start date"]');
        if (startGroup) {
          var inputs = startGroup.querySelectorAll('input[type="text"]');
          setInput(inputs[0], ${JSON.stringify(startYear)});
          setInput(inputs[1], ${JSON.stringify(startMonth)});
          setInput(inputs[2], ${JSON.stringify(startDay)});
        }

        var endGroup = document.querySelector('[aria-label="End date"]');
        if (endGroup) {
          var inputs = endGroup.querySelectorAll('input[type="text"]');
          setInput(inputs[0], ${JSON.stringify(endYear)});
          setInput(inputs[1], ${JSON.stringify(endMonth)});
          setInput(inputs[2], ${JSON.stringify(endDay)});
        }
      })()
    `)

    // Click the search button (find by text content, avoiding fragile CSS class selectors)
    await scraper.executeJS(`
      (function() {
        var buttons = document.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
          if (buttons[i].textContent.trim() === '検索') {
            buttons[i].click();
            return;
          }
        }
      })()
    `)

    // Wait for transaction table to appear in the DOM
    context.onProgress('Waiting for search results...')
    await scraper.waitForSelector('[data-testid="axp-activity-feed-transactions-table"]')

    // Step 5: Extract transactions
    context.onProgress('Extracting transactions...')
    const rawTransactions: AmexRawTransaction[] = await scraper.executeJS(EXTRACT_TRANSACTIONS_JS)

    const transactions = parseAmexTransactions(rawTransactions)
    context.onProgress(`Found ${transactions.length} settled transactions`)

    scraper.close()

    return { transactions, balance }
  }
}
