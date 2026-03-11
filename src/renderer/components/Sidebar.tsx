import { useState, useEffect } from 'react'
import type { Source } from '../../shared/types'
import type { View } from '../App'

interface Props {
  onNavigate: (view: View) => void
  selectedSourceId: number | null
}

export function Sidebar({ onNavigate, selectedSourceId }: Props): JSX.Element {
  const [sources, setSources] = useState<Source[]>([])

  useEffect(() => {
    window.api.getSources().then(setSources)
  }, [])

  // Expose refresh for other components to call after mutations
  useEffect(() => {
    (window as any).__refreshSources = () => window.api.getSources().then(setSources)
    return () => { delete (window as any).__refreshSources }
  }, [])

  return (
    <aside className="w-64 bg-neutral-900 border-r border-neutral-800 flex flex-col h-full">
      <div className="p-4 pt-10">
        <h1 className="text-lg font-semibold tracking-tight">Tsunagu</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {sources.map((source) => (
          <button
            key={source.id}
            onClick={() => onNavigate({ type: 'sourceDetail', sourceId: source.id })}
            className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
              selectedSourceId === source.id
                ? 'bg-neutral-800 border border-neutral-700'
                : 'hover:bg-neutral-800/50'
            }`}
          >
            <div className="text-sm font-medium">{source.name}</div>
            <div className="text-xs text-neutral-500">
              {source.lastSyncedAt
                ? `Synced ${new Date(source.lastSyncedAt).toLocaleDateString()}`
                : 'Never synced'}
              {source.lastBalance != null && (
                <span className="ml-2">¥{source.lastBalance.toLocaleString()}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="p-2 border-t border-neutral-800 space-y-1">
        <button
          onClick={() => onNavigate({ type: 'addSource' })}
          className="w-full text-left px-3 py-2 text-sm text-blue-400 hover:bg-neutral-800/50 rounded-lg"
        >
          + Add Source
        </button>
        <button
          onClick={() => onNavigate({ type: 'settings' })}
          className="w-full text-left px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800/50 rounded-lg"
        >
          Settings
        </button>
      </div>
    </aside>
  )
}
