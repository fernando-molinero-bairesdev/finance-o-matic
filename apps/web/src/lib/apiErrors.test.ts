import { describe, it, expect } from 'vitest'
import { ApiError } from './apiClient'
import { getApiErrorMessage } from './apiErrors'

describe('getApiErrorMessage', () => {
  it('returns conflictMessage for a 409 ApiError', () => {
    const err = new ApiError(409, 'Conflict')
    expect(getApiErrorMessage(err, 'Already exists.')).toBe('Already exists.')
  })

  it('returns fallbackMessage for a non-409 ApiError', () => {
    const err = new ApiError(500, 'Server error')
    expect(getApiErrorMessage(err, 'Already exists.')).toBe('An error occurred. Please try again.')
  })

  it('returns custom fallbackMessage when provided', () => {
    const err = new ApiError(422, 'Unprocessable')
    expect(getApiErrorMessage(err, 'Already exists.', 'Failed to save.')).toBe('Failed to save.')
  })

  it('returns fallbackMessage for a generic Error', () => {
    expect(getApiErrorMessage(new Error('oops'), 'Already exists.')).toBe(
      'An error occurred. Please try again.',
    )
  })

  it('returns fallbackMessage for null', () => {
    expect(getApiErrorMessage(null, 'Already exists.')).toBe('An error occurred. Please try again.')
  })

  it('returns fallbackMessage for undefined', () => {
    expect(getApiErrorMessage(undefined, 'Already exists.')).toBe(
      'An error occurred. Please try again.',
    )
  })
})
