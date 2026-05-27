'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NavyMetricHero } from '../today/_components/command-center/NavyMetricHero'
import { CommandCenterCardGlow } from '../today/_components/command-center/CommandCenterCardGlow'
import { LiveDataHint } from '../today/_components/shared'
import { fmtInrFull } from '../today/_components/command-center/commandCenterFormat'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../today/_components/command-center/homeCommandCenterTokens'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'

function formatPct(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function makeFirePrompt(navigate: (path: string) => void) {
  return (prompt: string) => {
    console.info('[ConnectorIntelligence] action:', prompt)
    navigate('/payout-command-view/today?dock=ambiguity')
  }
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 ring-1 ring-black/[0.03]">
      <p className={COMMAND_CENTER_LABEL_GREEN}>{label}</p>
      <p className={`mt-2 text-[1.65rem] font-extrabold tabular-nums leading-none ${HOME_TITLE_BLACK}`}>{value}</p>
      {sub ? <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>{sub}</p> : null}
    </div>
  )
}

export default function ConnectorIntelligenceClient() {
  const router = useRouter()
  const firePrompt = makeFirePrompt((path) => router.push(path))
  const { tenantReady } = useSessionTenant()
  const { leakage, defensibility, patterns, ambiguity, recommendations, rca, lastFetchedAt } =
    useIntelligenceKpis({ tenantReady })

  const leakageData = isDataAvailable(leakage) ? leakage : null
  const defData = isDataAvailable(defensibility) ? defensibility : null
  const patternsData = isDataAvailable(patterns) ? patterns : null
  const ambiguityData = isDataAvailable(ambiguity) ? ambiguity : null
  const recsData = isDataAvailable(recommendations) ? recommendations : null
  const rcaData = isDataAvailable(rca) ? rca : null

  const defScore = defData?.defensibility_score ?? null
  const intendedMinor = leakageData?.total_intended_amount_minor
  const exposureFromLeakage =
    intendedMinor && defScore !== null
      ? Math.round((Number(intendedMinor) * (100 - defScore)) / 100)
      : null
  const exposureFromAmbiguity = ambiguityData?.value_at_risk_minor
    ? Number(ambiguityData.value_at_risk_minor)
    : null
  const exposureMinor =
    exposureFromLeakage != null && Number.isFinite(exposureFromLeakage) && exposureFromLeakage > 0
      ? exposureFromLeakage
      : exposureFromAmbiguity != null && Number.isFinite(exposureFromAmbiguity) && exposureFromAmbiguity > 0
        ? exposureFromAmbiguity
        : null

  const hasLiveExposure = exposureMinor !== null
  const hasAnyKpi = Boolean(defData || leakageData || patternsData || ambiguityData || recsData || rcaData)
  const heroValue = hasLiveExposure ? fmtInrFull(exposureMinor, { decimals: 0 }) : hasAnyKpi ? 'Pending' : '—'
  const heroDelta = patternsData
    ? `${patternsData.anomaly_level} anomaly · ${patternsData.risk_tier} risk`
    : defData
      ? `Tier ${defData.defensibility_tier} · ${defData.defensibility_score.toFixed(1)}% defensibility`
      : tenantReady
        ? 'Ingest a batch in Batch Command Center to populate intelligence KPIs for this tenant.'
        : 'Sign in to load tenant-scoped connector metrics.'
  const syncLabel = lastFetchedAt
    ? `Sync ${Math.max(0, Math.round((Date.now() - lastFetchedAt.getTime()) / 1000))}s ago`
    : tenantReady
      ? 'Awaiting intelligence sync'
      : 'Sign in for live KPIs'

  return (
    <div className="space-y-5 pb-6 text-[15px] leading-[1.55]">
      <div className={`${COMMAND_CENTER_KPI_CARD} flex flex-wrap items-center justify-between gap-2 !p-4`}>
        <CommandCenterCardGlow />
        <LiveDataHint isLive={hasLiveExposure} source="intelligence" />
        <span className={`relative text-[12px] ${HOME_BODY_IMPERIAL_SM}`}>{syncLabel}</span>
      </div>

      {hasLiveExposure ? (
        <NavyMetricHero
          className="mb-2"
          eyebrow="Total defensibility exposure · this period"
          value={heroValue}
          deltaPill={heroDelta}
          subcopy="Estimated from leakage-weighted intended volume and defensibility score (or ambiguity value at risk when leakage is empty)."
          footer={
            <>
              <button
                type="button"
                onClick={() => firePrompt('Summarize connector exposure for executive PSP review')}
                className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0f172a] transition hover:bg-white/90"
              >
                Executive brief
              </button>
              <Link
                href="/payout-command-view/today?dock=ambiguity"
                className="rounded-lg border border-white/30 bg-transparent px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/10"
              >
                Ambiguity analysis
              </Link>
            </>
          }
          buckets={[
            {
              label: 'Defensibility score',
              value: defScore !== null ? `${defScore.toFixed(1)}%` : '—',
              sub: defData?.defensibility_tier ? `Tier ${defData.defensibility_tier}` : 'Tenant-wide intelligence',
            },
            {
              label: 'Leakage rate',
              value: leakageData ? `${((leakageData.leakage_percentage ?? 0) * 100).toFixed(2)}%` : '—',
              sub: leakageData?.risk_tier ? `Risk ${leakageData.risk_tier}` : 'Leakage KPI 1–6',
            },
            {
              label: 'Batch quality',
              value:
                patternsData?.batch_quality_score != null
                  ? `${(patternsData.batch_quality_score * 100).toFixed(0)}%`
                  : patternsData?.anomaly_level ?? '—',
              sub: patternsData?.anomaly_type ?? 'Patterns dashboard KPI 14',
            },
          ]}
        />
      ) : (
        <section className={`relative mb-2 overflow-hidden ${COMMAND_CENTER_KPI_CARD}`}>
          <CommandCenterCardGlow />
          <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Connector intelligence</p>
          <p className={`relative mt-2 text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>
            {tenantReady ? 'Exposure will appear after batch ingest' : 'Sign in to load connector KPIs'}
          </p>
          <p className={`relative mt-2 max-w-2xl ${HOME_BODY_IMPERIAL_SM}`}>{heroDelta}</p>
          <div className="relative mt-4 grid gap-3 sm:grid-cols-3">
            <KpiTile
              label="Defensibility score"
              value={defScore !== null ? `${defScore.toFixed(1)}%` : '—'}
              sub={defData?.defensibility_tier ? `Tier ${defData.defensibility_tier}` : 'KPI 11–13'}
            />
            <KpiTile
              label="Leakage rate"
              value={leakageData ? `${((leakageData.leakage_percentage ?? 0) * 100).toFixed(2)}%` : '—'}
              sub={leakageData?.risk_tier ? `Risk ${leakageData.risk_tier}` : 'KPI 1–6'}
            />
            <KpiTile
              label="Ambiguity VaR"
              value={ambiguityData ? fmtInrFull(Number(ambiguityData.value_at_risk_minor), { decimals: 0 }) : '—'}
              sub={
                ambiguityData
                  ? `${(ambiguityData.ambiguity_rate * 100).toFixed(2)}% ambiguity rate`
                  : 'KPI 7–10'
              }
            />
          </div>
        </section>
      )}

      <section className={`relative ${COMMAND_CENTER_KPI_CARD}`}>
        <CommandCenterCardGlow />
        <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Patterns & batch quality</p>
        <div className="relative mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            label="Batch quality score"
            value={patternsData?.batch_quality_score != null ? formatPct(patternsData.batch_quality_score) : '—'}
            sub={patternsData?.finality_status ? `Finality · ${patternsData.finality_status}` : 'KPI 14'}
          />
          <KpiTile
            label="Anomaly level"
            value={patternsData?.anomaly_level ?? '—'}
            sub={patternsData?.anomaly_type ?? 'Batch anomaly snapshot'}
          />
          <KpiTile
            label="Exact / ambiguous / unresolved"
            value={
              patternsData
                ? `${patternsData.exact_match_count ?? 0} / ${patternsData.ambiguous_count ?? 0} / ${patternsData.unresolved_count ?? 0}`
                : '—'
            }
            sub={
              patternsData
                ? `${patternsData.success_count} confirmed · ${patternsData.pending_count} pending`
                : 'Match quality counts'
            }
          />
          <KpiTile
            label="Duplicate risk"
            value={patternsData?.duplicate_risk_count != null ? String(patternsData.duplicate_risk_count) : '—'}
            sub={formatPct(patternsData?.duplicate_risk_rate) + ' duplicate rate'}
          />
        </div>
      </section>

      <section className={`relative ${COMMAND_CENTER_KPI_CARD}`}>
        <CommandCenterCardGlow />
        <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Recommendations pipeline</p>
        {recsData ? (
          <div className="relative mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile label="Total actions" value={String(recsData.total_actions)} sub="Action contracts" />
            <KpiTile
              label="Acceptance rate"
              value={formatPct(recsData.action_acceptance_rate)}
              sub={`${recsData.accepted_actions} accepted`}
            />
            <KpiTile
              label="Resolution rate"
              value={formatPct(recsData.action_resolution_rate)}
              sub={`${recsData.resolved_actions} resolved`}
            />
            <KpiTile
              label="Impact estimate"
              value={fmtInrFull(Number(recsData.recommendation_impact_estimate_minor ?? 0), { decimals: 0 })}
              sub="Recommendation impact (minor units as rupees)"
            />
          </div>
        ) : (
          <p className={`relative mt-3 ${HOME_BODY_IMPERIAL_SM}`}>
            {(recommendations && !isDataAvailable(recommendations) && recommendations.reason) ||
              'No recommendation contracts yet for this tenant.'}
          </p>
        )}
      </section>

      <section className={`relative ${COMMAND_CENTER_KPI_CARD}`}>
        <CommandCenterCardGlow />
        <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Root-cause analysis (RCA)</p>
        {rcaData ? (
          <>
            <div className="relative mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiTile
                label="Parser weakness"
                value={formatPct(rcaData.parser_weakness_rate)}
                sub={`${rcaData.weak_parse_count} weak parses`}
              />
              <KpiTile
                label="Mapping weakness"
                value={formatPct(rcaData.mapping_weakness_rate)}
                sub={`${rcaData.weak_mapping_count} weak mappings`}
              />
              <KpiTile
                label="Source defect rate"
                value={formatPct(rcaData.source_system_defect_rate)}
                sub={`${rcaData.total_settlements} settlements reviewed`}
              />
              <KpiTile
                label="RCA concentration"
                value={formatPct(rcaData.rca_concentration)}
                sub="Herfindahl index of cluster amounts"
              />
            </div>
            {rcaData.source_system_defects && Object.keys(rcaData.source_system_defects).length > 0 ? (
              <div className="relative mt-4 overflow-x-auto">
                <table className="w-full min-w-[320px] text-left text-[14px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-[12px] uppercase text-slate-500">
                      <th className="px-2 py-2">Source system</th>
                      <th className="px-2 py-2">Defect rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(rcaData.source_system_defects).map(([sys, rate]) => (
                      <tr key={sys} className="border-b border-slate-100">
                        <td className="px-2 py-2 font-medium">{sys}</td>
                        <td className="px-2 py-2 tabular-nums">{formatPct(rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : (
          <p className={`relative mt-3 ${HOME_BODY_IMPERIAL_SM}`}>
            {(rca && !isDataAvailable(rca) && rca.reason) || 'RCA snapshot not available yet.'}
          </p>
        )}
      </section>

      <ConnectorBatchTable tenantReady={tenantReady} />
    </div>
  )
}

function ConnectorBatchTable({ tenantReady }: { tenantReady: boolean }) {
  const [rows, setRows] = useState<IntelligenceBatchRow[]>([])

  useEffect(() => {
    if (!tenantReady) {
      setRows([])
      return
    }
    void getIntelligenceBatches({ limit: 20 }).then((res) => {
      setRows(res?.batches ?? [])
    })
  }, [tenantReady])

  return (
    <section className="space-y-4">
      <article className={COMMAND_CENTER_KPI_CARD}>
        <CommandCenterCardGlow />
        <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Batch traffic</p>
        <p className={`relative mt-2 ${HOME_BODY_IMPERIAL_SM}`}>
          Live list from GET /api/prod/intelligence/batches.
        </p>
        {rows.length > 0 ? (
          <div className="relative mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-slate-200 text-[12px] uppercase text-slate-500">
                  <th className="px-2 py-2">Batch</th>
                  <th className="px-2 py-2">Finality</th>
                  <th className="px-2 py-2">Success</th>
                  <th className="px-2 py-2">Pending</th>
                  <th className="px-2 py-2">Match confidence</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.batch_id} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-mono text-[12px]">{b.batch_id}</td>
                    <td className="px-2 py-2">{b.finality_status ?? b.status_label ?? '—'}</td>
                    <td className="px-2 py-2 tabular-nums">{b.success_count}</td>
                    <td className="px-2 py-2 tabular-nums">{b.pending_count}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {b.match_confidence_pct != null ? `${b.match_confidence_pct.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={`relative mt-3 ${HOME_BODY_IMPERIAL_SM}`}>
            {tenantReady ? 'No batches yet for this tenant.' : 'Sign in to load batches.'}
          </p>
        )}
        <Link
          href="/payout-command-view/today?dock=ambiguity"
          className={`relative mt-4 inline-flex text-[13px] font-semibold underline decoration-[#d0d0cc] underline-offset-4 hover:decoration-[#000000] ${HOME_TITLE_BLACK}`}
        >
          Open ambiguity analysis →
        </Link>
      </article>
    </section>
  )
}
