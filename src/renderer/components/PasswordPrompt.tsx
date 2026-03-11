import { useState } from 'react'

interface Props {
  label: string
  onSubmit: (password: string) => void
  onCancel: () => void
}

export function PasswordPrompt({ label, onSubmit, onCancel }: Props): JSX.Element {
  const [password, setPassword] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(password)
    setPassword('')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 w-80"
      >
        <h3 className="text-sm font-semibold mb-3">Password Required</h3>
        <p className="text-sm text-neutral-400 mb-4">{label}</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="w-full bg-neutral-900 border border-neutral-600 rounded px-3 py-2 text-sm mb-4"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-neutral-700 hover:bg-neutral-600 rounded py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 bg-blue-600 hover:bg-blue-500 rounded py-2 text-sm"
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  )
}
