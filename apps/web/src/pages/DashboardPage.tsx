import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../features/auth/useAuth'
import ConceptList from '../features/concepts/ConceptList'
import ConceptForm from '../features/concepts/ConceptForm'
import ConceptInitButton from '../features/concepts/ConceptInitButton'
import TakeSnapshotForm from '../features/snapshots/TakeSnapshotForm'
import PendingEntriesForm from '../features/snapshots/PendingEntriesForm'
import SnapshotList from '../features/snapshots/SnapshotList'
import ProcessForm from '../features/processes/ProcessForm'
import ProcessList from '../features/processes/ProcessList'
import { getConcepts } from '../lib/conceptsApi'
import type { SnapshotDetail } from '../lib/snapshotsApi'
import Button from '../components/ui/Button'

type SnapshotStep = 'idle' | 'form' | 'pending'

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [showConceptForm, setShowConceptForm] = useState(false)
  const [showProcessForm, setShowProcessForm] = useState(false)
  const [snapshotStep, setSnapshotStep] = useState<SnapshotStep>('idle')
  const [activeSnapshot, setActiveSnapshot] = useState<SnapshotDetail | null>(null)

  const { data: concepts } = useQuery({
    queryKey: ['concepts'],
    queryFn: getConcepts,
  })

  const conceptNames: Record<string, string> = Object.fromEntries(
    (concepts ?? []).map((c) => [c.id, c.name]),
  )

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function handleSnapshotTaken(snapshot: SnapshotDetail) {
    setActiveSnapshot(snapshot)
    const hasPending = snapshot.entries.some((e) => e.is_pending)
    setSnapshotStep(hasPending ? 'pending' : 'idle')
  }

  return (
    <div className="min-h-svh flex flex-col bg-[var(--bg)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--text-h)]">finance-o-matic</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--text)] hidden sm:block">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-4">

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
              <ConceptForm onSuccess={() => setShowConceptForm(false)} onCancel={() => setShowConceptForm(false)} />
            )}
            <ConceptList />
          </div>
        </section>

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
              <ProcessForm onSuccess={() => setShowProcessForm(false)} onCancel={() => setShowProcessForm(false)} />
            )}
            <ProcessList />
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <h2 className="text-sm font-semibold text-[var(--text-h)]">Snapshots</h2>
            {snapshotStep === 'idle' && (
              <Button size="sm" onClick={() => setSnapshotStep('form')}>
                Take snapshot
              </Button>
            )}
          </div>
          <div className="p-4 space-y-4">
            {snapshotStep === 'form' && (
              <TakeSnapshotForm
                onSnapshot={handleSnapshotTaken}
                onCancel={() => setSnapshotStep('idle')}
              />
            )}
            {snapshotStep === 'pending' && activeSnapshot && (
              <PendingEntriesForm
                snapshot={activeSnapshot}
                conceptNames={conceptNames}
                onDone={() => {
                  setSnapshotStep('idle')
                  setActiveSnapshot(null)
                }}
              />
            )}
            <SnapshotList />
          </div>
        </section>

      </main>
    </div>
  )
}
