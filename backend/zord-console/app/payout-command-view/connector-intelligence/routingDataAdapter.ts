import { getSeededRoutingSnapshot } from './seededRoutingData'
import type { RoutingKpiSnapshot, RoutingTimeWindow } from './types'

export type RoutingIntelligenceAdapter = {
  getSnapshot: (window: RoutingTimeWindow) => Promise<RoutingKpiSnapshot>
}

const seededAdapter: RoutingIntelligenceAdapter = {
  async getSnapshot(window) {
    return getSeededRoutingSnapshot(window)
  },
}

export function getRoutingIntelligenceAdapter(): RoutingIntelligenceAdapter {
  // Future API boundary:
  // swap to `/api/prod/intelligence/routing-*` adapter without changing UI.
  return seededAdapter
}
