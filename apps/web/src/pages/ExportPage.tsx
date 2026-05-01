import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  exportConcepts,
  exportProcesses,
  importConcepts,
  importProcesses,
} from '../lib/exportImportApi'
import type { ImportResult } from '../lib/exportImportApi'
import Button from '../components/ui/Button'

// ── helpers ───────────────────────────────────────────────────────────────────

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── ExportSection ─────────────────────────────────────────────────────────────

function ExportSection() {
  const conceptsMutation = useMutation({
    mutationFn: exportConcepts,
    onSuccess: (data) => downloadJson(data, 'concepts.json'),
  })

  const processesMutation = useMutation({
    mutationFn: exportProcesses,
    onSuccess: (data) => downloadJson(data, 'processes.json'),
  })

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text-h)]">Export</h2>
        <p className="text-xs text-[var(--text)] mt-0.5">
          Download your configuration as portable JSON. Import it in any account.
        </p>
      </div>
      <div className="px-4 py-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={conceptsMutation.isPending}
            onClick={() => conceptsMutation.mutate()}
          >
            {conceptsMutation.isPending ? 'Exporting…' : 'Download concepts.json'}
          </Button>
          {conceptsMutation.isError && (
            <span role="alert" className="text-xs text-red-500">Failed to export.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={processesMutation.isPending}
            onClick={() => processesMutation.mutate()}
          >
            {processesMutation.isPending ? 'Exporting…' : 'Download processes.json'}
          </Button>
          {processesMutation.isError && (
            <span role="alert" className="text-xs text-red-500">Failed to export.</span>
          )}
        </div>
      </div>
    </section>
  )
}

// ── ImportResultView ──────────────────────────────────────────────────────────

function ImportResultView({ result }: { result: ImportResult }) {
  const total = result.created.length + result.updated.length + result.skipped.length
  return (
    <div className="mt-3 space-y-1.5 text-xs">
      {total === 0 && result.errors.length === 0 && (
        <p className="text-[var(--text)]">Nothing to import.</p>
      )}
      {result.created.length > 0 && (
        <p className="text-green-600">
          Created ({result.created.length}): {result.created.join(', ')}
        </p>
      )}
      {result.updated.length > 0 && (
        <p className="text-[var(--accent)]">
          Updated ({result.updated.length}): {result.updated.join(', ')}
        </p>
      )}
      {result.skipped.length > 0 && (
        <p className="text-[var(--text)]">
          Skipped ({result.skipped.length}): {result.skipped.join(', ')}
        </p>
      )}
      {result.errors.length > 0 && (
        <div>
          <p className="text-red-500 font-medium">Errors ({result.errors.length}):</p>
          <ul className="list-disc list-inside text-red-500 space-y-0.5">
            {result.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── ImportSection ─────────────────────────────────────────────────────────────

type ImportTarget = 'concepts' | 'processes'

function ImportSection() {
  const [target, setTarget] = useState<ImportTarget>('concepts')
  const [jsonText, setJsonText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    mutationFn: async (text: string) => {
      let payload: unknown
      try {
        payload = JSON.parse(text)
      } catch {
        throw new Error('Invalid JSON')
      }
      if (target === 'concepts') {
        return importConcepts(payload as Parameters<typeof importConcepts>[0])
      }
      return importProcesses(payload as Parameters<typeof importProcesses>[0])
    },
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setJsonText(ev.target?.result as string)
      setParseError(null)
      mutation.reset()
    }
    reader.readAsText(file)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setParseError(null)
    mutation.mutate(jsonText)
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text-h)]">Import</h2>
        <p className="text-xs text-[var(--text)] mt-0.5">
          Paste JSON or upload a file. Existing items are updated by name; new items are created.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3">
        {/* Target selector */}
        <div className="flex gap-4">
          {(['concepts', 'processes'] as ImportTarget[]).map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="import-target"
                value={t}
                checked={target === t}
                onChange={() => { setTarget(t); mutation.reset(); setParseError(null) }}
              />
              <span className="capitalize text-[var(--text-h)]">{t}</span>
            </label>
          ))}
        </div>

        {/* File upload */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            Choose file…
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileChange}
          />
          <span className="text-xs text-[var(--text)]">or paste JSON below</span>
        </div>

        {/* Textarea */}
        <textarea
          aria-label="JSON to import"
          value={jsonText}
          onChange={(e) => { setJsonText(e.target.value); setParseError(null); mutation.reset() }}
          rows={8}
          placeholder={`{ "${target}": [ ... ] }`}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--code-bg)] px-3 py-2 text-xs font-mono text-[var(--text-h)] placeholder:text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-y"
        />

        {parseError && (
          <p role="alert" className="text-xs text-red-500">{parseError}</p>
        )}
        {mutation.isError && !(mutation.error instanceof Error && mutation.error.message === 'Invalid JSON') && (
          <p role="alert" className="text-xs text-red-500">Import failed. Check that the JSON is valid for this target.</p>
        )}
        {mutation.isError && mutation.error instanceof Error && mutation.error.message === 'Invalid JSON' && (
          <p role="alert" className="text-xs text-red-500">Invalid JSON — check your input.</p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={mutation.isPending || !jsonText.trim()}
        >
          {mutation.isPending ? 'Importing…' : `Import ${target}`}
        </Button>

        {mutation.isSuccess && <ImportResultView result={mutation.data} />}
      </form>
    </section>
  )
}

// ── ExportPage ────────────────────────────────────────────────────────────────

export default function ExportPage() {
  return (
    <div className="space-y-4">
      <ExportSection />
      <ImportSection />
    </div>
  )
}
