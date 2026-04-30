import { useState } from 'react'
import FormulaEditor from '../features/formulas/FormulaEditor'

export default function FormulaPlayground() {
  const [expression, setExpression] = useState('')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-[var(--text-h)]">Formula Playground</h1>
      <p className="text-sm text-[var(--text)]">
        Test formulas against your live concept values without saving anything.
      </p>
      <FormulaEditor expression={expression} onChange={setExpression} />
    </div>
  )
}
