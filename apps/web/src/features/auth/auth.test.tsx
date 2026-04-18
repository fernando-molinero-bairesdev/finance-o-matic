import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage'
import RegisterPage from './RegisterPage'
import { AuthContext } from './AuthContext'
import type { AuthContextValue } from './AuthContext'

// ─── helpers ─────────────────────────────────────────────────────────────────

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

function renderWithAuth(ui: React.ReactElement, ctx?: Partial<AuthContextValue>) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={makeAuthCtx(ctx)}>{ui}</AuthContext.Provider>
    </MemoryRouter>,
  )
}

// ─── LoginPage ────────────────────────────────────────────────────────────────

describe('LoginPage', () => {
  it('renders email and password fields', () => {
    renderWithAuth(<LoginPage />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('renders a submit button', () => {
    renderWithAuth(<LoginPage />)
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('calls login with entered credentials on submit', async () => {
    const mockLogin = vi.fn().mockResolvedValue(undefined)
    renderWithAuth(<LoginPage />, { login: mockLogin })

    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'secret123')
  })

  it('shows error message on login failure', async () => {
    const mockLogin = vi.fn().mockRejectedValue(new Error('bad credentials'))
    renderWithAuth(<LoginPage />, { login: mockLogin })

    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i)
  })
})

// ─── RegisterPage ─────────────────────────────────────────────────────────────

describe('RegisterPage', () => {
  it('renders email and password fields', () => {
    renderWithAuth(<RegisterPage />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('renders a submit button', () => {
    renderWithAuth(<RegisterPage />)
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('calls register with entered credentials on submit', async () => {
    const mockRegister = vi.fn().mockResolvedValue(undefined)
    renderWithAuth(<RegisterPage />, { register: mockRegister })

    await userEvent.type(screen.getByLabelText(/email/i), 'new@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(mockRegister).toHaveBeenCalledWith('new@example.com', 'password123')
  })
})
