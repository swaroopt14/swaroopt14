'use client'

export const INTELLIGENCE_BLUE_GRADIENT =
  'linear-gradient(145deg, #1a3a7a 0%, #24499e 48%, #2d5cb8 100%)'

export type ZordInsightItem = {
  title: string
  detail: string
  severity?: 'high' | 'medium' | 'low'
  caseCount?: number
}

type ZordInsightsPanelProps = {
  title?: string
  insights: ZordInsightItem[]
  className?: string
}

export function ZordInsightsPanel({
  title = 'Zord insights',
  insights,
  className = '',
}: ZordInsightsPanelProps) {
  const totalCases = insights.reduce((sum, item) => sum + (item.caseCount ?? 0), 0)

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-[#24499e] p-5 text-white shadow-[0_14px_34px_rgba(0,35,156,0.32)] ${className}`}
      style={{ background: INTELLIGENCE_BLUE_GRADIENT }}
      data-testid="zord-insights-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/75">{title}</p>
        <span className="inline-flex rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-semibold text-white">
          {insights.length} insights · {totalCases > 0 ? `${totalCases} linked cases` : 'awaiting cases'}
        </span>
      </div>
      {insights.length === 0 ? (
        <p className="mt-4 text-[13px] text-white/75">No insights from API yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {insights.map((insight) => (
            <li key={insight.title} className="flex items-start gap-2.5">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  insight.severity === 'high'
                    ? 'bg-[#fda4af]'
                    : insight.severity === 'medium'
                      ? 'bg-[#fcd34d]'
                      : 'bg-[#cbd5e1]'
                }`}
              />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-white">
                  {insight.title}
                  {insight.caseCount ? (
                    <span className="ml-2 inline-flex rounded-full bg-white/90 px-1.5 text-[11px] font-semibold text-[#00239C]">
                      {insight.caseCount}
                    </span>
                  ) : null}
                </p>
                <p className="text-[12.5px] leading-snug text-white/75">{insight.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
