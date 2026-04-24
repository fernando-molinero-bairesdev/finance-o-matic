import { apiFetch } from './apiClient'
import type { CarryBehaviour } from './conceptsApi'

export type SnapshotStatus = 'pending' | 'complete' | 'failed'
export type SnapshotTrigger = 'manual'

export interface ConceptEntryRead {
  id: string
  snapshot_id: string
  concept_id: string
  value: number | null
  currency_code: string
  carry_behaviour_used: CarryBehaviour
  formula_snapshot: string | null
  is_pending: boolean
}

export interface SnapshotRead {
  id: string
  user_id: string
  date: string
  label: string | null
  trigger: SnapshotTrigger
  status: SnapshotStatus
}

export interface SnapshotDetail extends SnapshotRead {
  entries: ConceptEntryRead[]
}

export interface SnapshotCreate {
  date: string
  label?: string | null
}

export async function createSnapshot(body: SnapshotCreate): Promise<SnapshotDetail> {
  return apiFetch<SnapshotDetail>('/api/v1/snapshots', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function getSnapshots(): Promise<SnapshotRead[]> {
  const res = await apiFetch<{ items: SnapshotRead[] }>('/api/v1/snapshots')
  return res.items
}

export async function getSnapshot(id: string): Promise<SnapshotDetail> {
  return apiFetch<SnapshotDetail>(`/api/v1/snapshots/${id}`)
}

export async function resolveEntry(
  snapshotId: string,
  entryId: string,
  value: number,
): Promise<ConceptEntryRead> {
  return apiFetch<ConceptEntryRead>(
    `/api/v1/snapshots/${snapshotId}/entries/${entryId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    },
  )
}
