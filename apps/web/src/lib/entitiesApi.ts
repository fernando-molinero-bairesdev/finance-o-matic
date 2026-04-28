import { apiFetch } from './apiClient'

export type EntityPropertyType = 'decimal' | 'string' | 'date' | 'entity_ref'
export type EntityPropertyCardinality = 'one' | 'many'

export interface EntityPropertyDefRead {
  id: string
  entity_type_id: string
  name: string
  value_type: EntityPropertyType
  ref_entity_type_id: string | null
  cardinality: EntityPropertyCardinality
  nullable: boolean
  display_order: number
}

export interface EntityPropertyDefCreate {
  name: string
  value_type: EntityPropertyType
  ref_entity_type_id?: string | null
  cardinality?: EntityPropertyCardinality
  nullable?: boolean
  display_order?: number
}

export interface EntityPropertyDefUpdate {
  name?: string
  display_order?: number
  nullable?: boolean
}

export interface EntityTypeRead {
  id: string
  user_id: string
  name: string
}

export interface EntityTypeDetail extends EntityTypeRead {
  properties: EntityPropertyDefRead[]
}

export interface EntityTypeCreate {
  name: string
}

export interface EntityTypeUpdate {
  name: string
}

export interface EntityPropertyValueRead {
  id: string
  entity_id: string
  property_def_id: string
  value_decimal: number | null
  value_string: string | null
  value_date: string | null
  ref_entity_id: string | null
}

export interface EntityRead {
  id: string
  user_id: string
  entity_type_id: string
  name: string
}

export interface EntityDetail extends EntityRead {
  properties: EntityPropertyDefRead[]
  values: EntityPropertyValueRead[]
}

export interface EntityCreate {
  entity_type_id: string
  name: string
}

export interface EntityUpdate {
  name: string
}

// ── Init ─────────────────────────────────────────────────────────────────────

export interface EntityTypeInitResponse {
  created: string[]
  skipped: string[]
}

export async function initEntityTypes(): Promise<EntityTypeInitResponse> {
  return apiFetch<EntityTypeInitResponse>('/api/v1/init/entity-types', { method: 'POST' })
}

export interface EntityInitResponse {
  created: string[]
  skipped: string[]
}

export async function initEntities(): Promise<EntityInitResponse> {
  return apiFetch<EntityInitResponse>('/api/v1/init/entities', { method: 'POST' })
}

// ── Entity Types ──────────────────────────────────────────────────────────────

export async function getEntityTypes(): Promise<EntityTypeDetail[]> {
  const res = await apiFetch<{ items: EntityTypeDetail[] }>('/api/v1/entity-types')
  return res.items
}

export async function createEntityType(body: EntityTypeCreate): Promise<EntityTypeDetail> {
  return apiFetch<EntityTypeDetail>('/api/v1/entity-types', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateEntityType(id: string, body: EntityTypeUpdate): Promise<EntityTypeDetail> {
  return apiFetch<EntityTypeDetail>(`/api/v1/entity-types/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function deleteEntityType(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/entity-types/${id}`, { method: 'DELETE' })
}

export async function addEntityProperty(
  entityTypeId: string,
  body: EntityPropertyDefCreate,
): Promise<EntityPropertyDefRead> {
  return apiFetch<EntityPropertyDefRead>(`/api/v1/entity-types/${entityTypeId}/properties`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateEntityProperty(
  entityTypeId: string,
  propId: string,
  body: EntityPropertyDefUpdate,
): Promise<EntityPropertyDefRead> {
  return apiFetch<EntityPropertyDefRead>(
    `/api/v1/entity-types/${entityTypeId}/properties/${propId}`,
    { method: 'PUT', body: JSON.stringify(body) },
  )
}

export async function deleteEntityProperty(entityTypeId: string, propId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/entity-types/${entityTypeId}/properties/${propId}`, {
    method: 'DELETE',
  })
}

// ── Entities ──────────────────────────────────────────────────────────────────

export async function getEntities(entityTypeId?: string): Promise<EntityRead[]> {
  const qs = entityTypeId ? `?entity_type_id=${entityTypeId}` : ''
  const res = await apiFetch<{ items: EntityRead[] }>(`/api/v1/entities${qs}`)
  return res.items
}

export async function getEntity(id: string): Promise<EntityDetail> {
  return apiFetch<EntityDetail>(`/api/v1/entities/${id}`)
}

export async function createEntity(body: EntityCreate): Promise<EntityDetail> {
  return apiFetch<EntityDetail>('/api/v1/entities', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateEntity(id: string, body: EntityUpdate): Promise<EntityDetail> {
  return apiFetch<EntityDetail>(`/api/v1/entities/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function deleteEntity(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/entities/${id}`, { method: 'DELETE' })
}

export async function setPropertyValues(
  entityId: string,
  propDefId: string,
  values: Record<string, unknown>[],
): Promise<EntityPropertyValueRead[]> {
  return apiFetch<EntityPropertyValueRead[]>(
    `/api/v1/entities/${entityId}/properties/${propDefId}`,
    { method: 'PUT', body: JSON.stringify(values) },
  )
}

export async function deletePropertyValue(
  entityId: string,
  propDefId: string,
  valueId: string,
): Promise<void> {
  await apiFetch<void>(`/api/v1/entities/${entityId}/properties/${propDefId}/${valueId}`, {
    method: 'DELETE',
  })
}
