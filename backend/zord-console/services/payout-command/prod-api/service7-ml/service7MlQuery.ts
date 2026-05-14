import type { Service7KpiQuery } from './service7MlTypes'

export function buildService7KpiQuery(query: Service7KpiQuery = {}): string {
  const p = new URLSearchParams()
  if (query.scope) p.set('scope', query.scope)
  if (query.scopeRef) p.set('scope_ref', query.scopeRef)
  if (query.from) p.set('from', query.from)
  if (query.to) p.set('to', query.to)
  if (query.batchId) p.set('batch_id', query.batchId)
  return p.toString()
}

export function withQuery(path: string, query: Service7KpiQuery = {}): string {
  const qs = buildService7KpiQuery(query)
  return qs.length > 0 ? `${path}?${qs}` : path
}

