import type { RoutingTimeWindow } from '@/features/payout-command/connectors/types'

/** @deprecated Mock routing data was removed; Connectors uses live intelligence APIs. */
export function getSeededRoutingSnapshot(_window: RoutingTimeWindow): never {
  throw new Error('seededRoutingData was removed. Connectors now uses live intelligence APIs only.')
}
