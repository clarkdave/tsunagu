import { useState, useEffect } from 'react'
import type { Source, PocketsmithAccount } from '../../shared/types'

interface Props {
  sourceId: number
  onBack: () => void
}

export function SourceSettings({ sourceId, onBack }: Props) {
  const [source, setSource] = useState<Source | null>(null)
  const [pocketsmithAccountId, setPocketsmithAccountId] = useState<number | null>(null)
  const [psAccounts, setPsAccounts] = useState<PocketsmithAccount[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    Promise.all([
      window.api.getSource(sourceId),
      window.api.fetchPocketsmithAccounts().catch(() => [] as PocketsmithAccount[])
    ]).then(([s, accounts]) => {
      setSource(s)
      setPocketsmithAccountId(s?.pocketsmithAccountId ?? null)
      setPsAccounts(accounts)
      setLoadingAccounts(false)
    })
  }, [sourceId])

  async function handleSave() {
    if (!source) return
    setSaving(true)
    setSaved(false)
    await window.api.updateSource(sourceId, { pocketsmithAccountId })
    ;(window as any).__refreshSources?.()
    setSaving(false)
    setSaved(true)
  }

  const hasChanges = source && pocketsmithAccountId !== source.pocketsmithAccountId

  if (!source) return <p className="text-neutral-500">Loading...</p>

  return (
    <div className="max-w-md">
      <button onClick={onBack} className="text-sm text-neutral-400 hover:text-neutral-300 mb-4">
        &larr; Back to {source.name}
      </button>

      <h2 className="text-xl font-semibold mb-6">{source.name} Settings</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-neutral-400 mb-1">Source Type</label>
          <p className="text-sm">{source.type}</p>
        </div>

        <div>
          <label className="block text-sm text-neutral-400 mb-1">Pocketsmith Transaction Account</label>
          {loadingAccounts ? (
            <p className="text-sm text-neutral-500">Loading accounts...</p>
          ) : psAccounts.length > 0 ? (
            <select
              value={pocketsmithAccountId ?? ''}
              onChange={(e) => setPocketsmithAccountId(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm"
            >
              <option value="">None</option>
              {psAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} - {a.currencyCode.toUpperCase()}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-neutral-500">
              Configure your Pocketsmith API key in Settings first.
            </p>
          )}
        </div>

        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-1.5 rounded text-sm"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saved && <span className="ml-3 text-sm text-green-400">Saved</span>}
        </div>
      </div>
    </div>
  )
}
