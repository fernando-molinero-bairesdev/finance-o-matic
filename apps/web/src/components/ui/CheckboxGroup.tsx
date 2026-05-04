export interface CheckboxItem {
  id: string
  name: string
}

interface CheckboxGroupProps {
  legend: string
  items: CheckboxItem[]
  selectedIds: Set<string> | string[]
  onToggle: (id: string) => void
  getAriaLabel?: (item: CheckboxItem) => string
}

export default function CheckboxGroup({
  legend,
  items,
  selectedIds,
  onToggle,
  getAriaLabel,
}: CheckboxGroupProps) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds)
  return (
    <fieldset className="border border-[var(--border)] rounded-lg p-3 space-y-2">
      <legend className="text-xs font-medium text-[var(--text-h)] px-1">{legend}</legend>
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            aria-label={getAriaLabel ? getAriaLabel(item) : item.name}
            checked={selected.has(item.id)}
            onChange={() => onToggle(item.id)}
            className="accent-[var(--accent)]"
          />
          <span className="text-sm text-[var(--text-h)]">{item.name}</span>
        </label>
      ))}
    </fieldset>
  )
}
