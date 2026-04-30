import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConcepts } from '../../lib/conceptsApi'
import { previewFormula } from '../../lib/formulasApi'
import type { FormulaPreviewResult } from '../../lib/formulasApi'
import Button from '../../components/ui/Button'

const OPERATORS = ['+', '-', '*', '/', '(', ')']

interface Props {
  expression: string
  onChange: (value: string) => void
  excludeConceptId?: string
}

export default function FormulaEditor({ expression, onChange, excludeConceptId }: Props) {
  const [result, setResult] = useState<FormulaPreviewResult | null>(null)
  const [testing, setTesting] = useState(false)

  const { data: concepts } = useQuery({ queryKey: ['concepts'], queryFn: getConcepts })
  const pickable = (concepts ?? []).filter((c) => c.id !== excludeConceptId)

  function insertToken(token: string) {
    const trimmed = expression.trimEnd()
    onChange(trimmed ? `${trimmed} ${token}` : token)
  }

  async function handleTest() {
    setTesting(true)
    try {
      const res = await previewFormula(expression)
      setResult(res)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden text-sm">
      <div className="flex divide-x divide-[var(--border)]">
        {/* Concept picker */}
        <div className="w-40 shrink-0 bg-[var(--code-bg)] overflow-y-auto max-h-44">
          <p className="px-2 py-1 text-xs font-medium text-[var(--text)] border-b border-[var(--border)]">
            Concepts
          </p>
          <div className="p-1 space-y-0.5">
            {pickable.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => insertToken(c.name)}
                className="block w-full text-left px-2 py-1 rounded text-xs text-[var(--text-h)] hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] transition-colors"
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 flex flex-col">
          <textarea
            value={expression}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="w-full resize-none p-2 font-mono text-xs bg-[var(--bg)] text-[var(--text-h)] focus:outline-none"
            placeholder="e.g. salary * 12"
            aria-label="Formula expression"
          />
          <div className="flex items-center gap-1 px-2 py-1.5 border-t border-[var(--border)] bg-[var(--code-bg)]">
            {OPERATORS.map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => insertToken(op)}
                className="px-2 py-0.5 rounded border border-[var(--border)] text-xs font-mono text-[var(--text-h)] hover:bg-[var(--accent)]/10 transition-colors"
              >
                {op}
              </button>
            ))}
            <div className="ml-auto">
              <Button type="button" variant="secondary" size="sm" onClick={handleTest} disabled={testing || !expression.trim()}>
                {testing ? 'Testing…' : 'Test'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Result panel */}
      {result && (
        <div className={`px-3 py-2 text-xs border-t border-[var(--border)] ${result.error ? 'bg-red-50 dark:bg-red-950/20 text-red-600' : 'bg-green-50 dark:bg-green-950/20 text-green-700'}`}>
          {result.error ? (
            <span>{result.error}</span>
          ) : (
            <span>
              Result: <strong>{result.value}</strong>
              {result.dependencies.length > 0 && (
                <span className="ml-2 text-[var(--text)]">
                  (uses: {result.dependencies.join(', ')})
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
