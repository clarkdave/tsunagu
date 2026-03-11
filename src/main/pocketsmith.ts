import type { PocketsmithAccount } from '../shared/types'

const BASE_URL = 'https://api.pocketsmith.com/v2'

interface PushTransactionData {
  date: string
  amount: number
  payee: string
}

interface PocketsmithOptions {
  dryRun?: boolean
  onLog?: (message: string) => void
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
      title: a.title,
      currencyCode: a.currency_code
    }))
  }

  async pushTransaction(accountId: number, data: PushTransactionData): Promise<void> {
    const body = {
      payee: data.payee,
      amount: data.amount,
      date: data.date,
      is_transfer: false
    }

    if (this.options.dryRun) {
      const msg = `[DRY RUN] POST /transaction_accounts/${accountId}/transactions ${JSON.stringify(body)}`
      this.options.onLog?.(msg)
      return
    }

    await this.request('POST', `/transaction_accounts/${accountId}/transactions`, body)
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
