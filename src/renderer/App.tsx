import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Settings } from './components/Settings'

export type View =
  | { type: 'empty' }
  | { type: 'settings' }
  | { type: 'addSource' }
  | { type: 'sourceDetail'; sourceId: number }

export function App(): JSX.Element {
  const [view, setView] = useState<View>({ type: 'empty' })

  return (
    <div className="flex h-screen">
      <Sidebar
        onNavigate={setView}
        selectedSourceId={view.type === 'sourceDetail' ? view.sourceId : null}
      />
      <main className="flex-1 p-6 overflow-y-auto">
        {view.type === 'settings' && <Settings />}
        {view.type === 'empty' && (
          <p className="text-neutral-400">Select a source or add a new one.</p>
        )}
      </main>
    </div>
  )
}
