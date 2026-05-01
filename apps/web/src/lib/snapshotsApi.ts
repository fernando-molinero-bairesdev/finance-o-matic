import { apiFetch } from './apiClient'
import type { CarryBehaviour } from './conceptsApi'

export type SnapshotStatus = 'open' | 'processed' | 'complete' | 'pending' | 'failed'
export type SnapshotTrigger = 'manual' | 'scheduled'

export interface ConceptEntryRead {
  id: string
  snapshot_id: string
  concept_id: string
  value: number | null
  currency_code: string
  carry_behaviour_used: CarryBehaviour
  formula_snapshot: string | null
  is_pending: boolean
  entity_id: string | null
}

export interface SnapshotRead {
  id: string
  user_id: string
  process_id: string | null
  date: string
  label: string | null
  trigger: SnapshotTrigger
  status: SnapshotStatus
}

export interface SnapshotFxRateRead {
  base_code: string
  quote_code: string
  rate: number
  as_of: string
}

export interface SnapshotDetail extends SnapshotRead {
  entries: ConceptEntryRead[]
  fx_rates: SnapshotFxRateRead[]
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

export async function processSnapshot(id: string): Promise<SnapshotDetail> {
  return apiFetch<SnapshotDetail>(`/api/v1/snapshots/${id}/process`, { method: 'POST' })
}

export async function completeSnapshot(id: string): Promise<SnapshotRead> {
  return apiFetch<SnapshotRead>(`/api/v1/snapshots/${id}/complete`, { method: 'POST' })
}

export async function updateEntry(
  snapshotId: string,
  entryId: string,
  value: number,
  entityId?: string | null,
): Promise<ConceptEntryRead> {
  return apiFetch<ConceptEntryRead>(
    `/api/v1/snapshots/${snapshotId}/entries/${entryId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ value, entity_id: entityId ?? null }),
    },
  )
}

export async function carryForward(snapshotId: string): Promise<SnapshotDetail> {
  return apiFetch<SnapshotDetail>(`/api/v1/snapshots/${snapshotId}/carry-forward`, {
    method: 'POST',
  })
}

/** @deprecated use updateEntry */
export const resolveEntry = updateEntry
