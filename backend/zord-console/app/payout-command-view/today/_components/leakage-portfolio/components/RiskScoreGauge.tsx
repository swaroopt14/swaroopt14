'use client'

import type { DefensibilityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { leakageCopy } from '../../leakage/copy/leakageCopy'
import type { PortfolioLeakageViewModel } from '../normalizeLeakagePayload'
import { deriveRiskScore } from '../utils/deriveRiskScore'

type RiskScoreGaugeProps = {
  data: PortfolioLeakageViewModel
  defensibility: DefensibilityKpiResolved | null
}

export function RiskScoreGauge({ data, defensibility }: RiskScoreGaugeProps) {
  const score = deriveRiskScore(data, defensibility)
  const pct = score / 100
  const angle = 180 * pct

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-[15px] font-semibold text-slate-900">{leakageCopy.severity.title}</h2>
      <p className="mt-1 text-[12px] text-slate-500">{leakageCopy.severity.helper}</p>

      <div className="relative mx-auto mt-4 flex flex-1 flex-col items-center justify-center">
        <svg
          viewBox="0 0 200 120"
          className="w-full max-w-[220px]"
          role="img"
          aria-label={`Risk score ${score} out of 100`}
        >
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${(angle / 180) * 251} 251`}
          />
          <circle
            cx={100 + 80 * Math.cos(Math.PI - (angle * Math.PI) / 180)}
            cy={100 - 80 * Math.sin(Math.PI - (angle * Math.PI) / 180)}
            r="8"
            fill="#0f172a"
            stroke="#fff"
            strokeWidth="2"
          />
        </svg>

        <div className="absolute bottom-6 text-center">
          <p className="text-[2.5rem] font-bold tabular-nums leading-none text-slate-900">
            {score}
            <span className="text-[1.25rem] font-semibold text-slate-400"> / 100</span>
          </p>
        </div>
      </div>

    </article>
  )
}
