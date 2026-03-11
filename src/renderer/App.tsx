import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Settings } from './components/Settings'
import { AddSource } from './components/AddSource'
import { SourceDetail } from './components/SourceDetail'

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
        {view.type === 'addSource' && (
          <AddSource onCreated={(id) => setView({ type: 'sourceDetail', sourceId: id })} />
        )}
        {view.type === 'sourceDetail' && <SourceDetail sourceId={view.sourceId} />}
        {view.type === 'empty' && (
          <p className="text-neutral-400">Select a source or add a new one.</p>
        )}
      </main>
    </div>
  )
}
