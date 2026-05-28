import type {
  AmbiguityHeatmapBatchRow,
  AmbiguityHeatmapResponse,
  MatchingExecutionHeatmap,
} from './intelligenceTypes'
import { isDataAvailable } from './intelligenceTypes'

const HEATMAP_X_LABELS = ['Exact', 'High', 'Amb', 'Unres', 'Conf'] as const
const MAX_ROWS = 12

function batchRowLabel(batchId: string, index: number): number {
  const parts = batchId.split('_')
  const tail = parts[parts.length - 1]
  const n = Number.parseInt(tail, 10)
  return Number.isFinite(n) ? n : index + 1
}

/** Map share of intents in a bucket to heatmap cell intensity (0 idle, 1 syncing, 2 reviewing). */
function cellIntensity(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0
  const ratio = count / total
  if (ratio >= 0.3) return 2
  if (ratio >= 0.05) return 1
  return 0
}

function buildSummary(batches: AmbiguityHeatmapBatchRow[]): string {
  if (!batches.length) return ''
  const reviewing = batches.filter((b) => b.finality_status === 'REQUIRES_REVIEW').length
  const syncing = batches.filter((b) => b.finality_status === 'PROCESSING').length
  const avgScore =
    batches.reduce((sum, b) => sum + (Number.isFinite(b.aggregate_score) ? b.aggregate_score : 0), 0) /
    batches.length
  const intents = batches.reduce((sum, b) => sum + (b.total_count ?? 0), 0)
  const parts = [
    `${batches.length} batch${batches.length === 1 ? '' : 'es'} in matching log`,
    syncing > 0 ? `${syncing} syncing` : null,
    reviewing > 0 ? `${reviewing} in review` : null,
    `avg match score ${Math.round(avgScore * 100)}%`,
  ].filter(Boolean)
  return `${parts.join(' · ')} · ${intents.toLocaleString('en-IN')} intents tracked.`
}

export function mapAmbiguityHeatmapResponse(
  res: AmbiguityHeatmapResponse | null,
): MatchingExecutionHeatmap | null {
  if (!res || !isDataAvailable(res) || !res.batches?.length) return null

  const batches = res.batches.slice(0, MAX_ROWS)
  const y_labels = batches.map((b, i) => batchRowLabel(b.batch_id, i))
  const cells = batches.map((b) => {
    const total = b.total_count > 0 ? b.total_count : 1
    return [
      cellIntensity(b.exact_match_count, total),
      cellIntensity(b.high_confidence_count, total),
      cellIntensity(b.ambiguous_count, total),
      cellIntensity(b.unresolved_count, total),
      cellIntensity(b.conflicted_count, total),
    ]
  })

  const intents_under_evaluation_count = batches.reduce(
    (sum, b) => sum + (b.ambiguous_count ?? 0) + (b.unresolved_count ?? 0),
    0,
  )

  return {
    y_labels,
    x_labels: [...HEATMAP_X_LABELS],
    cells,
    summary: buildSummary(batches),
    intents_under_evaluation_count,
  }
}
