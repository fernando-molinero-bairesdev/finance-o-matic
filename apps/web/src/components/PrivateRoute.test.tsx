import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PrivateRoute from './PrivateRoute'
import { AuthContext } from '../features/auth/AuthContext'
import type { AuthContextValue } from '../features/auth/AuthContext'

function makeAuthCtx(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  }
}

describe('PrivateRoute', () => {
  it('redirects unauthenticated users to /login', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthContext.Provider value={makeAuthCtx({ user: null, isLoading: false })}>
          <Routes>
            <Route path="/login" element={<p>Login page</p>} />
            <Route element={<PrivateRoute />}>
              <Route path="/dashboard" element={<p>Dashboard</p>} />
            </Route>
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    const fakeUser: AuthContextValue['user'] = {
      id: '123',
      email: 'test@example.com',
      is_active: true,
      is_superuser: false,
      is_verified: true,
    }
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthContext.Provider value={makeAuthCtx({ user: fakeUser, isLoading: false })}>
          <Routes>
            <Route path="/login" element={<p>Login page</p>} />
            <Route element={<PrivateRoute />}>
              <Route path="/dashboard" element={<p>Dashboard</p>} />
            </Route>
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })

  it('renders nothing while auth is loading', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthContext.Provider value={makeAuthCtx({ user: null, isLoading: true })}>
          <Routes>
            <Route path="/login" element={<p>Login page</p>} />
            <Route element={<PrivateRoute />}>
              <Route path="/dashboard" element={<p>Dashboard</p>} />
            </Route>
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })
})
