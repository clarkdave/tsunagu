import { describe, it, expect } from 'vitest'
import { PayPayProvider, parsePayPayCSV } from '../../../src/main/providers/paypay'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('PayPay Provider', () => {
  describe('parsePayPayCSV', () => {
    it('parses a CSV string into transactions', () => {
      const csv = readFileSync(
        path.join(__dirname, '../../fixtures/paypay/sample-export.csv'),
        'utf-8'
      )

      const result = parsePayPayCSV(csv)
      expect(result.transactions).toHaveLength(3)

      expect(result.transactions[0]).toEqual({
        externalId: expect.any(String),
        date: '2026-01-15',
        amount: -350,
        description: 'セブンイレブン',
        rawData: { datetime: '2026-01-15 10:30:00', balanceAfter: 9650 }
      })

      expect(result.transactions[2]).toEqual({
        externalId: expect.any(String),
        date: '2026-01-10',
        amount: 10000,
        description: 'チャージ',
        rawData: { datetime: '2026-01-10 12:00:00', balanceAfter: 10210 }
      })
    })

    it('generates deterministic external IDs', () => {
      const csv = '取引日時,取引内容,取引金額,取引後残高\n2026-01-15 10:30:00,Store,-350,9650'
      const result1 = parsePayPayCSV(csv)
      const result2 = parsePayPayCSV(csv)
      expect(result1.transactions[0].externalId).toBe(result2.transactions[0].externalId)
    })

    it('extracts balance from latest transaction', () => {
      const csv = readFileSync(
        path.join(__dirname, '../../fixtures/paypay/sample-export.csv'),
        'utf-8'
      )
      const result = parsePayPayCSV(csv)
      expect(result.balance).toBe(9650)
    })

    it('handles empty CSV', () => {
      const csv = '取引日時,取引内容,取引金額,取引後残高\n'
      const result = parsePayPayCSV(csv)
      expect(result.transactions).toEqual([])
      expect(result.balance).toBeUndefined()
    })
  })

  describe('sync', () => {
    it('reads all CSV files from the import directory', async () => {
      const provider = new PayPayProvider()
      const fixtureDir = path.join(__dirname, '../../fixtures/paypay')

      const result = await provider.sync(
        { type: 'paypay', importPath: fixtureDir },
        {
          promptPassword: async () => '',
          onProgress: () => {}
        }
      )

      expect(result.transactions.length).toBeGreaterThan(0)
      expect(result.balance).toBe(9650)
    })
  })
})
