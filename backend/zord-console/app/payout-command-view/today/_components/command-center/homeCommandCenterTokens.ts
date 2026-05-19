/**
 * Home / Today / Batch command center — Manrope scale (see `homeDashboardTypography.tsx`).
 * Titles #000000 · supporting prose imperial blue #00239C · micro labels #888888 · accent green in components.
 */
export const HOME_TITLE_BLACK = 'text-[#000000]'
export const HOME_BODY_IMPERIAL =
  'text-[15px] font-medium leading-[1.6] text-[#00239C]'
export const HOME_BODY_IMPERIAL_CENTERED =
  'mx-auto max-w-[520px] text-[15px] font-medium leading-[1.6] text-[#00239C]'
export const HOME_BODY_IMPERIAL_SM = 'text-[13px] font-medium leading-relaxed text-[#00239C]'
/** Slightly larger supporting line (e.g. stat card sublabels). */
export const HOME_BODY_IMPERIAL_MD = 'text-[14px] font-medium leading-relaxed text-[#00239C]'

export const HOME_INSIGHT_PROSE =
  'text-[13px] font-medium leading-relaxed tracking-[0] text-[#00239C]'
export const HOME_INSIGHT_PROSE_STRONG = 'font-semibold text-[#000000]'
/** Insight / editorial body: 20px with inline extrabold hits from `emphasizeInsightPercentages`. */
export const HOME_INSIGHT_EDITORIAL =
  'text-[20px] font-normal leading-[1.45] tracking-[0] text-[#00239C]'

export const HOME_NEON = '#3dff82'
export const HOME_NEON_RING = 'rgba(61,255,130,0.22)'

/** Green micro-labels for KPI / exception categories (batch + command center). */
export const COMMAND_CENTER_LABEL_GREEN =
  'text-[11px] font-semibold uppercase tracking-[0.08em] text-[#16a34a]'

/** White KPI card shell — matches `HomeCommandCenterLightBand` CARD_SHELL. */
export const COMMAND_CENTER_KPI_CARD =
  'relative flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_10px_44px_rgba(15,23,42,0.07)] ring-1 ring-black/[0.03]'

/** Black stat tiles inside journal batch overview (Intent + Settlement). */
export const JOURNAL_KPI_STAT_CARD =
  'rounded-xl border border-white/12 bg-[#0A0A0A] px-4 py-3.5 shadow-[0_10px_32px_rgba(0,0,0,0.28)] ring-1 ring-white/10'
export const JOURNAL_KPI_STAT_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55'
export const JOURNAL_KPI_STAT_VALUE =
  'mt-1 text-[22px] font-semibold tabular-nums tracking-tight text-white'
export const JOURNAL_KPI_STAT_VALUE_MONO =
  'mt-1 break-all font-mono text-[14px] font-semibold tabular-nums tracking-tight text-white'

/** Green insight callout (white copy) — batch trend / ops hints. */
export const COMMAND_CENTER_INSIGHT_GREEN_CARD =
  'rounded-xl bg-gradient-to-br from-[#166534] via-[#16a34a] to-[#22c55e] px-4 py-3.5 shadow-[0_8px_28px_rgba(22,163,74,0.32)] ring-1 ring-white/25'

export const COMMAND_CENTER_INSIGHT_GREEN_TEXT =
  'text-[13px] font-medium leading-relaxed text-white'

/** Outer wash behind the white console card (Home + Batch + Sandbox). */
export const PAYOUT_PAGE_BG_CLASS = 'bg-[#f5f5f5]'
/** Whitish minimal warm beige — Home command band + Batch body. */
export const PAYOUT_WARM_SURFACE_BG_CLASS = 'bg-[#f4f4f1]'
/** White elevated console card (nav + surfaces). */
export const PAYOUT_CONSOLE_CARD_CLASS =
  'w-full overflow-hidden border border-black/10 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.12)]'
