/**
 * Backend contract — Ambiguity Velocity scatter (7-day window).
 * Separate from GET /api/prod/intelligence/ambiguity KPIs.
 */

export const AMBIGUITY_VELOCITY_SCATTER_API = {
  bffPath: '/api/prod/ambiguity/velocity',
  upstreamPath: '/v1/intelligence/timeseries/ambiguity-velocity',
  method: 'GET' as const,
  queryParams: {
    days: 'number — default 7',
    batch_id: 'optional — filter to one batch',
  },
  responseWhenLive: {
    data_available: true,
    tenant_id: 'string',
    window_days: 7,
    window_start: 'ISO-8601 — start of chart window',
    window_end: 'ISO-8601 — end of chart window',
    points: [
      {
        date: 'YYYY-MM-DD',
        observed_at: 'ISO-8601 — exact time on X-axis (required for sub-day scatter)',
        batch_id: 'string',
        total_amount_minor: 'paise — bubble size',
        ambiguous_amount_minor: 'paise',
        ambiguity_level_pct: 'optional 0–100 — Y-axis; else UI computes ambiguous ÷ total × 100',
      },
    ],
  },
  chartMapping: {
    xAxis: 'observed_at → hours since window_start',
    yAxis: 'ambiguity_level_pct (or derived)',
    bubbleSize: 'total_amount_minor',
    color: 'batch_id',
  },
} as const
