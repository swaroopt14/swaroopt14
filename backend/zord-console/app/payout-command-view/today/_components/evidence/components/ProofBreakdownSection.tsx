'use client'

import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { evidenceCopy } from '../copy/evidenceCopy'
import type { ProofBreakdownRow } from '../types/evidenceViewModels'
import { EVIDENCE_ASK } from '../utils/evidenceFormat'

type ProofBreakdownSectionProps = {
  rows: ProofBreakdownRow[]
}

export function ProofBreakdownSection({ rows }: ProofBreakdownSectionProps) {
  const maxTotal = Math.max(...rows.map((r) => r.total), 1)

  return (
    <section className={COMMAND_CENTER_KPI_CARD}>
      <CommandCenterCardGlow />
      <div className="relative border-b border-slate-100 px-5 py-4">
        <p className={`text-[17px] font-semibold ${HOME_TITLE_BLACK}`}>{evidenceCopy.breakdown.title}</p>
        <p className={`mt-0.5 max-w-xl ${HOME_BODY_IMPERIAL_SM}`}>{evidenceCopy.breakdown.subtitle}</p>
      </div>
      <div className="relative space-y-3 p-5">
        {rows.map((row, i) => {
          const pct = row.total > 0 ? (row.completed / row.total) * 100 : 0
          const isReplayDisabled = row.id === 'replay' && row.note === evidenceCopy.breakdown.replayNotEnabled
          return (
            <div
              key={row.id}
              className={`rounded-[12px] border ${EVIDENCE_ASK.border} bg-white p-4`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border ${EVIDENCE_ASK.border} ${EVIDENCE_ASK.field} font-mono text-[12px] font-bold text-[#8a8a86]`}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <p className="text-[16px] font-semibold text-[#111111]">{row.label}</p>
                    {isReplayDisabled ? (
                      <p className="mt-1 text-[14px] font-medium text-amber-800">{row.note}</p>
                    ) : (
                      <p className="mt-1 text-[14px] tabular-nums text-[#6f716d]">
                        <span className="font-semibold text-[#111111]">
                          {row.completed.toLocaleString('en-IN')}
                        </span>
                        {' / '}
                        <span className="font-semibold text-[#111111]">
                          {row.total.toLocaleString('en-IN')}
                        </span>
                        {row.note ? <span className="text-[#94a3b8]"> · {row.note}</span> : null}
                      </p>
                    )}
                  </div>
                </div>
                {!isReplayDisabled ? (
                  <div className="w-full sm:max-w-[16rem]">
                    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[#f4f4f1]">
                      <div
                        className="h-full rounded-full bg-[#4ADE80] transition-[width] duration-500"
                        style={{ width: `${Math.min(100, (row.completed / maxTotal) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right text-[11px] tabular-nums text-[#94a3b8]">{pct.toFixed(0)}%</p>
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
