import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Database } from '../../src/main/database'
import { runSync } from '../../src/main/sync'

// Mock the provider
vi.mock('../../src/main/providers/registry', () => ({
  getProvider: () => ({
    type: 'paypay',
    sync: vi.fn().mockResolvedValue({
      transactions: [
        { externalId: 'tx1', date: '2026-01-01', amount: -500, description: 'Store' },
        { externalId: 'tx2', date: '2026-01-02', amount: -300, description: 'Cafe' }
      ],
      balance: 9200
    })
  })
}))

describe('runSync', () => {
  let db: Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  it('saves fetched transactions to database', async () => {
    const source = db.createSource({
      type: 'paypay',
      name: 'PayPay',
      config: { type: 'paypay', importPath: '/tmp' }
    })

    const result = await runSync(db, source, {
      promptPassword: async () => '',
      onProgress: () => {},
      dryRun: false
    })

    expect(result.newTransactions).toBe(2)
    expect(db.getTransactions(source.id)).toHaveLength(2)

    const updated = db.getSource(source.id)!
    expect(updated.lastSyncedAt).not.toBeNull()
    expect(updated.lastBalance).toBe(9200)
  })

  it('skips Pocketsmith push when no account mapped', async () => {
    const source = db.createSource({
      type: 'paypay',
      name: 'PayPay',
      config: { type: 'paypay', importPath: '/tmp' }
    })

    const result = await runSync(db, source, {
      promptPassword: async () => '',
      onProgress: () => {},
      dryRun: false
    })

    expect(result.newTransactions).toBe(2)
    expect(result.pushedTransactions).toBe(0)
  })

  it('does not push in dry run mode', async () => {
    const source = db.createSource({
      type: 'paypay',
      name: 'PayPay',
      config: { type: 'paypay', importPath: '/tmp' },
      pocketsmithAccountId: 42
    })

    const result = await runSync(db, source, {
      promptPassword: async () => '',
      onProgress: () => {},
      dryRun: true,
      apiKey: 'test-key'
    })

    expect(result.newTransactions).toBe(2)
    expect(db.getUnpushedTransactions(source.id)).toHaveLength(2)
  })

  it('deduplicates on re-sync', async () => {
    const source = db.createSource({
      type: 'paypay',
      name: 'PayPay',
      config: { type: 'paypay', importPath: '/tmp' }
    })

    await runSync(db, source, { promptPassword: async () => '', onProgress: () => {}, dryRun: false })
    const result = await runSync(db, source, { promptPassword: async () => '', onProgress: () => {}, dryRun: false })

    expect(result.newTransactions).toBe(0)
    expect(db.getTransactions(source.id)).toHaveLength(2)
  })
})
