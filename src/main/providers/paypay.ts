import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { SourceConfig, ParsedTransaction } from '../../shared/types'
import type { Provider, ProviderSyncResult, SyncContext } from './types'

interface PayPayParseResult {
  transactions: ParsedTransaction[]
}

/** Parse a CSV line respecting quoted fields (handles commas inside quotes). */
function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields
}

/** Parse a yen amount string like "5,990" or "501" into a number. Returns null for "-". */
function parseYenAmount(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '-' || trimmed === '') return null
  return Number(trimmed.replace(/,/g, ''))
}

export function parsePayPayCSV(csv: string): PayPayParseResult {
  const lines = csv.trim().split('\n')
  if (lines.length <= 1) return { transactions: [] }

  const transactions: ParsedTransaction[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = parseCSVLine(line)
    if (fields.length < 13) continue

    const datetime = fields[0]         // "2026/03/11 10:20:04"
    const amountOutgoing = fields[1]   // "501" or "5,990" or "-"
    const amountIncoming = fields[2]   // "491" or "20,000" or "-"
    const transactionType = fields[7]  // "Payment", "Top-Up", "Points, Balance Earned", etc.
    const businessName = fields[8]     // "スターバックス コーヒー - 三宮磯上通店"
    const method = fields[9]           // "ゆうちょ銀行 *****61"
    const transactionId = fields[12]   // "04931021063461429249"

    // Skip Points transactions
    if (transactionType.includes('Points')) continue

    // Determine amount: outgoing is negative, incoming is positive
    const outgoing = parseYenAmount(amountOutgoing)
    const incoming = parseYenAmount(amountIncoming)
    let amount: number
    if (outgoing !== null) {
      amount = -outgoing
    } else if (incoming !== null) {
      amount = incoming
    } else {
      continue // No amount — skip
    }

    // Description: use Method for Top-Up, Business Name otherwise
    const description = transactionType === 'Top-Up' ? method : businessName

    // Date: convert "2026/03/11 10:20:04" to "2026-03-11"
    const date = datetime.split(' ')[0].replace(/\//g, '-')

    transactions.push({
      externalId: transactionId,
      date,
      amount,
      description,
      rawData: {
        datetime,
        transactionType,
        businessName,
        method
      }
    })
  }

  return { transactions }
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

    for (const file of files) {
      context.onProgress(`Reading ${file}...`)
      const csv = readFileSync(path.join(dir, file), 'utf-8')
      const result = parsePayPayCSV(csv)
      allTransactions.push(...result.transactions)
    }

    context.onProgress(`Found ${allTransactions.length} transactions in ${files.length} files`)

    return { transactions: allTransactions }
  }
}
