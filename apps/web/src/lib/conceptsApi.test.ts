import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './apiClient'
import {
  createConcept,
  deleteConcept,
  getConcepts,
  getCurrencies,
  updateConcept,
} from './conceptsApi'

const BASE = 'http://localhost:8000'

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
}

beforeEach(() => {
  localStorage.setItem('token', 'test-token')
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('getConcepts', () => {
  it('calls GET /api/v1/concepts', async () => {
    vi.stubGlobal('fetch', mockFetch({ items: [] }))
    await getConcepts()
    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/api/v1/concepts`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
    )
  })

  it('returns the items array', async () => {
    const items = [{ id: '1', name: 'salary' }]
    vi.stubGlobal('fetch', mockFetch({ items }))
    const result = await getConcepts()
    expect(result).toEqual(items)
  })

  it('throws ApiError on non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch('Unauthorized', false, 401))
    await expect(getConcepts()).rejects.toBeInstanceOf(ApiError)
    await expect(getConcepts()).rejects.toMatchObject({ status: 401 })
  })
})

describe('createConcept', () => {
  it('calls POST /api/v1/concepts with body', async () => {
    const concept = { id: '1', name: 'salary', kind: 'value' as const, currency_code: 'USD', carry_behaviour: 'copy_or_manual' as const, literal_value: 5000, expression: null, parent_group_id: null, aggregate_op: null, user_id: 'u1' }
    vi.stubGlobal('fetch', mockFetch(concept, true, 201))
    await createConcept({ name: 'salary', kind: 'value', currency_code: 'USD', literal_value: 5000 })
    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/api/v1/concepts`,
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('salary') }),
    )
  })
})

describe('updateConcept', () => {
  it('calls PUT /api/v1/concepts/{id}', async () => {
    const id = 'abc-123'
    vi.stubGlobal('fetch', mockFetch({ id, name: 'renamed' }))
    await updateConcept(id, { name: 'renamed' })
    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/api/v1/concepts/${id}`,
      expect.objectContaining({ method: 'PUT' }),
    )
  })
})

describe('deleteConcept', () => {
  it('calls DELETE /api/v1/concepts/{id}', async () => {
    const id = 'abc-123'
    vi.stubGlobal('fetch', mockFetch(null, true, 204))
    await deleteConcept(id)
    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/api/v1/concepts/${id}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})

describe('getCurrencies', () => {
  it('calls GET /api/v1/currencies', async () => {
    vi.stubGlobal('fetch', mockFetch({ items: [] }))
    await getCurrencies()
    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/api/v1/currencies`,
      expect.anything(),
    )
  })

  it('returns the items array', async () => {
    const items = [{ code: 'USD', name: 'US Dollar' }]
    vi.stubGlobal('fetch', mockFetch({ items }))
    const result = await getCurrencies()
    expect(result).toEqual(items)
  })
})
