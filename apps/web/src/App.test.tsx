import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from './features/auth/AuthContext'
import type { AuthContextValue } from './features/auth/AuthContext'
import LoginPage from './features/auth/LoginPage'

const unauthCtx: AuthContextValue = {
  user: null,
  isLoading: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
}

describe('App default route', () => {
  it('shows the login page at /login', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthContext.Provider value={unauthCtx}>
          <LoginPage />
        </AuthContext.Provider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })
})
