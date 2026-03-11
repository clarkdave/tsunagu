import { useState, useEffect } from 'react'

export function Settings(): JSX.Element {
  const [apiKey, setApiKey] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [dataDir, setDataDir] = useState('')
  const [dryRun, setDryRun] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const key = await window.api.getSetting('pocketsmithApiKey')
      setHasApiKey(!!key)

      const dir = await window.api.getDataDir()
      setDataDir(dir)

      const dry = await window.api.getSetting('dryRun')
      setDryRun(dry === 'true')
    }
    load()
  }, [])

  async function saveApiKey() {
    if (!apiKey.trim()) return
    await window.api.setSetting('pocketsmithApiKey', apiKey.trim())
    setHasApiKey(true)
    setApiKey('')
    flash()
  }

  async function saveDataDir() {
    await window.api.setDataDir(dataDir)
    flash()
  }

  async function toggleDryRun() {
    const next = !dryRun
    setDryRun(next)
    await window.api.setSetting('dryRun', String(next))
    flash()
  }

  function flash() {
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-semibold mb-6">Settings</h2>

      {saved && (
        <div className="mb-4 text-sm text-green-400">Saved.</div>
      )}

      {/* Pocketsmith API Key */}
      <section className="mb-6">
        <label className="block text-sm text-neutral-400 mb-1">Pocketsmith API Key</label>
        {hasApiKey ? (
          <div className="flex items-center gap-2">
            <span className="text-neutral-500">••••••••••••</span>
            <button
              onClick={() => setHasApiKey(false)}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key"
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm"
            />
            <button
              onClick={saveApiKey}
              className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-sm"
            >
              Save
            </button>
          </div>
        )}
      </section>

      {/* Data Directory */}
      <section className="mb-6">
        <label className="block text-sm text-neutral-400 mb-1">Data Directory</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={dataDir}
            onChange={(e) => setDataDir(e.target.value)}
            placeholder="~/Library/Mobile Documents/com~apple~CloudDocs/Tsunagu/"
            className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm"
          />
          <button
            onClick={saveDataDir}
            className="bg-neutral-700 hover:bg-neutral-600 px-3 py-1.5 rounded text-sm"
          >
            Save
          </button>
        </div>
      </section>

      {/* Dry Run */}
      <section className="mb-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={toggleDryRun}
            className="rounded"
          />
          <span className="text-sm">Dry run mode</span>
        </label>
        <p className="text-xs text-neutral-500 mt-1">
          When enabled, Pocketsmith API calls are logged but not executed.
        </p>
      </section>
    </div>
  )
}
