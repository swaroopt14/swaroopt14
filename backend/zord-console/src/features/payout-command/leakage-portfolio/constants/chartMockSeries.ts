/** Placeholder until leakage history API ships. */
export type ChartPoint = {
  month: string
  value: number
  label?: string
}

export const CHART_MOCK_SERIES: ChartPoint[] = [
  { month: 'Jan', value: 42000 },
  { month: 'Feb', value: 38000 },
  { month: 'Mar', value: 45000 },
  { month: 'Apr', value: 52000 },
  { month: 'May', value: 58200, label: 'May 1' },
  { month: 'Jun', value: 48000 },
  { month: 'Jul', value: 55000 },
  { month: 'Aug', value: 62940, label: 'Aug 31' },
  { month: 'Sep', value: 58000 },
  { month: 'Oct', value: 61000 },
  { month: 'Nov', value: 54000 },
  { month: 'Dec', value: 50000 },
]

export const CHART_TOOLTIP_HIGHLIGHT = {
  start: { label: 'May 1', value: 58200, changePct: 15.41 },
  end: { label: 'Aug 31', value: 62940 },
}

export const CHART_TIMEFRAMES = ['1D', '1W', '1M', '3M', '1Y', 'All'] as const
export type ChartTimeframe = (typeof CHART_TIMEFRAMES)[number]
