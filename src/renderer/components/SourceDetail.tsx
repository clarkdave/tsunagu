import { useState, useEffect } from 'react'
import type { Source, Transaction, SyncProgress, SyncResult } from '../../shared/types'
import { TransactionList } from './TransactionList'

interface Props {
  sourceId: number
}

export function SourceDetail({ sourceId }: Props) {
  const [source, setSource] = useState<Source | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)

  useEffect(() => {
    setLastResult(null)
    setProgress(null)
    loadData()

    const cleanup = window.api.onSyncProgress((id, prog) => {
      if (id === sourceId) setProgress(prog)
    })

    return cleanup
  }, [sourceId])

  async function loadData() {
    const [s, txns] = await Promise.all([
      window.api.getSource(sourceId),
      window.api.getTransactions(sourceId)
    ])
    setSource(s)
    setTransactions(txns)
  }

  async function handleSync() {
    setSyncing(true)
    setProgress(null)
    setLastResult(null)

    try {
      const result = await window.api.syncSource(sourceId)
      setLastResult(result)
      await loadData()
      ;(window as any).__refreshSources?.()
    } finally {
      setSyncing(false)
      setProgress(null)
    }
  }

  if (!source) return <p className="text-neutral-500">Loading...</p>

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{source.name}</h2>
          <p className="text-sm text-neutral-500">
            {source.lastSyncedAt
              ? `Last synced ${new Date(source.lastSyncedAt).toLocaleString()}`
              : 'Never synced'}
            {source.lastBalance != null && ` · Balance: ¥${source.lastBalance.toLocaleString()}`}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-1.5 rounded text-sm"
        >
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {progress && (
        <div className="mb-4 px-3 py-2 bg-neutral-800 rounded text-sm text-neutral-300">
          {progress.message}
        </div>
      )}

      {lastResult && (
        <div className={`mb-4 px-3 py-2 rounded text-sm ${
          lastResult.error ? 'bg-red-900/30 text-red-300' : 'bg-green-900/30 text-green-300'
        }`}>
          {lastResult.error
            ? `Error: ${lastResult.error}`
            : `${lastResult.newTransactions} new transactions, ${lastResult.pushedTransactions} pushed to Pocketsmith`}
        </div>
      )}

      <TransactionList transactions={transactions} />
    </div>
  )
}
