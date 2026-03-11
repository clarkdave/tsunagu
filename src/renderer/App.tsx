export function App(): JSX.Element {
  return (
    <div className="flex h-screen">
      <div className="w-64 bg-neutral-900 border-r border-neutral-800 p-4">
        <h1 className="text-lg font-semibold">Tsunagu</h1>
      </div>
      <div className="flex-1 p-6">
        <p className="text-neutral-400">Select a source or add a new one.</p>
      </div>
    </div>
  )
}
