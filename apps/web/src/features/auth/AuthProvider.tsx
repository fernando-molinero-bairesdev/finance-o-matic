import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { getMe, login as apiLogin, register as apiRegister } from '../../lib/apiClient'
import type { UserRead } from '../../lib/apiClient'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  // Start loading only when a token is present; avoids a synchronous setState in the effect.
  const [user, setUser] = useState<UserRead | null>(null)
  const [isLoading, setIsLoading] = useState(() => !!localStorage.getItem('token'))

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    getMe()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('token')
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await apiLogin(email, password)
    localStorage.setItem('token', access_token)
    const me = await getMe()
    setUser(me)
  }, [])

  const register = useCallback(
    async (email: string, password: string) => {
      await apiRegister(email, password)
      await login(email, password)
    },
    [login],
  )

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
