import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { Settings } from './components/Settings'
import { AddSource } from './components/AddSource'
import { SourceDetail } from './components/SourceDetail'
import { PasswordPrompt } from './components/PasswordPrompt'

export type View =
  | { type: 'empty' }
  | { type: 'settings' }
  | { type: 'addSource' }
  | { type: 'sourceDetail'; sourceId: number }

export function App() {
  const [view, setView] = useState<View>({ type: 'empty' })
  const [passwordPrompt, setPasswordPrompt] = useState<{
    label: string
    resolve: (password: string) => void
  } | null>(null)

  useEffect(() => {
    const cleanup = window.api.onPasswordPrompt(async (label) => {
      return new Promise<string>((resolve) => {
        setPasswordPrompt({ label, resolve })
      })
    })
    return cleanup
  }, [])

  function handlePasswordSubmit(password: string) {
    passwordPrompt?.resolve(password)
    setPasswordPrompt(null)
  }

  function handlePasswordCancel() {
    passwordPrompt?.resolve('')
    setPasswordPrompt(null)
  }

  return (
    <div className="flex h-screen">
      <div className="fixed top-0 left-0 right-0 h-10 z-40" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
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
      {passwordPrompt && (
        <PasswordPrompt
          label={passwordPrompt.label}
          onSubmit={handlePasswordSubmit}
          onCancel={handlePasswordCancel}
        />
      )}
    </div>
  )
}
