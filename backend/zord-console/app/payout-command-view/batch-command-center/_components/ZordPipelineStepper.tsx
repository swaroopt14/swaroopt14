'use client'

import type { BatchStepState, BatchTimelineStep } from '@/services/payout-command/batch-model'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../today/_components/command-center/homeCommandCenterTokens'

function PipelineNode({ state, stepNumber }: { state: BatchStepState; stepNumber: number }) {
  if (state === 'done') {
    return (
      <span
        className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#16a34a] text-white shadow-[0_0_0_4px_#fff,0_0_0_5px_rgba(22,163,74,0.25)]"
        aria-hidden
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
          <path
            d="M3 7.2L5.8 10L11 4.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="sr-only">Step {stepNumber} complete</span>
      </span>
    )
  }

  if (state === 'active') {
    return (
      <span
        className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-white shadow-[0_0_0_4px_#fff,0_0_0_6px_rgba(37,99,235,0.28)]"
        aria-hidden
      >
        <span className="absolute inset-0 rounded-full bg-[#2563eb]/35 motion-safe:animate-ping" />
        <span className="relative h-2 w-2 rounded-full bg-white" />
        <span className="sr-only">Step {stepNumber} in progress</span>
      </span>
    )
  }

  if (state === 'warning') {
    return (
      <span
        className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f59e0b] text-white shadow-[0_0_0_4px_#fff,0_0_0_5px_rgba(245,158,11,0.3)]"
        aria-hidden
      >
        <span className="text-[13px] font-bold leading-none">!</span>
        <span className="sr-only">Step {stepNumber} needs attention</span>
      </span>
    )
  }

  return (
    <span
      className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[#d4d4d0] bg-white text-[11px] font-semibold text-[#94a3b8] shadow-[0_0_0_4px_#fff]"
      aria-hidden
    >
      {stepNumber}
      <span className="sr-only">Step {stepNumber} upcoming</span>
    </span>
  )
}

function stateCaption(state: BatchStepState): string {
  if (state === 'done') return 'Complete'
  if (state === 'active') return 'In progress'
  if (state === 'warning') return 'Attention'
  return 'Upcoming'
}

export function ZordPipelineStepper({
  steps,
  progressPct,
  busy,
}: {
  steps: BatchTimelineStep[]
  progressPct: number
  busy: boolean
}) {
  const activeOrWarning = steps.find((s) => s.state === 'active' || s.state === 'warning')
  const currentLabel = activeOrWarning
    ? activeOrWarning.label
    : steps.every((s) => s.state === 'done')
      ? steps[steps.length - 1]?.label
      : (steps.find((s) => s.state === 'upcoming')?.label ?? steps[0]?.label)

  return (
    <section className={COMMAND_CENTER_KPI_CARD} aria-label="Zord pipeline progress">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className={COMMAND_CENTER_LABEL_GREEN}>Zord pipeline</span>
          <h2 className={`mt-2 text-[1.1rem] font-semibold tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>
            Intake → disbursement → bank confirmation
          </h2>
          <p className={`mt-1 max-w-2xl ${HOME_BODY_IMPERIAL_SM}`}>
            Upload intent or settlement files to advance intake stages. Counts refresh from intent-engine and
            intelligence every few seconds for the active Batch-Id.
          </p>
        </div>
        {busy ? (
          <span className="shrink-0 rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1d4ed8] motion-safe:animate-pulse">
            Running
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-slate-200/90 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
            Idle
          </span>
        )}
      </div>

      {currentLabel ? (
        <p className={`mt-3 text-[13px] font-medium ${HOME_BODY_IMPERIAL_SM}`}>
          <span className="font-semibold text-[#000000]">Current stage: </span>
          {currentLabel}
        </p>
      ) : null}

      <div className="relative mt-8 hidden lg:block">
        <div className="absolute left-4 right-4 top-4 h-0.5 rounded-full bg-[#e8e8e5]" aria-hidden />
        <div
          className="absolute left-4 top-4 h-0.5 rounded-full bg-gradient-to-r from-[#2563eb] via-[#3b82f6] to-[#22c55e] transition-[width] duration-700 ease-out"
          style={{ width: `calc((100% - 2rem) * ${Math.min(100, Math.max(0, progressPct)) / 100})` }}
          role="progressbar"
          aria-valuenow={Math.round(progressPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Pipeline progress"
        />
        <ol className="relative flex justify-between gap-1">
          {steps.map((step, i) => (
            <li key={step.label} className="flex min-w-0 flex-1 flex-col items-center px-0.5 text-center">
              <PipelineNode state={step.state} stepNumber={i + 1} />
              <p className={`mt-3 max-w-[7.5rem] text-[11px] font-semibold leading-snug tracking-[-0.01em] ${HOME_TITLE_BLACK}`}>
                {step.label}
              </p>
              <p
                className={`mt-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ${
                  step.state === 'done'
                    ? 'text-[#16a34a]'
                    : step.state === 'active'
                      ? 'text-[#2563eb]'
                      : step.state === 'warning'
                        ? 'text-[#d97706]'
                        : 'text-[#94a3b8]'
                }`}
              >
                {stateCaption(step.state)}
              </p>
            </li>
          ))}
        </ol>
      </div>

      <ol className="mt-6 space-y-0 lg:hidden">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1
          return (
            <li key={step.label} className="relative flex gap-3 pb-5">
              {!isLast ? (
                <span
                  className="absolute left-4 top-8 bottom-0 w-px bg-[#e8e8e5]"
                  aria-hidden
                />
              ) : null}
              <PipelineNode state={step.state} stepNumber={i + 1} />
              <div className="min-w-0 pt-0.5">
                <p className={`text-[14px] font-semibold leading-snug ${HOME_TITLE_BLACK}`}>{step.label}</p>
                <p
                  className={`mt-0.5 text-[11px] font-medium uppercase tracking-[0.06em] ${
                    step.state === 'done'
                      ? 'text-[#16a34a]'
                      : step.state === 'active'
                        ? 'text-[#2563eb]'
                        : step.state === 'warning'
                          ? 'text-[#d97706]'
                          : 'text-[#94a3b8]'
                  }`}
                >
                  {stateCaption(step.state)}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
