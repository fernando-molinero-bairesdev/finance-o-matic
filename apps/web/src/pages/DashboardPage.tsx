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
    <main>
      <h1>Dashboard</h1>
      <p>Welcome, {user?.email}!</p>
      <button onClick={handleLogout}>Sign out</button>

      <section>
        <h2>Concepts</h2>
        <ConceptInitButton />
        {showConceptForm ? (
          <>
            <ConceptForm onSuccess={() => setShowConceptForm(false)} />
            <button onClick={() => setShowConceptForm(false)}>Cancel</button>
          </>
        ) : (
          <button onClick={() => setShowConceptForm(true)}>Add concept</button>
        )}
        <ConceptList />
      </section>

      <section>
        <h2>Processes</h2>
        {showProcessForm ? (
          <>
            <ProcessForm onSuccess={() => setShowProcessForm(false)} />
            <button onClick={() => setShowProcessForm(false)}>Cancel</button>
          </>
        ) : (
          <button onClick={() => setShowProcessForm(true)}>Add process</button>
        )}
        <ProcessList />
      </section>

      <section>
        <h2>Snapshots</h2>

        {snapshotStep === 'idle' && (
          <button onClick={() => setSnapshotStep('form')}>Take snapshot</button>
        )}

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
      </section>
    </main>
  )
}
