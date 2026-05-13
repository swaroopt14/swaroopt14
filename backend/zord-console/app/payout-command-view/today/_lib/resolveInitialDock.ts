import { dockItems, type DockId } from '@/services/payout-command/model'

/** Resolve `?dock=` for the payout command shell — safe for Server Components (no `window`). */
export function resolveInitialDock(raw: string | string[] | undefined): DockId {
  const s = Array.isArray(raw) ? raw[0] : raw
  if (!s || typeof s !== 'string') return 'home'
  const id = s as DockId
  return dockItems.some((d) => d.id === id) ? id : 'home'
}
