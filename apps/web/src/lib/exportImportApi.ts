import { apiFetch } from './apiClient'

export interface ConceptExportItem {
  name: string
  kind: string
  currency_code: string
  carry_behaviour: string
  literal_value: number | null
  expression: string | null
  aggregate_op: string | null
  entity_type_name: string | null
  group_names: string[]
}

export interface ConceptExportResponse {
  concepts: ConceptExportItem[]
}

export interface ProcessExportItem {
  name: string
  cadence: string
  concept_scope: string
  selected_concept_names: string[]
}

export interface ProcessExportResponse {
  processes: ProcessExportItem[]
}

export interface ImportResult {
  created: string[]
  updated: string[]
  skipped: string[]
  errors: string[]
}

export async function exportConcepts(): Promise<ConceptExportResponse> {
  return apiFetch<ConceptExportResponse>('/api/v1/export/concepts')
}

export async function exportProcesses(): Promise<ProcessExportResponse> {
  return apiFetch<ProcessExportResponse>('/api/v1/export/processes')
}

export async function importConcepts(payload: ConceptExportResponse): Promise<ImportResult> {
  return apiFetch<ImportResult>('/api/v1/import/concepts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function importProcesses(payload: ProcessExportResponse): Promise<ImportResult> {
  return apiFetch<ImportResult>('/api/v1/import/processes', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
