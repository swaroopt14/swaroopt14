'use client'

/**
 * SandboxSeededSection — top-of-sidebar block listing batches that the user
 * seeded from the sandbox dashboard. Renders nothing if there are no seeded
 * batches (so live-mode users don't see an empty section).
 *
 * Visual: orange "Sandbox seeded" eyebrow + count + Clear all link, then one
 * compact row per seeded batch with TEST pill + scenario name + dismiss ×.
 */

import type { SeededBatch } from '@/services/payout-command/intent-journal-types'

export function SandboxSeededSection({
  seededBatches,
  selectedBatchId,
  onSelectBatch,
  onRemoveBatch,
  onClearAll,
}: {
  seededBatches: SeededBatch[]
  selectedBatchId: string
  onSelectBatch: (batchId: string) => void
  onRemoveBatch: (batchId: string) => void
  onClearAll: () => void
}) {
  if (seededBatches.length === 0) return null

  return (
    <div className="border-b border-[#E5E5E5] px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" aria-hidden />
          <span className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A3412]">
            Sandbox seeded
          </span>
          <span className="text-[14px] tabular-nums text-[#94a3b8]">{seededBatches.length}</span>
        </span>
        <button
          type="button"
          onClick={onClearAll}
          className="text-[14px] font-medium text-[#64748b] underline-offset-2 transition hover:text-[#0f172a] hover:underline"
        >
          Clear all
        </button>
      </div>

      <ul className="space-y-1">
        {seededBatches.map((sb) => {
          const selected = sb.batchId === selectedBatchId
          return (
            <li key={sb.batchId}>
              <div
                className={`group flex items-center gap-2 rounded-[8px] border px-2 py-1.5 transition ${
                  selected
                    ? 'border-[#F59E0B] bg-[#FFF7ED]'
                    : 'border-transparent hover:border-[#E5E5E5] hover:bg-[#fafafa]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectBatch(sb.batchId)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="inline-flex shrink-0 items-center rounded-full border border-[#F59E0B]/40 bg-white px-1.5 py-0.5 font-mono text-[13px] font-bold uppercase text-[#9A3412]">
                    {sb.scenarioId === 'bulk_upload' ? 'FILE' : 'TEST'}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-medium text-[#0f172a]" title={sb.batchId}>
                      {sb.batchId}
                    </p>
                    <p className="truncate text-[14px] text-[#64748b]" title={sb.scenarioName}>
                      {sb.scenarioName} · {sb.batch.transactions} intents
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveBatch(sb.batchId)
                  }}
                  aria-label={`Dismiss ${sb.batchId}`}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[18px] leading-none text-[#94a3b8] opacity-0 transition hover:bg-[#E5E5E5] hover:text-[#475569] group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
