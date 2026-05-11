import type {
  PromptLayerCitation,
  PromptLayerVisualization,
  WorkspaceLiveAnswer,
} from '@/services/payout-command/types'

const WORKSPACE_LIVE_ANSWER_TITLE = 'Latest answer'

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function parseCitations(value: unknown): PromptLayerCitation[] {
  if (!Array.isArray(value)) return []
  const citations: PromptLayerCitation[] = []
  for (const item of value) {
    const row = asObject(item)
    if (!row) continue
    citations.push({
      source_type: typeof row.source_type === 'string' ? row.source_type : undefined,
      record_id: typeof row.record_id === 'string' ? row.record_id : undefined,
      chunk_id: typeof row.chunk_id === 'string' ? row.chunk_id : undefined,
      snippet: typeof row.snippet === 'string' ? row.snippet : undefined,
      score: typeof row.score === 'number' ? row.score : undefined,
    })
  }
  return citations
}

function parseVisualization(value: unknown): PromptLayerVisualization | null {
  const row = asObject(value)
  if (!row) return null
  const type = typeof row.type === 'string' ? row.type : ''

  if (type === 'timeline') {
    if (!Array.isArray(row.series)) return null
    const series = row.series
      .map((point) => {
        const p = asObject(point)
        if (!p) return null
        if (typeof p.t !== 'string' || typeof p.v !== 'number') return null
        return { t: p.t, v: p.v }
      })
      .filter((point): point is { t: string; v: number } => point != null)
    if (series.length === 0) return null
    return { type: 'timeline', series }
  }

  if (type === 'bars' || type === 'bar') {
    if (!Array.isArray(row.items)) return null
    const items = row.items
      .map((item) => {
        const p = asObject(item)
        if (!p) return null
        if (typeof p.label !== 'string' || typeof p.value !== 'number') return null
        return { label: p.label, value: p.value }
      })
      .filter((item): item is { label: string; value: number } => item != null)
    if (items.length === 0) return null
    return { type, items }
  }

  if (type === 'cards') {
    if (!Array.isArray(row.cards)) return null
    const cards = row.cards
      .map((item) => {
        const p = asObject(item)
        if (!p) return null
        if (typeof p.title !== 'string' || typeof p.value !== 'string') return null
        return { title: p.title, value: p.value }
      })
      .filter((card): card is { title: string; value: string } => card != null)
    if (cards.length === 0) return null
    return { type: 'cards', cards }
  }

  return null
}

export function parsePromptLayerAnswer(raw: unknown): WorkspaceLiveAnswer | null {
  const outer = asObject(raw)
  if (!outer) return null
  const root = asObject(outer.response) ?? outer
  const answer = typeof root.answer === 'string' ? root.answer.trim() : ''
  if (!answer) return null

  return {
    title: WORKSPACE_LIVE_ANSWER_TITLE,
    body: answer,
    confidence: typeof root.confidence === 'string' ? root.confidence : null,
    citations: parseCitations(root.citations),
    visualization: parseVisualization(root.visualization),
  }
}
