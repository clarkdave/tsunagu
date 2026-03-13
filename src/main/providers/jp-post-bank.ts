import { createHash } from 'node:crypto'
import type { SourceConfig, ParsedTransaction } from '../../shared/types'
import type { Provider, ProviderSyncResult, SyncContext } from './types'

export interface JPPostRawTransaction {
  date: string        // Reiwa era, e.g. "8-03-09"
  incoming: string    // e.g. "1,634,506円" or ""
  outgoing: string    // e.g. "20,000円" or ""
  description: string // e.g. "ＲＴ　（ＰＡＹＰＡＹ）"
  balance: string     // e.g. "1,781,822円"
}

/** Convert Reiwa-era date (e.g. "8-03-09") to ISO date "2026-03-09". Reiwa started 2019. */
export function reiwaToISO(reiwaDate: string): string {
  const parts = reiwaDate.split('-')
  if (parts.length !== 3) return reiwaDate
  const year = 2018 + Number(parts[0])
  return `${year}-${parts[1]}-${parts[2]}`
}

/** Parse a yen string like "1,634,506円" into a number. Returns 0 for empty. */
function parseYen(text: string): number {
  const cleaned = text.replace(/[円,\s]/g, '')
  if (cleaned === '') return 0
  return Number(cleaned)
}

/** Convert raw JP Post Bank transaction data into ParsedTransactions. */
export function parseJPPostTransactions(raw: JPPostRawTransaction[]): ParsedTransaction[] {
  return raw.map((t) => {
    const date = reiwaToISO(t.date)
    const incoming = parseYen(t.incoming)
    const outgoing = parseYen(t.outgoing)
    const amount = incoming > 0 ? incoming : -outgoing
    const description = t.description.replace(/\u00a0/g, '').trim()
    const balance = parseYen(t.balance)

    // No unique transaction ID from the bank — generate deterministic ID from fields
    const hash = createHash('sha256')
      .update(`${date}|${description}|${amount}|${balance}`)
      .digest('hex')
      .slice(0, 16)

    return {
      externalId: hash,
      date,
      amount,
      description,
      rawData: {
        reiwaDate: t.date,
        balance
      }
    }
  })
}

/** JS to extract transaction rows from the current page. Skips "通信文" rows. */
const EXTRACT_TRANSACTIONS_JS = `
  (function() {
    var rows = document.querySelectorAll('table.tblTy06 tbody tr');
    var transactions = [];
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].querySelectorAll('td');
      if (cells.length < 5) continue;
      // Skip "通信文" (communication note) rows
      if (cells[0].textContent.trim() === '通信文') continue;
      transactions.push({
        date: cells[0].textContent.trim(),
        incoming: cells[1].textContent.trim(),
        outgoing: cells[2].textContent.trim(),
        description: cells[3].textContent.trim(),
        balance: cells[4].textContent.trim()
      });
    }
    return transactions;
  })()
`

/** JS to check if a visible "次のページ" (next page) link exists and click it. Returns true if clicked. */
const CLICK_NEXT_PAGE_JS = `
  (function() {
    var span = document.querySelector('span.next');
    if (!span || span.style.visibility === 'hidden') return false;
    var link = span.querySelector('a');
    if (link && link.textContent.trim() === '次のページ') {
      link.click();
      return true;
    }
    return false;
  })()
`

/** JS to extract the balance from the dashboard. */
const EXTRACT_BALANCE_JS = `
  (function() {
    var el = document.querySelector('.txtBalanceTy01 span');
    return el ? el.textContent.trim() : null;
  })()
`

export class JPPostBankProvider implements Provider {
  type: 'jp-post-bank' = 'jp-post-bank'

