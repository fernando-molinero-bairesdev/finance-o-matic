import { apiFetch } from './apiClient'

export interface FormulaPreviewResult {
  value: number | null
  dependencies: string[]
  error: string | null
}

export async function previewFormula(expression: string): Promise<FormulaPreviewResult> {
  return apiFetch<FormulaPreviewResult>('/api/v1/formulas/preview', {
    method: 'POST',
    body: JSON.stringify({ expression }),
  })
}
