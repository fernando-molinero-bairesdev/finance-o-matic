import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import CheckboxGroup from './CheckboxGroup'

const items = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
]

describe('CheckboxGroup', () => {
  it('renders fieldset with legend', () => {
    render(<CheckboxGroup legend="Pick items" items={items} selectedIds={[]} onToggle={() => {}} />)
    expect(screen.getByRole('group', { name: 'Pick items' })).toBeInTheDocument()
  })

  it('renders one checkbox per item', () => {
    render(<CheckboxGroup legend="Pick items" items={items} selectedIds={[]} onToggle={() => {}} />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('reflects checked state from array selectedIds', () => {
    render(<CheckboxGroup legend="Pick items" items={items} selectedIds={['a']} onToggle={() => {}} />)
    expect(screen.getByLabelText('Alpha')).toBeChecked()
    expect(screen.getByLabelText('Beta')).not.toBeChecked()
  })

  it('reflects checked state from Set selectedIds', () => {
    render(<CheckboxGroup legend="Pick items" items={items} selectedIds={new Set(['b'])} onToggle={() => {}} />)
    expect(screen.getByLabelText('Alpha')).not.toBeChecked()
    expect(screen.getByLabelText('Beta')).toBeChecked()
  })

  it('calls onToggle with item id when checkbox changes', async () => {
    const onToggle = vi.fn()
    render(<CheckboxGroup legend="Pick items" items={items} selectedIds={[]} onToggle={onToggle} />)
    await userEvent.click(screen.getByLabelText('Alpha'))
    expect(onToggle).toHaveBeenCalledWith('a')
  })

  it('defaults aria-label to item name', () => {
    render(<CheckboxGroup legend="Pick items" items={items} selectedIds={[]} onToggle={() => {}} />)
    expect(screen.getByLabelText('Alpha')).toBeInTheDocument()
  })

  it('uses getAriaLabel when provided', () => {
    render(
      <CheckboxGroup
        legend="Pick items"
        items={items}
        selectedIds={[]}
        onToggle={() => {}}
        getAriaLabel={(item) => `Select ${item.name}`}
      />
    )
    expect(screen.getByLabelText('Select Alpha')).toBeInTheDocument()
  })
})
