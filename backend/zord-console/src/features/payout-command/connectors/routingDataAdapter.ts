import { getSeededRoutingSnapshot } from './seededRoutingData'
import { getLiveRoutingSnapshot } from './liveRoutingDataAdapter'
import type { RoutingKpiSnapshot, RoutingTimeWindow } from './types'

export type RoutingIntelligenceAdapter = {
  getSnapshot: (window: RoutingTimeWindow) => Promise<RoutingKpiSnapshot>
}

const seededAdapter: RoutingIntelligenceAdapter = {
  async getSnapshot(window) {
    try {
      const liveSnapshot = await getLiveRoutingSnapshot(window)
      return liveSnapshot ?? getSeededRoutingSnapshot(window)
    } catch {
      return getSeededRoutingSnapshot(window)
    }
  },
}

export function getRoutingIntelligenceAdapter(): RoutingIntelligenceAdapter {
  return seededAdapter
}
