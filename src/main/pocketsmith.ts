import type { PocketsmithAccount } from '../shared/types'

const BASE_URL = 'https://api.pocketsmith.com/v2'

interface PushTransactionData {
  date: string
  amount: number
  payee: string
}

interface PocketsmithOptions {
  dryRun?: boolean
}

export class PocketsmithClient {
  constructor(
    private apiKey: string,
    private options: PocketsmithOptions = {}
  ) {}

  async getCurrentUser(): Promise<{ id: number; name: string }> {
    return this.request('GET', '/me')
  }

  async getTransactionAccounts(userId: number): Promise<PocketsmithAccount[]> {
    const raw: any[] = await this.request('GET', `/users/${userId}/transaction_accounts`)
    return raw.map((a) => ({
      id: a.id,
      name: a.name,
      currencyCode: a.currency_code
    }))
  }

  async pushTransaction(accountId: number, data: PushTransactionData): Promise<number | null> {
    const body = {
      payee: data.payee,
      amount: data.amount,
      date: data.date,
      is_transfer: false,
      needs_review: true
    }

    if (this.options.dryRun) {
      console.log(`[DRY RUN] POST /transaction_accounts/${accountId}/transactions`, body)
      return null
    }

    const result = await this.request('POST', `/transaction_accounts/${accountId}/transactions`, body)
    return result.id
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'X-Developer-Key': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Pocketsmith API error ${response.status}: ${text}`)
    }

    return response.json()
  }
}
