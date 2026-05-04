import { ApiError } from './apiClient'

export function getApiErrorMessage(
  err: unknown,
  conflictMessage: string,
  fallbackMessage = 'An error occurred. Please try again.',
): string {
  if (err instanceof ApiError && err.status === 409) return conflictMessage
  return fallbackMessage
}
