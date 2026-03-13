import { describe, it, expect } from 'vitest'
import { PayPayProvider, parsePayPayCSV } from '../../../src/main/providers/paypay'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('PayPay Provider', () => {
  describe('parsePayPayCSV', () => {
    const csv = readFileSync(
      path.join(__dirname, '../../fixtures/paypay/sample-export.csv'),
      'utf-8'
    )

    it('parses transactions from real CSV format', () => {
      const result = parsePayPayCSV(csv)
      // 10 rows minus 1 Points row = 9 transactions
      expect(result.transactions).toHaveLength(9)
    })

    it('parses a simple payment', () => {
      const result = parsePayPayCSV(csv)
      expect(result.transactions[0]).toEqual({
        externalId: '04931021063461429249',
        date: '2026-03-11',
        amount: -501,
        description: 'スターバックス コーヒー - 三宮磯上通店',
        rawData: {
          datetime: '2026/03/11 10:20:04',
          transactionType: 'Payment',
          businessName: 'スターバックス コーヒー - 三宮磯上通店',
          method: 'PayPay Balance'
        }
      })
    })

    it('parses a refund as positive amount', () => {
      const result = parsePayPayCSV(csv)
      const refund = result.transactions.find((t) => t.amount > 0 && t.description === 'Amazon.co.jp')
      expect(refund).toEqual({
        externalId: '04930426614217629700',
        date: '2026-03-10',
        amount: 491,
        description: 'Amazon.co.jp',
        rawData: expect.objectContaining({ transactionType: 'Refund' })
      })
    })

    it('parses amounts with commas', () => {
      const result = parsePayPayCSV(csv)
      const amazon = result.transactions.find(
        (t) => t.externalId === '04929910908904939522'
      )
      expect(amazon!.amount).toBe(-5990)
    })

    it('uses Method as description for Top-Up', () => {
      const result = parsePayPayCSV(csv)
      const topUp = result.transactions.find(
        (t) => t.rawData?.transactionType === 'Top-Up'
      )
      expect(topUp).toEqual({
        externalId: '02218762466344108048',
        date: '2026-03-09',
        amount: 20000,
        description: 'ゆうちょ銀行 *****61',
        rawData: expect.objectContaining({ transactionType: 'Top-Up' })
      })
    })

    it('filters out Points transactions', () => {
      const result = parsePayPayCSV(csv)
      const points = result.transactions.filter(
        (t) => (t.rawData as Record<string, unknown>)?.transactionType?.toString().includes('Points')
      )
      expect(points).toHaveLength(0)
    })

    it('parses Bill Payment transactions', () => {
      const result = parsePayPayCSV(csv)
      const bill = result.transactions.find(
        (t) => t.rawData?.transactionType === 'Bill Payment'
      )
      expect(bill).toEqual({
        externalId: '04859020025539297281',
        date: '2025-12-04',
        amount: -5718,
        description: '大阪ガス',
        rawData: expect.objectContaining({ transactionType: 'Bill Payment' })
      })
    })

    it('parses Money Received transactions', () => {
      const result = parsePayPayCSV(csv)
      const received = result.transactions.find(
        (t) => t.rawData?.transactionType === 'Money Received'
      )
      expect(received!.amount).toBe(7000)
      expect(received!.description).toBe('サビナ')
    })

    it('handles empty CSV', () => {
      const header = 'Date & Time,Amount Outgoing (Yen),Amount Incoming (Yen),Amount Outgoing Overseas,Currency,Exchange Rate (Yen),Country Paid In,Transaction Type,Business Name,Method,Payment Option,User,Transaction ID\n'
      const result = parsePayPayCSV(header)
      expect(result.transactions).toEqual([])
    })

    it('uses transaction ID for stable external IDs', () => {
      const result1 = parsePayPayCSV(csv)
      const result2 = parsePayPayCSV(csv)
      expect(result1.transactions[0].externalId).toBe(result2.transactions[0].externalId)
      expect(result1.transactions[0].externalId).toBe('04931021063461429249')
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

      expect(result.transactions.length).toBe(9)
    })
  })
})
