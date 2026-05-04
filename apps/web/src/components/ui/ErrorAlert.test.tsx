import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ErrorAlert from './ErrorAlert'

describe('ErrorAlert', () => {
  it('renders nothing when message is null', () => {
    const { container } = render(<ErrorAlert message={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when message is undefined', () => {
    const { container } = render(<ErrorAlert message={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when message is empty string', () => {
    const { container } = render(<ErrorAlert message="" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a p[role=alert] with sm size by default', () => {
    render(<ErrorAlert message="Something went wrong" />)
    const el = screen.getByRole('alert')
    expect(el.tagName).toBe('P')
    expect(el).toHaveTextContent('Something went wrong')
    expect(el.className).toContain('bg-red-50')
  })

  it('renders a span[role=alert] with xs size', () => {
    render(<ErrorAlert message="Inline error" size="xs" />)
    const el = screen.getByRole('alert')
    expect(el.tagName).toBe('SPAN')
    expect(el).toHaveTextContent('Inline error')
    expect(el.className).not.toContain('bg-red-50')
    expect(el.className).toContain('text-xs')
  })
})
