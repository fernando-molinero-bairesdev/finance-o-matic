import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import AsyncStateGuard from './AsyncStateGuard'

const emptyContent = <p>Nothing here</p>
const children = <p>Data loaded</p>

describe('AsyncStateGuard', () => {
  it('shows loadingText when isLoading', () => {
    render(
      <AsyncStateGuard isLoading isError={false} isEmpty={false} emptyContent={emptyContent} loadingText="Loading items…">
        {children}
      </AsyncStateGuard>
    )
    expect(screen.getByText('Loading items…')).toBeInTheDocument()
    expect(screen.queryByText('Data loaded')).not.toBeInTheDocument()
  })

  it('uses default loading text when loadingText is omitted', () => {
    render(
      <AsyncStateGuard isLoading isError={false} isEmpty={false} emptyContent={emptyContent}>
        {children}
      </AsyncStateGuard>
    )
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows errorText when isError and not isLoading', () => {
    render(
      <AsyncStateGuard isLoading={false} isError isEmpty={false} emptyContent={emptyContent} errorText="Failed to load.">
        {children}
      </AsyncStateGuard>
    )
    expect(screen.getByText('Failed to load.')).toBeInTheDocument()
    expect(screen.queryByText('Data loaded')).not.toBeInTheDocument()
  })

  it('uses default error text when errorText is omitted', () => {
    render(
      <AsyncStateGuard isLoading={false} isError isEmpty={false} emptyContent={emptyContent}>
        {children}
      </AsyncStateGuard>
    )
    expect(screen.getByText('Error loading.')).toBeInTheDocument()
  })

  it('shows emptyContent when isEmpty and not loading/error', () => {
    render(
      <AsyncStateGuard isLoading={false} isError={false} isEmpty emptyContent={emptyContent}>
        {children}
      </AsyncStateGuard>
    )
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.queryByText('Data loaded')).not.toBeInTheDocument()
  })

  it('renders children when all guards pass', () => {
    render(
      <AsyncStateGuard isLoading={false} isError={false} isEmpty={false} emptyContent={emptyContent}>
        {children}
      </AsyncStateGuard>
    )
    expect(screen.getByText('Data loaded')).toBeInTheDocument()
    expect(screen.queryByText('Nothing here')).not.toBeInTheDocument()
  })
})
