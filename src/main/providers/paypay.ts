import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { SourceConfig, ParsedTransaction } from '../../shared/types'
import type { Provider, ProviderSyncResult, SyncContext } from './types'

interface PayPayParseResult {
  transactions: ParsedTransaction[]
  balance?: number
}

export function parsePayPayCSV(csv: string): PayPayParseResult {
  const lines = csv.trim().split('\n')
  if (lines.length <= 1) return { transactions: [] }

  const transactions: ParsedTransaction[] = []
  let latestBalance: number | undefined

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const parts = line.split(',')
    if (parts.length < 4) continue

    const datetime = parts[0]
    const description = parts[1]
    const amount = Number(parts[2])
    const balanceAfter = Number(parts[3])
    const date = datetime.split(' ')[0]

    const hash = createHash('sha256')
      .update(`${datetime}|${description}|${amount}`)
      .digest('hex')
      .slice(0, 16)

    transactions.push({
      externalId: `paypay-${hash}`,
      date,
      amount,
      description,
      rawData: { datetime, balanceAfter }
    })

    if (i === 1) latestBalance = balanceAfter
  }

  return { transactions, balance: latestBalance }
}

export class PayPayProvider implements Provider {
  type: 'paypay' = 'paypay'

  async sync(config: SourceConfig, context: SyncContext): Promise<ProviderSyncResult> {
    if (config.type !== 'paypay') throw new Error('Invalid config type')

    context.onProgress('Scanning import directory...')

    const dir = config.importPath
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.csv'))
      .sort()

    const allTransactions: ParsedTransaction[] = []
    let latestBalance: number | undefined

    for (const file of files) {
      context.onProgress(`Reading ${file}...`)
      const csv = readFileSync(path.join(dir, file), 'utf-8')
      const result = parsePayPayCSV(csv)
      allTransactions.push(...result.transactions)

      if (result.balance !== undefined) {
        latestBalance = result.balance
      }
    }

    context.onProgress(`Found ${allTransactions.length} transactions in ${files.length} files`)

    return { transactions: allTransactions, balance: latestBalance }
  }
}
