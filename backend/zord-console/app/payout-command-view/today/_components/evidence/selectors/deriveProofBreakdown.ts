import { evidenceCopy } from '../copy/evidenceCopy'
import type { ProofBreakdownRow } from '../types/evidenceViewModels'
import type { DefensibilityKpiResolved, PatternsKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'

export function deriveProofBreakdown(input: {
  defensibility: DefensibilityKpiResolved | null
  patterns: PatternsKpiResolved | null
  packCount: number
}): ProofBreakdownRow[] {
  const { defensibility, patterns, packCount } = input

  const inScope = patterns?.total_count ?? (packCount > 0 ? Math.max(packCount, 1000) : 1000)
  const useModelled = !patterns?.total_count && defensibility

  if (!defensibility && packCount === 0) {
    return [
      {
        id: 'scope',
        label: evidenceCopy.breakdown.inScope,
        completed: 0,
        total: 0,
        note: 'Select a batch with intelligence or evidence data',
      },
    ]
  }

  if (defensibility) {
    const evidenced = Math.round(inScope * defensibility.evidence_pack_rate)
    const governanceDone = Math.round(inScope * defensibility.governance_coverage_pct)
    const replayDone = Math.round(inScope * defensibility.replayability_pct)
    const missingItems = Math.max(0, inScope - replayDone)

    const replayNote =
      defensibility.replayability_pct === 0
        ? evidenceCopy.breakdown.replayNotEnabled
        : undefined

    return [
      {
        id: 'scope',
        label: evidenceCopy.breakdown.inScope,
        completed: inScope,
        total: inScope,
        note: useModelled ? 'Estimated from defensibility KPIs' : undefined,
      },
      {
        id: 'packs',
        label: evidenceCopy.breakdown.packsGenerated,
        completed: packCount > 0 ? Math.max(evidenced, packCount) : evidenced,
        total: inScope,
      },
      {
        id: 'governance',
        label: evidenceCopy.breakdown.governanceCompleted,
        completed: governanceDone,
        total: inScope,
      },
      {
        id: 'replay',
        label: evidenceCopy.breakdown.replayPassed,
        completed: replayDone,
        total: inScope,
        note: replayNote,
      },
      {
        id: 'missing',
        label: evidenceCopy.breakdown.missingItems,
        completed: missingItems,
        total: inScope,
      },
    ]
  }

  return [
    {
      id: 'scope',
      label: evidenceCopy.breakdown.inScope,
      completed: inScope,
      total: inScope,
    },
    {
      id: 'packs',
      label: evidenceCopy.breakdown.packsGenerated,
      completed: packCount,
      total: inScope,
    },
    {
      id: 'governance',
      label: evidenceCopy.breakdown.governanceCompleted,
      completed: 0,
      total: inScope,
    },
    {
      id: 'replay',
      label: evidenceCopy.breakdown.replayPassed,
      completed: 0,
      total: inScope,
      note: evidenceCopy.breakdown.replayNotEnabled,
    },
    {
      id: 'missing',
      label: evidenceCopy.breakdown.missingItems,
      completed: Math.max(0, inScope - packCount),
      total: inScope,
    },
  ]
}
