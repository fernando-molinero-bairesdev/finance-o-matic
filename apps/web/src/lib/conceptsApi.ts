import { apiFetch } from './apiClient'
export type { CurrencyRead } from './currenciesApi'
export { getCurrencies } from './currenciesApi'

export type ConceptKind = 'value' | 'formula' | 'group' | 'aux'
export type CarryBehaviour = 'auto' | 'copy' | 'copy_or_manual'

export interface ConceptRead {
  id: string
  user_id: string
  name: string
  kind: ConceptKind
  currency_code: string
  carry_behaviour: CarryBehaviour
  literal_value: number | null
  expression: string | null
  group_ids: string[]
  aggregate_op: string | null
  entity_type_id?: string | null
}

export interface ConceptCreate {
  name: string
  kind: ConceptKind
  currency_code: string
  carry_behaviour?: CarryBehaviour
  literal_value?: number | null
  expression?: string | null
  group_ids?: string[]
  aggregate_op?: string | null
  entity_type_id?: string | null
}

export interface ConceptUpdate {
  name?: string
  kind?: ConceptKind
  currency_code?: string
  carry_behaviour?: CarryBehaviour
  literal_value?: number | null
  expression?: string | null
  group_ids?: string[] | null
  aggregate_op?: string | null
  entity_type_id?: string | null
}

export async function getConcepts(): Promise<ConceptRead[]> {
  const res = await apiFetch<{ items: ConceptRead[] }>('/api/v1/concepts')
  return res.items
}

export async function createConcept(body: ConceptCreate): Promise<ConceptRead> {
  return apiFetch<ConceptRead>('/api/v1/concepts', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateConcept(id: string, body: ConceptUpdate): Promise<ConceptRead> {
  return apiFetch<ConceptRead>(`/api/v1/concepts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function deleteConcept(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/concepts/${id}`, { method: 'DELETE' })
}

export interface ConceptInitResponse {
  created: ConceptRead[]
  skipped: string[]
}

export async function initConcepts(): Promise<ConceptInitResponse> {
  return apiFetch<ConceptInitResponse>('/api/v1/init/concepts', { method: 'POST' })
}

export interface ConceptHistoryPoint {
  snapshot_id: string
  date: string
  value: number | null
  currency_code: string
}

export async function getConceptHistory(id: string): Promise<ConceptHistoryPoint[]> {
  return apiFetch<ConceptHistoryPoint[]>(`/api/v1/concepts/${id}/history`)
}

export async function getConceptHistoryBatch(
  ids: string[],
): Promise<Record<string, ConceptHistoryPoint[]>> {
  if (ids.length === 0) return {}
  return apiFetch<Record<string, ConceptHistoryPoint[]>>(
    `/api/v1/concepts/history/batch?ids=${ids.join(',')}`,
  )
}
