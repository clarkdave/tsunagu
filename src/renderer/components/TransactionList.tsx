import type { Transaction } from '../../shared/types'

interface Props {
  transactions: Transaction[]
}

export function TransactionList({ transactions }: Props): JSX.Element {
  if (transactions.length === 0) {
    return <p className="text-sm text-neutral-500 py-4">No transactions yet. Run a sync to fetch them.</p>
  }

  return (
    <div className="space-y-1">
      {transactions.map((tx) => (
        <div
          key={tx.id}
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800/50"
        >
          <span className={`text-xs ${tx.pocketsmithPushedAt ? 'text-green-500' : 'text-neutral-600'}`}>
            {tx.pocketsmithPushedAt ? '✓' : '○'}
          </span>
          <span className="text-sm text-neutral-500 w-24 shrink-0">{tx.date}</span>
          <span className="text-sm flex-1 truncate">{tx.description}</span>
          <span className={`text-sm font-mono ${tx.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>
            ¥{tx.amount.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}
