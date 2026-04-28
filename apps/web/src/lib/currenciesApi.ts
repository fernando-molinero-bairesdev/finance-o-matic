import { apiFetch } from './apiClient'

export interface CurrencyRead {
  code: string
  name: string
}

export interface CurrencyCreate {
  code: string
  name: string
}

export interface CurrencyUpdate {
  name: string
}

export interface CurrencyInitResponse {
  created: string[]
  skipped: string[]
}

export async function getCurrencies(): Promise<CurrencyRead[]> {
  const res = await apiFetch<{ items: CurrencyRead[] }>('/api/v1/currencies')
  return res.items
}

export async function createCurrency(body: CurrencyCreate): Promise<CurrencyRead> {
  return apiFetch<CurrencyRead>('/api/v1/currencies', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateCurrency(code: string, body: CurrencyUpdate): Promise<CurrencyRead> {
  return apiFetch<CurrencyRead>(`/api/v1/currencies/${code}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function deleteCurrency(code: string): Promise<void> {
  await apiFetch<void>(`/api/v1/currencies/${code}`, { method: 'DELETE' })
}

export async function initCurrencies(): Promise<CurrencyInitResponse> {
  return apiFetch<CurrencyInitResponse>('/api/v1/init/currencies', { method: 'POST' })
}
