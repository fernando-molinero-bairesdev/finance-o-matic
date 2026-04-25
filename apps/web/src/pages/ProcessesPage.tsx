import { useState } from 'react'
import ProcessForm from '../features/processes/ProcessForm'
import ProcessList from '../features/processes/ProcessList'
import Button from '../components/ui/Button'

export default function ProcessesPage() {
  const [showProcessForm, setShowProcessForm] = useState(false)

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text-h)]">Processes</h2>
        {!showProcessForm && (
          <Button size="sm" onClick={() => setShowProcessForm(true)}>
            Add process
          </Button>
        )}
      </div>
      <div className="p-4 space-y-4">
        {showProcessForm && (
          <ProcessForm
            onSuccess={() => setShowProcessForm(false)}
            onCancel={() => setShowProcessForm(false)}
          />
        )}
        <ProcessList />
      </div>
    </section>
  )
}
