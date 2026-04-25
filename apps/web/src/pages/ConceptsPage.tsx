import { useState } from 'react'
import ConceptInitButton from '../features/concepts/ConceptInitButton'
import ConceptForm from '../features/concepts/ConceptForm'
import ConceptList from '../features/concepts/ConceptList'
import Button from '../components/ui/Button'

export default function ConceptsPage() {
  const [showConceptForm, setShowConceptForm] = useState(false)

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text-h)]">Concepts</h2>
        <div className="flex items-center gap-2">
          <ConceptInitButton />
          {!showConceptForm && (
            <Button size="sm" onClick={() => setShowConceptForm(true)}>
              Add concept
            </Button>
          )}
        </div>
      </div>
      <div className="p-4 space-y-4">
        {showConceptForm && (
          <ConceptForm
            onSuccess={() => setShowConceptForm(false)}
            onCancel={() => setShowConceptForm(false)}
          />
        )}
        <ConceptList />
      </div>
    </section>
  )
}
