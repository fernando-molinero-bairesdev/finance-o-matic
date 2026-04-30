import { useState } from 'react'
import ConceptInitButton from '../features/concepts/ConceptInitButton'
import ConceptForm from '../features/concepts/ConceptForm'
import ConceptList from '../features/concepts/ConceptList'
import ConceptGroupBoard from '../features/concepts/ConceptGroupBoard'
import Button from '../components/ui/Button'

type View = 'list' | 'groups'

export default function ConceptsPage() {
  const [view, setView] = useState<View>('list')
  const [showConceptForm, setShowConceptForm] = useState(false)

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] gap-3">
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setView('list')}
            className={[
              'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
              view === 'list'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text)] hover:text-[var(--text-h)] hover:bg-[var(--code-bg)]',
            ].join(' ')}
          >
            List
          </button>
          <button
            onClick={() => { setView('groups'); setShowConceptForm(false) }}
            className={[
              'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
              view === 'groups'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text)] hover:text-[var(--text-h)] hover:bg-[var(--code-bg)]',
            ].join(' ')}
          >
            Groups
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <ConceptInitButton />
          {view === 'list' && !showConceptForm && (
            <Button size="sm" onClick={() => setShowConceptForm(true)}>
              Add concept
            </Button>
          )}
        </div>
      </div>

      {/* body */}
      <div className={view === 'groups' ? 'p-4' : 'p-4 space-y-4'}>
        {view === 'list' ? (
          <>
            {showConceptForm && (
              <ConceptForm
                onSuccess={() => setShowConceptForm(false)}
                onCancel={() => setShowConceptForm(false)}
              />
            )}
            <ConceptList />
          </>
        ) : (
          <ConceptGroupBoard />
        )}
      </div>
    </section>
  )
}
