import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import FormActions from './FormActions'

describe('FormActions', () => {
  it('shows label when not pending', () => {
    render(<FormActions label="Save" pendingLabel="Saving…" isPending={false} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('shows pendingLabel when isPending', () => {
    render(<FormActions label="Save" pendingLabel="Saving…" isPending={true} />)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument()
  })

  it('disables submit when isPending', () => {
    render(<FormActions label="Save" pendingLabel="Saving…" isPending={true} />)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  })

  it('does not render Cancel when onCancel is not provided', () => {
    render(<FormActions label="Save" pendingLabel="Saving…" isPending={false} />)
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('renders Cancel and calls onCancel when clicked', async () => {
    const onCancel = vi.fn()
    render(<FormActions label="Save" pendingLabel="Saving…" isPending={false} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
