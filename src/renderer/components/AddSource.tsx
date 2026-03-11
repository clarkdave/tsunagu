import { useState, useEffect } from 'react'
import type { SourceType, SourceConfig, PocketsmithAccount } from '../../shared/types'

interface Props {
  onCreated: (sourceId: number) => void
}

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: 'amex-japan', label: 'American Express Japan' },
  { value: 'jp-post-bank', label: 'JP Post Bank' },
  { value: 'sbi-shinsei', label: 'SBI Shinsei Bank' },
  { value: 'paypay', label: 'PayPay' },
]

export function AddSource({ onCreated }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedType, setSelectedType] = useState<SourceType | null>(null)
  const [name, setName] = useState('')
  const [credential, setCredential] = useState('')
  const [pocketsmithAccountId, setPocketsmithAccountId] = useState<number | undefined>()
  const [psAccounts, setPsAccounts] = useState<PocketsmithAccount[]>([])

  useEffect(() => {
    window.api.fetchPocketsmithAccounts().then(setPsAccounts).catch(() => {})
  }, [])

  function selectType(type: SourceType) {
    setSelectedType(type)
    setName(SOURCE_TYPES.find((t) => t.value === type)!.label)
    setStep(2)
  }

  function credentialLabel(): string {
    switch (selectedType) {
      case 'amex-japan': return 'Username'
      case 'jp-post-bank': return 'Customer Number'
      case 'sbi-shinsei': return 'Username'
      case 'paypay': return 'Import Directory Path'
      default: return 'Credential'
    }
  }

  function buildConfig(): SourceConfig {
    switch (selectedType!) {
      case 'amex-japan': return { type: 'amex-japan', username: credential }
      case 'jp-post-bank': return { type: 'jp-post-bank', customerNumber: credential }
      case 'sbi-shinsei': return { type: 'sbi-shinsei', username: credential }
      case 'paypay': return { type: 'paypay', importPath: credential }
    }
  }

  async function save() {
    if (!selectedType || !name.trim() || !credential.trim()) return
    const source = await window.api.createSource({
      type: selectedType,
      name: name.trim(),
      config: buildConfig(),
      pocketsmithAccountId
    })
    ;(window as any).__refreshSources?.()
    onCreated(source.id)
  }

  if (step === 1) {
    return (
      <div className="max-w-md">
        <h2 className="text-xl font-semibold mb-4">Add Source</h2>
        <div className="space-y-2">
          {SOURCE_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => selectType(t.value)}
              className="w-full text-left px-4 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md">
      <h2 className="text-xl font-semibold mb-4">
        Add {SOURCE_TYPES.find((t) => t.value === selectedType)!.label}
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-neutral-400 mb-1">Display Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm text-neutral-400 mb-1">{credentialLabel()}</label>
          <input
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm"
          />
        </div>

        {psAccounts.length > 0 && (
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Pocketsmith Account</label>
            <select
              value={pocketsmithAccountId ?? ''}
              onChange={(e) => setPocketsmithAccountId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm"
            >
              <option value="">None (map later)</option>
              {psAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.title} ({a.currencyCode})</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={() => setStep(1)} className="text-sm text-neutral-400 hover:text-neutral-300">
            Back
          </button>
          <button
            onClick={save}
            className="bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded text-sm"
          >
            Create Source
          </button>
        </div>
      </div>
    </div>
  )
}
