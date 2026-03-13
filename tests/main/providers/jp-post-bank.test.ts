import { describe, it, expect } from 'vitest'
import {
  parseJPPostTransactions,
  reiwaToISO,
  type JPPostRawTransaction
} from '../../../src/main/providers/jp-post-bank'

const sampleTransactions: JPPostRawTransaction[] = [
  {
    date: '8-03-09',
    incoming: '',
    outgoing: '20,000円',
    description: 'ＲＴ　（ＰＡＹＰＡＹ）\u00a0',
    balance: '1,781,822円'
  },
  {
    date: '8-03-09',
    incoming: '',
    outgoing: '165円',
    description: '料　金\u00a0',
    balance: '1,801,822円'
  },
  {
    date: '8-02-27',
    incoming: '1,634,506円',
    outgoing: '',
    description: '振込\u00a0',
    balance: '1,912,817円'
  }
]

describe('JP Post Bank Provider', () => {
  describe('reiwaToISO', () => {
    it('converts Reiwa 8 to 2026', () => {
      expect(reiwaToISO('8-03-09')).toBe('2026-03-09')
    })

    it('converts Reiwa 1 to 2019', () => {
      expect(reiwaToISO('1-05-01')).toBe('2019-05-01')
    })

    it('converts Reiwa 7 to 2025', () => {
      expect(reiwaToISO('7-12-31')).toBe('2025-12-31')
    })
  })

  describe('parseJPPostTransactions', () => {
    it('parses outgoing transactions as negative', () => {
      const result = parseJPPostTransactions(sampleTransactions)
      expect(result[0].amount).toBe(-20000)
      expect(result[1].amount).toBe(-165)
    })

    it('parses incoming transactions as positive', () => {
      const result = parseJPPostTransactions(sampleTransactions)
      expect(result[2].amount).toBe(1634506)
    })

    it('converts Reiwa dates to ISO format', () => {
      const result = parseJPPostTransactions(sampleTransactions)
      expect(result[0].date).toBe('2026-03-09')
      expect(result[2].date).toBe('2026-02-27')
    })

    it('trims descriptions and removes nbsp', () => {
      const result = parseJPPostTransactions(sampleTransactions)
      expect(result[0].description).toBe('ＲＴ　（ＰＡＹＰＡＹ）')
      expect(result[1].description).toBe('料　金')
    })

    it('generates deterministic external IDs', () => {
      const result1 = parseJPPostTransactions(sampleTransactions)
      const result2 = parseJPPostTransactions(sampleTransactions)
      expect(result1[0].externalId).toBe(result2[0].externalId)
    })

    it('generates unique IDs for same-date transactions using balance', () => {
      const result = parseJPPostTransactions(sampleTransactions)
      // Two transactions on 8-03-09 with different balances should have different IDs
      expect(result[0].externalId).not.toBe(result[1].externalId)
    })

    it('includes balance in rawData', () => {
      const result = parseJPPostTransactions(sampleTransactions)
      expect(result[0].rawData).toEqual({
        reiwaDate: '8-03-09',
        balance: 1781822
      })
    })

    it('handles empty input', () => {
      expect(parseJPPostTransactions([])).toEqual([])
    })
  })
})
