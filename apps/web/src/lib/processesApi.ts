import { apiFetch } from './apiClient'

export type ProcessCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'manual'
export type ProcessConceptScope = 'all' | 'selected'

export interface ProcessScheduleRead {
  id: string
  process_id: string
  next_run_at: string | null
  last_run_at: string | null
}

export interface ProcessRead {
  id: string
  user_id: string
  name: string
  cadence: ProcessCadence
  concept_scope: ProcessConceptScope
  is_active: boolean
  schedule: ProcessScheduleRead | null
  selected_concept_ids: string[]
}

export interface ProcessCreate {
  name: string
  cadence: ProcessCadence
  concept_scope: ProcessConceptScope
  selected_concept_ids?: string[]
}

export interface ProcessUpdate {
  name?: string
  cadence?: ProcessCadence
  concept_scope?: ProcessConceptScope
  is_active?: boolean
  selected_concept_ids?: string[]
}

export interface ProcessSnapshotCreate {
  date: string
  label?: string | null
}

export async function getProcesses(): Promise<ProcessRead[]> {
  const res = await apiFetch<{ items: ProcessRead[] }>('/api/v1/processes')
  return res.items
}

export async function createProcess(body: ProcessCreate): Promise<ProcessRead> {
  return apiFetch<ProcessRead>('/api/v1/processes', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateProcess(id: string, body: ProcessUpdate): Promise<ProcessRead> {
  return apiFetch<ProcessRead>(`/api/v1/processes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function deleteProcess(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/processes/${id}`, { method: 'DELETE' })
}

export async function takeProcessSnapshot(
  processId: string,
  body: ProcessSnapshotCreate,
): Promise<unknown> {
  return apiFetch(`/api/v1/processes/${processId}/snapshots`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