  async sync(config: SourceConfig, context: SyncContext): Promise<ProviderSyncResult> {
    if (config.type !== 'jp-post-bank') throw new Error('Invalid config type')
    if (!context.scraper) throw new Error('JP Post Bank provider requires a scraper')

    const scraper = context.scraper

    // Step 1: Open start page and click login link
    context.onProgress('Opening JP Post Bank...')
    await scraper.open('https://www.jp-bank.japanpost.jp/index.html')
    await scraper.clickAndWaitForNavigation(`
      document.querySelector('a[href*="direct_login"]').click();
    `)

    // Step 2: Fill customer number (split into 4-4-5)
    context.onProgress('Filling customer number...')
    const custNum = config.customerNumber.replace(/-/g, '')
    const part1 = custNum.slice(0, 4)
    const part2 = custNum.slice(4, 8)
    const part3 = custNum.slice(8, 13)

    await scraper.executeJS(`
      (function() {
        document.querySelector('input[name="okyakusamaBangou1"]').value = ${JSON.stringify(part1)};
        document.querySelector('input[name="okyakusamaBangou2"]').value = ${JSON.stringify(part2)};
        document.querySelector('input[name="okyakusamaBangou3"]').value = ${JSON.stringify(part3)};
      })()
    `)

    // Click "ログインパスワードを入力してログイン"
    await scraper.clickAndWaitForNavigation(`
      document.querySelector('input[name="U010103"]').click();
    `)

    // Step 3: Fill password
    const password = await scraper.promptPassword('ゆうちょダイレクト ログインパスワード')

    context.onProgress('Logging in...')
    await scraper.executeJS(`
      document.querySelector('input[name="loginPassword"]').value = ${JSON.stringify(password)};
    `)

    // Click "ログイン"
    await scraper.clickAndWaitForNavigation(`
      document.querySelector('input[name="U010302"]').click();
    `)

    // Step 4: Click through intermediate page to dashboard
    context.onProgress('Navigating to dashboard...')
    await scraper.waitForSelector('a')
    // Click "ダイレクトトップ" link
    await scraper.clickAndWaitForNavigation(`
      (function() {
        var links = document.querySelectorAll('a');
        for (var i = 0; i < links.length; i++) {
          if (links[i].textContent.trim() === 'ダイレクトトップ') {
            links[i].click();
            return;
          }
        }
      })()
    `)

    // Step 5: Extract balance from dashboard
    context.onProgress('Reading balance...')
    await scraper.waitForSelector('.txtBalanceTy01')
    const balanceText: string | null = await scraper.executeJS(EXTRACT_BALANCE_JS)
    const balance = balanceText ? parseYen(balanceText) : undefined

    // Step 6: Navigate to transaction list
    context.onProgress('Opening transaction history...')
    // Click "もっと見る" link
    await scraper.clickAndWaitForNavigation(`
      (function() {
        var links = document.querySelectorAll('a.more');
        for (var i = 0; i < links.length; i++) {
          if (links[i].textContent.trim() === 'もっと見る') {
            links[i].click();
            return;
          }
        }
      })()
    `)

    // Step 7: Change filters to show all transactions
    context.onProgress('Setting filters to show all transactions...')
    // Click "表示条件を変更"
    await scraper.executeJS(`
      var link = document.querySelector('a.viewUp');
      if (link) link.click();
    `)
    // Wait for the filter section to become visible
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Ensure "期間を選択" is selected and choose "全期間"
    await scraper.executeJS(`
      (function() {
        var periodRadio = document.getElementById('radio02-01');
        if (periodRadio) periodRadio.checked = true;
        var allPeriodRadio = document.getElementById('radio03-07');
        if (allPeriodRadio) allPeriodRadio.checked = true;
      })()
    `)

    // Click "表示する"
    await scraper.clickAndWaitForNavigation(`
      document.querySelector('input[name="U070204"]').click();
    `)

    // Step 8: Extract transactions from all pages
    const allRawTransactions: JPPostRawTransaction[] = []
    let page = 1

    while (true) {
      context.onProgress(`Extracting transactions (page ${page})...`)
      await scraper.waitForSelector('table.tblTy06')
      const pageTransactions: JPPostRawTransaction[] = await scraper.executeJS(EXTRACT_TRANSACTIONS_JS)
      allRawTransactions.push(...pageTransactions)

      // Check if there's a next page
      const hasNext: boolean = await scraper.executeJS(`
        (function() {
          var span = document.querySelector('span.next');
          return !!(span && span.style.visibility !== 'hidden');
        })()
      `)
      if (!hasNext) break
      await scraper.clickAndWaitForNavigation(CLICK_NEXT_PAGE_JS)
      page++
    }

    const transactions = parseJPPostTransactions(allRawTransactions)
    context.onProgress(`Found ${transactions.length} transactions across ${page} pages`)

    scraper.close()

    return { transactions, balance }
  }
}
