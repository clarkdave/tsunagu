import { describe, it, expect } from 'vitest'
import {
  parseAmexTransactions,
  parseAmexBalance,
  type AmexRawTransaction
} from '../../../src/main/providers/amex-japan'

const sampleTransactions: AmexRawTransaction[] = [
  {
    id: 'P0083756320260309020451',
    status: 'pending',
    date: '2026-03-09',
    description: 'IKEA',
    referenceId: 'P0083756320260309020451',
    amount: '￥557'
  },
  {
    id: 'AT260690001000010058332---0005---20260309',
    status: 'posted',
    date: '2026-03-09',
    description: 'Starbucks　　　　　',
    referenceId: 'AT260690001000010058332',
    amount: '￥491'
  },
  {
    id: 'AT260680001000010065186---0005---20260308',
    status: 'posted',
    date: '2026-03-08',
    description: 'MOBILE',
    referenceId: 'AT260680001000010065186',
    amount: '￥31,419'
  }
]

describe('Amex Japan Provider', () => {
  describe('parseAmexTransactions', () => {
    it('filters out pending transactions', () => {
      const result = parseAmexTransactions(sampleTransactions)
      expect(result).toHaveLength(2)
      expect(result.every((t) => t.rawData?.status === 'posted')).toBe(true)
    })

    it('parses a simple posted transaction', () => {
      const result = parseAmexTransactions(sampleTransactions)
      expect(result[0]).toEqual({
        externalId: 'AT260690001000010058332',
        date: '2026-03-09',
        amount: -491,
        description: 'Starbucks',
        rawData: {
          amexId: 'AT260690001000010058332---0005---20260309',
          status: 'posted',
          referenceId: 'AT260690001000010058332'
        }
      })
    })

    it('parses amounts with commas as negative numbers', () => {
      const result = parseAmexTransactions(sampleTransactions)
      expect(result[1].amount).toBe(-31419)
    })

    it('uses reference_id as externalId', () => {
      const result = parseAmexTransactions(sampleTransactions)
      expect(result[0].externalId).toBe('AT260690001000010058332')
      expect(result[1].externalId).toBe('AT260680001000010065186')
    })

    it('handles empty input', () => {
      expect(parseAmexTransactions([])).toEqual([])
    })

    it('handles all-pending input', () => {
      const pending: AmexRawTransaction[] = [
        {
          id: 'P001',
          status: 'pending',
          date: '2026-03-09',
          description: 'STORE',
          referenceId: 'P001',
          amount: '￥100'
        }
      ]
      expect(parseAmexTransactions(pending)).toEqual([])
    })
  })

  describe('parseAmexBalance', () => {
    it('parses a yen balance', () => {
      expect(parseAmexBalance('￥236,285')).toBe(236285)
    })

    it('parses a simple amount', () => {
      expect(parseAmexBalance('￥491')).toBe(491)
    })

    it('returns undefined for non-numeric text', () => {
      expect(parseAmexBalance('N/A')).toBeUndefined()
    })

    it('handles empty string', () => {
      expect(parseAmexBalance('')).toBeUndefined()
    })
  })
})
