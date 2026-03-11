import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PocketsmithClient } from '../../src/main/pocketsmith'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('PocketsmithClient', () => {
  let client: PocketsmithClient

  beforeEach(() => {
    mockFetch.mockReset()
    client = new PocketsmithClient('test-api-key')
  })

  describe('getCurrentUser', () => {
    it('fetches current user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 123, name: 'Test User' })
      })

      const user = await client.getCurrentUser()
      expect(user.id).toBe(123)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.pocketsmith.com/v2/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Developer-Key': 'test-api-key'
          })
        })
      )
    })

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized')
      })

      await expect(client.getCurrentUser()).rejects.toThrow('Pocketsmith API error 401')
    })
  })

  describe('getTransactionAccounts', () => {
    it('fetches transaction accounts for a user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { id: 1, title: 'Checking', currency_code: 'JPY' },
          { id: 2, title: 'Credit Card', currency_code: 'JPY' }
        ])
      })

      const accounts = await client.getTransactionAccounts(123)
      expect(accounts).toEqual([
        { id: 1, title: 'Checking', currencyCode: 'JPY' },
        { id: 2, title: 'Credit Card', currencyCode: 'JPY' }
      ])
    })
  })

  describe('pushTransaction', () => {
    it('posts a transaction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 999 })
      })

      await client.pushTransaction(42, {
        date: '2026-01-15',
        amount: -1500,
        payee: 'Convenience Store'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.pocketsmith.com/v2/transaction_accounts/42/transactions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            payee: 'Convenience Store',
            amount: -1500,
            date: '2026-01-15',
            is_transfer: false
          })
        })
      )
    })
  })

  describe('dry run mode', () => {
    it('logs instead of calling API', async () => {
      const logs: string[] = []
      const dryClient = new PocketsmithClient('key', { dryRun: true, onLog: (msg) => logs.push(msg) })

      await dryClient.pushTransaction(42, {
        date: '2026-01-15',
        amount: -1500,
        payee: 'Test'
      })

      expect(mockFetch).not.toHaveBeenCalled()
      expect(logs).toHaveLength(1)
      expect(logs[0]).toContain('POST')
      expect(logs[0]).toContain('42')
    })
  })
})
