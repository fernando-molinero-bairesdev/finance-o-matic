import { createContext } from 'react'
import type { UserRead } from '../../lib/apiClient'

export interface AuthContextValue {
  user: UserRead | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
