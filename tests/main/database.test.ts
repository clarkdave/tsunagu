import { describe, it, expect, beforeEach } from 'vitest'
import { Database } from '../../src/main/database'

describe('Database', () => {
  let db: Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  describe('initialization', () => {
    it('creates tables on init', () => {
      const sources = db.getAllSources()
      expect(sources).toEqual([])
      const txns = db.getTransactions(1)
      expect(txns).toEqual([])
    })
  })

  describe('settings', () => {
    it('returns null for unknown key', () => {
      expect(db.getSetting('unknown')).toBeNull()
    })

    it('sets and gets a value', () => {
      db.setSetting('apiKey', 'test-key-123')
      expect(db.getSetting('apiKey')).toBe('test-key-123')
    })

    it('overwrites existing value', () => {
      db.setSetting('apiKey', 'old')
      db.setSetting('apiKey', 'new')
      expect(db.getSetting('apiKey')).toBe('new')
    })
  })

  describe('sources', () => {
    it('creates and retrieves a source', () => {
      const source = db.createSource({
        type: 'amex-japan',
        name: 'My Amex',
        config: { type: 'amex-japan', username: 'user1' }
      })

      expect(source.id).toBeGreaterThan(0)
      expect(source.type).toBe('amex-japan')
      expect(source.name).toBe('My Amex')
      expect(source.config).toEqual({ type: 'amex-japan', username: 'user1' })
      expect(source.pocketsmithAccountId).toBeNull()
      expect(source.lastSyncedAt).toBeNull()
      expect(source.lastBalance).toBeNull()

      const fetched = db.getSource(source.id)
      expect(fetched).toEqual(source)
    })

    it('lists all sources', () => {
      db.createSource({ type: 'amex-japan', name: 'Amex', config: { type: 'amex-japan', username: 'u' } })
      db.createSource({ type: 'paypay', name: 'PayPay', config: { type: 'paypay', importPath: '/tmp' } })
      expect(db.getAllSources()).toHaveLength(2)
    })

    it('updates a source', () => {
      const source = db.createSource({
        type: 'amex-japan',
        name: 'Old Name',
        config: { type: 'amex-japan', username: 'u' }
      })

      const updated = db.updateSource(source.id, {
        name: 'New Name',
        pocketsmithAccountId: 42
      })

      expect(updated.name).toBe('New Name')
      expect(updated.pocketsmithAccountId).toBe(42)
      expect(updated.type).toBe('amex-japan')
    })

    it('deletes a source and its transactions', () => {
      const source = db.createSource({
        type: 'amex-japan',
        name: 'Amex',
        config: { type: 'amex-japan', username: 'u' }
      })
      db.insertTransactions(source.id, [{
        externalId: 'tx1', date: '2026-01-01', amount: -1000, description: 'Test'
      }])

      db.deleteSource(source.id)
      expect(db.getSource(source.id)).toBeNull()
      expect(db.getTransactions(source.id)).toEqual([])
    })

    it('updates sync metadata', () => {
      const source = db.createSource({
        type: 'amex-japan',
        name: 'Amex',
        config: { type: 'amex-japan', username: 'u' }
      })

      db.updateSourceSyncMeta(source.id, { lastBalance: 50000 })
      const updated = db.getSource(source.id)!
      expect(updated.lastSyncedAt).not.toBeNull()
      expect(updated.lastBalance).toBe(50000)
    })
  })

  describe('transactions', () => {
    let sourceId: number

    beforeEach(() => {
      const source = db.createSource({
        type: 'amex-japan',
        name: 'Amex',
        config: { type: 'amex-japan', username: 'u' }
      })
      sourceId = source.id
    })

    it('inserts transactions and returns count of new', () => {
      const count = db.insertTransactions(sourceId, [
        { externalId: 'tx1', date: '2026-01-01', amount: -1000, description: 'Store A' },
        { externalId: 'tx2', date: '2026-01-02', amount: -2000, description: 'Store B' }
      ])

      expect(count).toBe(2)
      expect(db.getTransactions(sourceId)).toHaveLength(2)
    })

    it('deduplicates by external_id', () => {
      db.insertTransactions(sourceId, [
        { externalId: 'tx1', date: '2026-01-01', amount: -1000, description: 'Store A' }
      ])
      const count = db.insertTransactions(sourceId, [
        { externalId: 'tx1', date: '2026-01-01', amount: -1000, description: 'Store A' },
        { externalId: 'tx2', date: '2026-01-02', amount: -2000, description: 'Store B' }
      ])

      expect(count).toBe(1)
      expect(db.getTransactions(sourceId)).toHaveLength(2)
    })

    it('returns transactions ordered by date desc', () => {
      db.insertTransactions(sourceId, [
        { externalId: 'tx1', date: '2026-01-01', amount: -1000, description: 'Old' },
        { externalId: 'tx2', date: '2026-01-15', amount: -2000, description: 'New' }
      ])

      const txns = db.getTransactions(sourceId)
      expect(txns[0].date).toBe('2026-01-15')
      expect(txns[1].date).toBe('2026-01-01')
    })

    it('gets unpushed transactions', () => {
      db.insertTransactions(sourceId, [
        { externalId: 'tx1', date: '2026-01-01', amount: -1000, description: 'A' },
        { externalId: 'tx2', date: '2026-01-02', amount: -2000, description: 'B' }
      ])

      // getTransactions returns date DESC: [tx2, tx1]
      const all = db.getTransactions(sourceId)
      db.markTransactionPushed(all[0].id) // mark tx2 as pushed

      const unpushed = db.getUnpushedTransactions(sourceId)
      expect(unpushed).toHaveLength(1)
      expect(unpushed[0].externalId).toBe('tx1')
    })

    it('marks a transaction as pushed', () => {
      db.insertTransactions(sourceId, [
        { externalId: 'tx1', date: '2026-01-01', amount: -1000, description: 'A' }
      ])

      const txns = db.getTransactions(sourceId)
      expect(txns[0].pocketsmithPushedAt).toBeNull()

      db.markTransactionPushed(txns[0].id)

      const updated = db.getTransactions(sourceId)
      expect(updated[0].pocketsmithPushedAt).not.toBeNull()
    })
  })
})
