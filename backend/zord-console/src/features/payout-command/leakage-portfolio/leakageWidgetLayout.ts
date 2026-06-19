export type LeakageWidgetId =
  | 'kpiHero'
  | 'trendChart'
  | 'watchlistTable'
  | 'exposureSegmentBar'
  | 'batchScoreHealth'
  | 'zordInsight'

export const LEAKAGE_WIDGET_LABELS: Record<LeakageWidgetId, string> = {
  kpiHero: 'KPI hero',
  trendChart: 'Leakage trend',
  watchlistTable: 'Batch watchlist',
  exposureSegmentBar: 'Exposure segments',
  batchScoreHealth: 'Batch score health',
  zordInsight: 'Zord insights',
}

export const DEFAULT_LEAKAGE_WIDGET_ORDER: LeakageWidgetId[] = [
  'kpiHero',
  'watchlistTable',
  'batchScoreHealth',
  'zordInsight',
]

const STORAGE_KEY = 'payout-leakage-widget-layout-v3'

export function loadLeakageWidgetLayout(): LeakageWidgetId[] {
  if (typeof window === 'undefined') return DEFAULT_LEAKAGE_WIDGET_ORDER
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LEAKAGE_WIDGET_ORDER
    const parsed = JSON.parse(raw) as LeakageWidgetId[]
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_LEAKAGE_WIDGET_ORDER
    return parsed.filter((id) => id !== 'exposureSegmentBar')
  } catch {
    return DEFAULT_LEAKAGE_WIDGET_ORDER
  }
}

export function saveLeakageWidgetLayout(order: LeakageWidgetId[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
}

export function resetLeakageWidgetLayout() {
  saveLeakageWidgetLayout(DEFAULT_LEAKAGE_WIDGET_ORDER)
}
