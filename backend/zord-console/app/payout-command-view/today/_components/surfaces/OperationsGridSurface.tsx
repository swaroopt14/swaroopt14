'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EntityLogo, inferBankNameFromReference } from '../entity-logo'
import { chartTooltipStyle } from '@/services/payout-command/model'
import { getProdEnvelopeDetail } from '@/services/payout-command/prod-api/getProdEnvelopeDetail'
import { getProdIntentDetail } from '@/services/payout-command/prod-api/getProdIntentDetail'
import { loadProdTraceTableDataset } from '@/services/payout-command/prod-api/loadProdTraceTableDataset'
import type {
  ApiDlqRow,
  ApiEnvelopeRow,
  ApiIntentRow,
  ApiPayoutContract,
} from '@/services/payout-command/prod-api/prodApiTypes'
import { Glyph, LightCard, SurfaceEyebrow } from '../shared'

type TraceTab = 'Intent Table' | 'DLQ Queue' | 'Heat Map' | 'Web Map' | 'Bar Analysis'
type AnalysisWindow = 'Week' | 'Month' | 'Quarter'

const TRACE_TABS: readonly TraceTab[] = ['Intent Table', 'DLQ Queue', 'Heat Map', 'Web Map', 'Bar Analysis']
const ANALYSIS_WINDOWS: readonly AnalysisWindow[] = ['Week', 'Month', 'Quarter']
const INTENT_ROWS_PER_PAGE = 5
const FALLBACK_PSPS = ['Razorpay', 'Cashfree', 'PayU', 'Stripe'] as const
const FALLBACK_RAILS = ['IMPS', 'NEFT', 'RTGS', 'UPI'] as const
const FALLBACK_BANK_PREFIXES = ['ICICI', 'HDFC', 'SBI', 'AXIS'] as const

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function formatInr(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(safeValue)
}

function formatClock(isoDate?: string) {
  if (!isoDate) return '—'
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatAge(isoDate?: string) {
  if (!isoDate) return '—'
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return '—'
  const minutes = Math.max(1, Math.floor((Date.now() - parsed.getTime()) / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

function toReadableCode(code?: string) {
  if (!code) return 'Unclassified issue'
  return code
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function normalizeIntentStatus(status?: string): 'Confirmed' | 'In recovery' | 'Pending finality' {
  const normalized = status?.toLowerCase() ?? ''
  if (normalized.includes('confirm') || normalized.includes('success')) return 'Confirmed'
  if (normalized.includes('reject') || normalized.includes('fail') || normalized.includes('dlq')) return 'In recovery'
  return 'Pending finality'
}

function resolveAction(status: 'Confirmed' | 'In recovery' | 'Pending finality') {
  if (status === 'Confirmed') return 'Export evidence'
  if (status === 'In recovery') return 'Check reroute lane'
  return 'Open intent trail'
}

function resolveDlqFamily(stage?: string, reasonCode?: string) {
  const normalized = `${stage ?? ''} ${reasonCode ?? ''}`.toLowerCase()
  if (normalized.includes('bank') || normalized.includes('statement')) return 'Bank latency'
  if (normalized.includes('callback') || normalized.includes('webhook') || normalized.includes('provider')) return 'Provider callback'
  return 'Data quality'
}

function resolveDlqOwner(stage?: string, reasonCode?: string) {
  const normalized = `${stage ?? ''} ${reasonCode ?? ''}`.toLowerCase()
  if (normalized.includes('bank') || normalized.includes('statement')) return 'Bank Ops'
  if (normalized.includes('callback') || normalized.includes('webhook') || normalized.includes('provider')) return 'Engineering'
  return 'Ops'
}

function resolvePsp(contractPayload?: string, index = 0) {
  if (contractPayload) {
    try {
      const parsedPayload = JSON.parse(atob(contractPayload)) as Record<string, unknown>
      const fromPayload = parsedPayload.psp || parsedPayload.provider || parsedPayload.provider_name
      if (typeof fromPayload === 'string' && fromPayload.trim().length > 0) return fromPayload
    } catch {
      // ignore malformed payloads and use fallback PSP names.
    }
  }
  return FALLBACK_PSPS[index % FALLBACK_PSPS.length]
}

function buildSyntheticBankReference(seed: string, index = 0) {
  const prefix = FALLBACK_BANK_PREFIXES[index % FALLBACK_BANK_PREFIXES.length]
  const digits = seed.replace(/[^0-9a-zA-Z]/g, '').toUpperCase().slice(-12).padStart(12, '0')
  return `${prefix}${digits}`
}

const intentTraceRows = [
  {
    intentId: 'INT-TR-88214',
    beneficiary: 'Vendor Corridor A',
    amount: '₹4,82,450',
    company: 'GHCA Cohort 07',
    psp: 'Razorpay',
    rail: 'IMPS',
    status: 'Pending finality',
    traceId: 'ZRD-TRACE-3f8a9b2c',
    bankRef: 'ICICI26092024011958',
    updated: '11:33 AM',
    action: 'Open intent trail',
  },
  {
    intentId: 'INT-TR-88229',
    beneficiary: 'Collections Node B',
    amount: '₹1,44,200',
    company: 'GHCA Cohort 11',
    psp: 'Cashfree',
    rail: 'NEFT',
    status: 'Confirmed',
    traceId: 'ZRD-TRACE-1ab11ce1',
    bankRef: 'HDFC45092024099117',
    updated: '11:31 AM',
    action: 'Export evidence',
  },
  {
    intentId: 'INT-TR-88233',
    beneficiary: 'Marketplace Seller 09',
    amount: '₹88,900',
    company: 'GHCA Cohort 05',
    psp: 'PayU',
    rail: 'IMPS',
    status: 'In recovery',
    traceId: 'ZRD-TRACE-8dc67af2',
    bankRef: 'Awaited',
    updated: '11:29 AM',
    action: 'Check reroute lane',
  },
  {
    intentId: 'INT-TR-88244',
    beneficiary: 'Vendor Corridor C',
    amount: '₹2,16,700',
    company: 'GHCA Cohort 13',
    psp: 'Stripe',
    rail: 'RTGS',
    status: 'Confirmed',
    traceId: 'ZRD-TRACE-e6170cc1',
    bankRef: 'SBI66292024044188',
    updated: '11:24 AM',
    action: 'Close packet',
  },
  {
    intentId: 'INT-TR-88257',
    beneficiary: 'Settlement Partner M',
    amount: '₹3,08,510',
    company: 'GHCA Cohort 04',
    psp: 'Razorpay',
    rail: 'NEFT',
    status: 'Pending finality',
    traceId: 'ZRD-TRACE-f2ae5be8',
    bankRef: 'AXIS10892024188761',
    updated: '11:20 AM',
    action: 'Await statement lock',
  },
  {
    intentId: 'INT-TR-88263',
    beneficiary: 'Collections Lane D',
    amount: '₹1,97,860',
    company: 'GHCA Cohort 06',
    psp: 'Cashfree',
    rail: 'IMPS',
    status: 'Pending finality',
    traceId: 'ZRD-TRACE-a92b87f1',
    bankRef: 'HDFC99242024077662',
    updated: '11:17 AM',
    action: 'Open intent trail',
  },
  {
    intentId: 'INT-TR-88271',
    beneficiary: 'Marketplace Seller 14',
    amount: '₹74,600',
    company: 'GHCA Cohort 03',
    psp: 'PayU',
    rail: 'NEFT',
    status: 'In recovery',
    traceId: 'ZRD-TRACE-92dcf8b6',
    bankRef: 'Awaited',
    updated: '11:15 AM',
    action: 'Check reroute lane',
  },
  {
    intentId: 'INT-TR-88278',
    beneficiary: 'Vendor Corridor E',
    amount: '₹5,12,330',
    company: 'GHCA Cohort 15',
    psp: 'Stripe',
    rail: 'RTGS',
    status: 'Confirmed',
    traceId: 'ZRD-TRACE-6ac4f702',
    bankRef: 'SBI66292024111008',
    updated: '11:11 AM',
    action: 'Close packet',
  },
  {
    intentId: 'INT-TR-88284',
    beneficiary: 'Settlement Node Q',
    amount: '₹2,49,990',
    company: 'GHCA Cohort 10',
    psp: 'Razorpay',
    rail: 'NEFT',
    status: 'Pending finality',
    traceId: 'ZRD-TRACE-18ea95d3',
    bankRef: 'AXIS10892024210241',
    updated: '11:07 AM',
    action: 'Await statement lock',
  },
  {
    intentId: 'INT-TR-88295',
    beneficiary: 'Collections Partner X',
    amount: '₹1,06,450',
    company: 'GHCA Cohort 08',
    psp: 'Cashfree',
    rail: 'IMPS',
    status: 'Confirmed',
    traceId: 'ZRD-TRACE-c8f72ab0',
    bankRef: 'ICICI26092024133221',
    updated: '11:01 AM',
    action: 'Export evidence',
  },
  {
    intentId: 'INT-TR-88302',
    beneficiary: 'Vendor Corridor H',
    amount: '₹3,64,220',
    company: 'GHCA Cohort 14',
    psp: 'Stripe',
    rail: 'RTGS',
    status: 'In recovery',
    traceId: 'ZRD-TRACE-1dbe88ca',
    bankRef: 'Awaited',
    updated: '10:56 AM',
    action: 'Check reroute lane',
  },
] as const

const dlqQueueRows = [
  {
    dlqId: 'DLQ-1042',
    intentId: 'INT-TR-88217',
    company: 'GHCA Cohort 05',
    psp: 'Razorpay',
    reason: 'Missing IFSC in payload',
    family: 'Data quality',
    retries: '2 / 5',
    moneyAtRisk: '₹52,800',
    owner: 'Ops',
    age: '7m',
    nextMove: 'Patch + replay',
  },
  {
    dlqId: 'DLQ-1049',
    intentId: 'INT-TR-88261',
    company: 'GHCA Cohort 09',
    psp: 'Cashfree',
    reason: 'Callback hash mismatch',
    family: 'Provider callback',
    retries: '1 / 5',
    moneyAtRisk: '₹1,18,200',
    owner: 'Engineering',
    age: '12m',
    nextMove: 'Signature trace',
  },
  {
    dlqId: 'DLQ-1053',
    intentId: 'INT-TR-88264',
    company: 'GHCA Cohort 02',
    psp: 'PayU',
    reason: 'Bank statement lag > SLA',
    family: 'Bank latency',
    retries: '0 / 5',
    moneyAtRisk: '₹3,04,100',
    owner: 'Bank Ops',
    age: '16m',
    nextMove: 'Escalate bank desk',
  },
  {
    dlqId: 'DLQ-1056',
    intentId: 'INT-TR-88270',
    company: 'GHCA Cohort 12',
    psp: 'Stripe',
    reason: 'Beneficiary branch mismatch',
    family: 'Data quality',
    retries: '3 / 5',
    moneyAtRisk: '₹84,440',
    owner: 'Ops',
    age: '21m',
    nextMove: 'Validate account map',
  },
] as const

type IntentTraceRow = ((typeof intentTraceRows)[number]) & {
  envelopeId?: string
  tenantId?: string
}

type DlqQueueRow = (typeof dlqQueueRows)[number]

type IntentDrilldown = {
  intentId: string
  amount: string
  company: string
  currency: string
  source: string
  status: string
  instrument: string
  beneficiary: string
  envelopeId: string
  parseStatus: string
  bankRef: string
  updatedAt: string
}

const heatMapHours = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00'] as const
const heatMapRows = [
  { label: 'PSP issues', values: [4, 6, 8, 7, 5, 3] },
  { label: 'Bank lag', values: [3, 5, 9, 8, 6, 4] },
  { label: 'Data quality', values: [2, 4, 6, 5, 4, 3] },
  { label: 'Governance rules', values: [1, 2, 4, 5, 4, 2] },
] as const

const webMapData = [
  { subject: 'Routing Quality', value: 86 },
  { subject: 'Callback Trust', value: 74 },
  { subject: 'Bank Finality', value: 68 },
  { subject: 'Evidence Completeness', value: 92 },
  { subject: 'SLA Discipline', value: 81 },
  { subject: 'Exception Closure', value: 78 },
] as const

const barAnalysisDataByWindow: Record<AnalysisWindow, ReadonlyArray<{ lane: string; atRisk: number; recovered: number }>> = {
  Week: [
    { lane: 'IMPS', atRisk: 28, recovered: 22 },
    { lane: 'NEFT', atRisk: 24, recovered: 20 },
    { lane: 'RTGS', atRisk: 12, recovered: 10 },
    { lane: 'UPI', atRisk: 18, recovered: 15 },
  ],
  Month: [
    { lane: 'IMPS', atRisk: 92, recovered: 74 },
    { lane: 'NEFT', atRisk: 81, recovered: 66 },
    { lane: 'RTGS', atRisk: 44, recovered: 37 },
    { lane: 'UPI', atRisk: 63, recovered: 52 },
  ],
  Quarter: [
    { lane: 'IMPS', atRisk: 242, recovered: 204 },
    { lane: 'NEFT', atRisk: 214, recovered: 178 },
    { lane: 'RTGS', atRisk: 122, recovered: 101 },
    { lane: 'UPI', atRisk: 188, recovered: 156 },
  ],
}

const timelineSteps = [
  { step: 'Intent received', time: '11:32:01 AM', status: 'Complete' },
  { step: 'Sent to PSP', time: '11:32:05 AM', status: 'Complete' },
  { step: 'PSP processed', time: '11:32:24 AM', status: 'Complete' },
  { step: 'Bank check', time: '11:33:11 AM', status: 'In watch' },
  { step: 'Final outcome', time: '11:38:42 AM', status: 'Pending finality' },
] as const

function getHeatColor(value: number) {
  if (value >= 8) return '#111111'
  if (value >= 6) return 'rgba(17,17,17,0.76)'
  if (value >= 4) return 'rgba(17,17,17,0.52)'
  if (value >= 2) return 'rgba(17,17,17,0.28)'
  return 'rgba(17,17,17,0.12)'
}

function statusPill(status: string) {
  if (status === 'Confirmed') return 'border-[#4ADE80]/35 bg-[#effcf3] text-[#166534]'
  if (status === 'In recovery') return 'border-black/15 bg-[#f5f5f3] text-[#5f5f5a]'
  if (status === 'Pending finality') return 'border-black/15 bg-[#f5f5f3] text-[#111111]'
  return 'border-black/15 bg-white text-[#111111]'
}

function dlqFamilyPill(family: string) {
  if (family === 'Bank latency') return 'border-[#111111]/15 bg-[#f2f2ef] text-[#111111]'
  if (family === 'Provider callback') return 'border-[#4ADE80]/35 bg-[#effcf3] text-[#166534]'
  return 'border-black/15 bg-white text-[#5f5f5a]'
}

export function OperationsGridSurface() {
  const [activeTab, setActiveTab] = useState<TraceTab>('Intent Table')
  const [analysisWindow, setAnalysisWindow] = useState<AnalysisWindow>('Month')
  const [intentPage, setIntentPage] = useState(1)
  const [intentRows, setIntentRows] = useState<IntentTraceRow[]>(() => intentTraceRows.map((row) => ({ ...row })))
  const [dlqRows, setDlqRows] = useState<DlqQueueRow[]>(() => dlqQueueRows.map((row) => ({ ...row })))
  const [intentTotal, setIntentTotal] = useState(intentTraceRows.length)
  const [tablesLoading, setTablesLoading] = useState(true)
  const [tablesError, setTablesError] = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState('—')
  const [tenantCount, setTenantCount] = useState(0)
  const [contractCount, setContractCount] = useState(0)
  const [overviewSummary, setOverviewSummary] = useState({
    intentsReceived24h: 0,
    p95LatencyMs: 0,
    successRatePct: 0,
  })
  const [drilldownLoading, setDrilldownLoading] = useState(false)
  const [drilldownError, setDrilldownError] = useState<string | null>(null)
  const [selectedIntentDrilldown, setSelectedIntentDrilldown] = useState<IntentDrilldown | null>(null)

  const loadTableData = useCallback(async () => {
    setTablesLoading(true)
    setTablesError(null)

    const { overview, intents, envelopes, dlq, contracts, tenants } = await loadProdTraceTableDataset()

    const tenantItems = Array.isArray(tenants?.items) ? tenants.items : []
    const contractItems = Array.isArray(contracts?.items) ? contracts.items : []
    const envelopeItems = Array.isArray(envelopes?.items) ? envelopes.items : []
    const intentItems = Array.isArray(intents?.items) ? intents.items : []
    const dlqItems = Array.isArray(dlq?.items) ? dlq.items : []

    const tenantNameById = new Map(tenantItems.map((tenant) => [tenant.tenant_id, tenant.tenant_name || `Tenant ${tenant.tenant_id.slice(0, 8)}`]))
    const envelopeById = new Map(envelopeItems.map((envelope) => [envelope.envelope_id, envelope]))
    const contractByIntent = new Map(
      contractItems
        .filter((item): item is ApiPayoutContract & { intent_id: string } => typeof item.intent_id === 'string' && item.intent_id.length > 0)
        .map((item) => [item.intent_id, item]),
    )

    const sortedIntents = [...intentItems].sort(
      (left, right) => new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime(),
    )

    const nextIntentRows: IntentTraceRow[] = sortedIntents.slice(0, 120).map((intent, index) => {
      const status = normalizeIntentStatus(intent.status)
      const contract = contractByIntent.get(intent.intent_id)
      const amountNumber = parseNumber(intent.amount)
      const company =
        (intent.tenant_id ? tenantNameById.get(intent.tenant_id) : undefined) ??
        (intent.tenant_id ? `Tenant ${intent.tenant_id.slice(0, 8)}` : `GHCA Cohort ${String((index % 15) + 1).padStart(2, '0')}`)
      const railCandidate = (intent.instrument ?? '').toUpperCase()
      const rail = FALLBACK_RAILS.includes(railCandidate as (typeof FALLBACK_RAILS)[number])
        ? railCandidate
        : FALLBACK_RAILS[index % FALLBACK_RAILS.length]
      const envelope = intent.envelope_id ? envelopeById.get(intent.envelope_id) : undefined
      const traceSuffix = intent.intent_id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(-8) || `${index}`.padStart(8, '0')
      const isPending = status === 'Pending finality'

      return {
        intentId: intent.intent_id,
        beneficiary: `${intent.source || 'Routed'} corridor ${String.fromCharCode(65 + (index % 26))}`,
        amount: formatInr(amountNumber || 50000 + index * 8000),
        company,
        psp: resolvePsp(contract?.contract_payload, index),
        rail,
        status,
        traceId: contract?.trace_id || `ZRD-TRACE-${traceSuffix}`,
        bankRef: isPending ? 'Awaited' : buildSyntheticBankReference(intent.intent_id, index),
        updated: formatClock(intent.created_at),
        action: resolveAction(status),
        envelopeId: intent.envelope_id || envelope?.envelope_id,
        tenantId: intent.tenant_id,
      }
    })

    const intentByEnvelope = new Map(
      sortedIntents
        .filter((intent): intent is ApiIntentRow & { envelope_id: string } => typeof intent.envelope_id === 'string' && intent.envelope_id.length > 0)
        .map((intent) => [intent.envelope_id, intent]),
    )

    const nextDlqRows: DlqQueueRow[] = dlqItems.slice(0, 40).map((item, index) => {
      const relatedIntent = item.envelope_id ? intentByEnvelope.get(item.envelope_id) : undefined
      const relatedContract = relatedIntent?.intent_id ? contractByIntent.get(relatedIntent.intent_id) : undefined
      const family = resolveDlqFamily(item.stage, item.reason_code)
      const owner = resolveDlqOwner(item.stage, item.reason_code)
      const reason = item.error_detail?.trim() || toReadableCode(item.reason_code)
      const moneyAtRisk = formatInr(parseNumber(relatedIntent?.amount) || 60000 + index * 12000)

      return {
        dlqId: item.dlq_id,
        intentId: relatedIntent?.intent_id || `INT-UNK-${String(index + 1).padStart(4, '0')}`,
        company:
          (item.tenant_id ? tenantNameById.get(item.tenant_id) : undefined) ??
          (item.tenant_id ? `Tenant ${item.tenant_id.slice(0, 8)}` : `GHCA Cohort ${String((index % 15) + 1).padStart(2, '0')}`),
        psp: resolvePsp(relatedContract?.contract_payload, index),
        reason,
        family,
        retries: item.replayable ? `${(index % 3) + 1} / 5` : '0 / 5',
        moneyAtRisk,
        owner,
        age: formatAge(item.created_at),
        nextMove: item.replayable ? 'Patch + replay' : 'Escalate owner',
      }
    })

    if (nextIntentRows.length > 0) {
      setIntentRows(nextIntentRows)
      setIntentTotal(intents?.pagination?.total ?? nextIntentRows.length)
    } else {
      setIntentRows(intentTraceRows.map((row) => ({ ...row })))
      setIntentTotal(intentTraceRows.length)
    }

    if (nextDlqRows.length > 0) {
      setDlqRows(nextDlqRows)
    } else {
      setDlqRows(dlqQueueRows.map((row) => ({ ...row })))
    }

    setTenantCount(tenantItems.length)
    setContractCount(contractItems.length)
    setOverviewSummary({
      intentsReceived24h: overview?.kpis?.intents_received_24h ?? sortedIntents.length,
      p95LatencyMs: overview?.kpis?.p95_ingest_latency_ms ?? 0,
      successRatePct: overview?.kpis?.slo?.success_rate_pct ?? 0,
    })
    setLastSyncAt(
      new Date().toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    )

    if (!overview && !intents && !envelopes && !dlq && !contracts && !tenants) {
      setTablesError('Live backend APIs are currently unavailable. Showing fallback table snapshot.')
    }

    setTablesLoading(false)
  }, [])

  const openIntentTrail = useCallback(async (row: IntentTraceRow) => {
    setDrilldownLoading(true)
    setDrilldownError(null)
    setSelectedIntentDrilldown(null)

    const intentDetail = await getProdIntentDetail(row.intentId)
    const envelopeDetail = row.envelopeId ? await getProdEnvelopeDetail(row.envelopeId) : null

    if (!intentDetail && !envelopeDetail) {
      setDrilldownError('Could not load live intent detail right now. Retrying from fallback data.')
      setSelectedIntentDrilldown({
        intentId: row.intentId,
        amount: row.amount,
        company: row.company,
        currency: 'INR',
        source: row.psp,
        status: row.status,
        instrument: row.rail,
        beneficiary: row.beneficiary,
        envelopeId: row.envelopeId || '—',
        parseStatus: 'UNKNOWN',
        bankRef: row.bankRef,
        updatedAt: row.updated,
      })
      setDrilldownLoading(false)
      document.getElementById('trace-evidence-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    const amountFromDetail = parseNumber(intentDetail?.canonical?.amount?.value)
    const statusFromDetail = normalizeIntentStatus(intentDetail?.status)
    const detail: IntentDrilldown = {
      intentId: row.intentId,
      amount: amountFromDetail > 0 ? formatInr(amountFromDetail) : row.amount,
      company: row.company,
      currency: intentDetail?.canonical?.amount?.currency || intentDetail?.source || 'INR',
      source: intentDetail?.source || row.psp,
      status: statusFromDetail || row.status,
      instrument: (intentDetail?.canonical?.instrument?.kind || row.rail).toUpperCase(),
      beneficiary: intentDetail?.beneficiary?.name || row.beneficiary,
      envelopeId: intentDetail?.evidence?.raw_envelope_id || row.envelopeId || '—',
      parseStatus: envelopeDetail?.parse_status || 'UNKNOWN',
      bankRef: envelopeDetail?.object_ref || row.bankRef,
      updatedAt: row.updated,
    }

    setSelectedIntentDrilldown(detail)
    setDrilldownLoading(false)
    document.getElementById('trace-evidence-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const analysisRows = useMemo(() => barAnalysisDataByWindow[analysisWindow], [analysisWindow])
  const intentTotalPages = useMemo(
    () => Math.max(1, Math.ceil(intentRows.length / INTENT_ROWS_PER_PAGE)),
    [intentRows.length],
  )
  const paginatedIntentRows = useMemo(() => {
    const start = (intentPage - 1) * INTENT_ROWS_PER_PAGE
    return intentRows.slice(start, start + INTENT_ROWS_PER_PAGE)
  }, [intentPage, intentRows])

  useEffect(() => {
    setIntentPage(1)
  }, [activeTab])

  useEffect(() => {
    setIntentPage((current) => Math.min(current, intentTotalPages))
  }, [intentTotalPages])

  useEffect(() => {
    void loadTableData()
  }, [loadTableData])

  const selectedIntentFallback = useMemo<IntentDrilldown | null>(() => {
    const firstIntent = intentRows[0]
    if (!firstIntent) return null
    return {
      intentId: firstIntent.intentId,
      amount: firstIntent.amount,
      company: firstIntent.company,
      currency: 'INR',
      source: firstIntent.psp,
      status: firstIntent.status,
      instrument: firstIntent.rail,
      beneficiary: firstIntent.beneficiary,
      envelopeId: firstIntent.envelopeId || '—',
      parseStatus: 'UNKNOWN',
      bankRef: firstIntent.bankRef,
      updatedAt: firstIntent.updated,
    }
  }, [intentRows])

  const activeIntentDrilldown = selectedIntentDrilldown || selectedIntentFallback
  const intentShownStart = intentRows.length === 0 ? 0 : (intentPage - 1) * INTENT_ROWS_PER_PAGE + 1
  const intentShownEnd = intentRows.length === 0 ? 0 : Math.min(intentPage * INTENT_ROWS_PER_PAGE, intentRows.length)

  const renderTabContent = () => {
    if (activeTab === 'Heat Map') {
      return (
        <div className="mt-4 rounded-[1.25rem] border border-black/10 bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-[16px] font-medium text-[#111111]">Money-at-risk heat map by cause and hour</div>
            <div className="flex items-center gap-2 text-[13px] text-[#6f716d]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#111111]" />
              Higher concentration
            </div>
          </div>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: `170px repeat(${heatMapHours.length}, minmax(0, 1fr))` }}>
            <div />
            {heatMapHours.map((hour) => (
              <div key={hour} className="text-center text-[12px] font-medium text-[#8a8a86]">
                {hour}
              </div>
            ))}
            {heatMapRows.map((row) => (
              <div
                key={row.label}
                className="contents"
              >
                <div className="flex items-center text-[13px] font-medium text-[#6f716d]">
                  {row.label}
                </div>
                {row.values.map((value, index) => (
                  <div
                    key={`${row.label}-${index}`}
                    className="aspect-square rounded-[0.8rem] border border-black/8"
                    style={{ background: getHeatColor(value) }}
                    title={`${row.label} at ${heatMapHours[index]}: ${value}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (activeTab === 'Web Map') {
      return (
        <div className="mt-4 rounded-[1.25rem] border border-black/10 bg-white p-4">
          <div className="mb-2 text-[16px] font-medium text-[#111111]">Operational web map</div>
          <div className="text-[13px] text-[#6f716d]">
            Composite health across routing quality, callback trust, finality, and evidence discipline.
          </div>
          <div className="mt-4 h-[19rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
              <RadarChart data={webMapData}>
                <PolarGrid stroke="rgba(17,17,17,0.15)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#6f716d', fontSize: 11 }} />
                <PolarRadiusAxis axisLine={false} tick={false} domain={[0, 100]} />
                <Radar dataKey="value" stroke="#111111" fill="#4ADE80" fillOpacity={0.2} strokeWidth={2.2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )
    }

    if (activeTab === 'Bar Analysis') {
      return (
        <div className="mt-4 rounded-[1.25rem] border border-black/10 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[16px] font-medium text-[#111111]">At-risk vs recovered payout value by lane</div>
            <div className="flex items-center gap-2 rounded-full bg-[#f5f5f3] p-1">
              {ANALYSIS_WINDOWS.map((window) => (
                <button
                  key={window}
                  type="button"
                  onClick={() => setAnalysisWindow(window)}
                  className={`rounded-full px-3 py-1.5 text-[13px] transition ${
                    analysisWindow === window ? 'bg-[#111111] text-white' : 'text-[#6f716d]'
                  }`}
                >
                  {window}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 h-[16rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
              <BarChart data={analysisRows} barGap={9}>
                <XAxis dataKey="lane" axisLine={false} tickLine={false} tick={{ fill: '#6f716d', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 12 }} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={false} />
                <Bar dataKey="atRisk" fill="#c6cbd4" radius={[7, 7, 0, 0]} />
                <Bar dataKey="recovered" fill="#111111" radius={[7, 7, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 rounded-[0.95rem] bg-[#f7f7f5] p-3 text-[13px] leading-5 text-[#6f716d]">
            Analysis: recovered value is catching up fastest on IMPS and NEFT lanes; RTGS remains lower volume but stable, while UPI
            still needs tighter confirmation discipline in the active window.
          </div>
        </div>
      )
    }

    if (activeTab === 'DLQ Queue') {
      return (
        <div className="mt-4 overflow-hidden rounded-[1.25rem] border border-black/10 bg-white">
          <div className="border-b border-black/8 bg-[#f7f7f8] px-4 py-3">
            <div className="text-[14px] font-medium text-[#111111]">DLQ queue and failure taxonomy</div>
            <div className="mt-1 text-[13px] text-[#6f716d]">Live view of intents waiting on replay, escalation, or payload repair.</div>
          </div>
          <div className="max-h-[24rem] overflow-auto">
            <table className="min-w-[1080px] w-full text-left">
              <thead className="sticky top-0 z-10 border-b border-black/10 bg-[#f7f7f8]">
                <tr className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8a8a86]">
                  <th className="px-4 py-3">DLQ / Intent</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">PSP</th>
                  <th className="px-4 py-3">Cause</th>
                  <th className="px-4 py-3">Retries</th>
                  <th className="px-4 py-3">Money at risk</th>
                  <th className="px-4 py-3">Age</th>
                  <th className="px-4 py-3 text-right">Next move</th>
                </tr>
              </thead>
              <tbody>
                {dlqRows.map((row, index) => (
                  <tr key={row.dlqId} className="border-b border-black/8" style={{ background: index % 2 === 0 ? '#ffffff' : '#fbfbf9' }}>
                    <td className="px-4 py-4">
                      <div className="text-[14px] font-semibold text-[#111111]">{row.dlqId}</div>
                      <div className="mt-1 text-[13px] text-[#6f716d]">{row.intentId}</div>
                    </td>
                    <td className="px-4 py-4 text-[14px] text-[#111111]">{row.company}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2.5">
                        <EntityLogo name={row.psp} kind="psp" size={30} className="rounded-[10px]" />
                        <span className="sr-only">{row.psp}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-[14px] text-[#111111]">{row.reason}</div>
                      <span className={`mt-1 inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${dlqFamilyPill(row.family)}`}>
                        {row.family}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[14px] text-[#6f716d]">{row.retries}</td>
                    <td className="px-4 py-4 text-[14px] font-semibold text-[#111111]">{row.moneyAtRisk}</td>
                    <td className="px-4 py-4 text-[13px] text-[#8a8a86]">{row.age}</td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          const relatedIntent = intentRows.find((intent) => intent.intentId === row.intentId)
                          if (relatedIntent) {
                            void openIntentTrail(relatedIntent)
                            return
                          }
                          document.getElementById('trace-evidence-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }}
                        className="rounded-[0.75rem] border border-black/15 bg-white px-3 py-1.5 text-[13px] text-[#111111]"
                      >
                        {row.nextMove}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-black/8 bg-white px-4 py-3 text-[13px] text-[#6f716d]">
            {dlqRows.length} DLQ records in focus • owners: Ops, Engineering, Bank Ops • ready for trace-level evidence drilldown.
          </div>
        </div>
      )
    }

    return (
      <div className="mt-4 overflow-hidden rounded-[1.25rem] border border-black/10 bg-white">
        <div className="border-b border-black/8 bg-[#f7f7f8] px-4 py-3">
          <div className="text-[14px] font-medium text-[#111111]">Intent trace journal</div>
          <div className="mt-1 text-[13px] text-[#6f716d]">Payment-level operating truth with PSP and bank references for fast incident response.</div>
        </div>
        <div className="max-h-[34rem] overflow-auto">
          <table className="min-w-[1320px] w-full text-left">
            <thead className="sticky top-0 z-10 border-b border-black/10 bg-[#f7f7f8]">
              <tr className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8a8a86]">
                <th className="px-4 py-3">Intent / Beneficiary</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">PSP</th>
                <th className="px-4 py-3">Rail</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Trace / Bank ref</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedIntentRows.map((row, index) => {
                const bankName = inferBankNameFromReference(row.bankRef)
                return (
                  <tr key={row.intentId} className="border-b border-black/8" style={{ background: index % 2 === 0 ? '#ffffff' : '#fbfbf9' }}>
                    <td className="px-4 py-5">
                      <div className="text-[16px] font-semibold text-[#111111]">{row.intentId}</div>
                      <div className="mt-1 text-[14px] text-[#6f716d]">{row.beneficiary}</div>
                    </td>
                    <td className="px-4 py-5 text-[16px] font-semibold text-[#111111]">{row.amount}</td>
                    <td className="px-4 py-5 text-[14px] text-[#6f716d]">{row.company}</td>
                    <td className="px-4 py-5">
                      <div className="flex items-center">
                        <EntityLogo name={row.psp} kind="psp" size={34} className="rounded-[10px]" />
                        <span className="sr-only">{row.psp}</span>
                      </div>
                    </td>
                    <td className="px-4 py-5 text-[14px] text-[#111111]">{row.rail}</td>
                    <td className="px-4 py-5">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[12px] font-medium ${statusPill(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-5">
                      <div className="text-[14px] font-medium text-[#111111]">{row.traceId}</div>
                      <div className="mt-1 flex items-center gap-2">
                        {bankName ? <EntityLogo name={bankName} kind="bank" size={26} className="rounded-[8px]" /> : null}
                        <span className="sr-only">{bankName ?? 'No bank yet'}</span>
                        <span className="text-[13px] text-[#6f716d]">{row.bankRef}</span>
                      </div>
                    </td>
                    <td className="px-4 py-5 text-[13px] text-[#8a8a86]">{row.updated}</td>
                    <td className="px-4 py-5 text-right">
                      <button
                        type="button"
                        onClick={() => void openIntentTrail(row)}
                        className="rounded-[0.75rem] border border-black/15 bg-white px-3 py-1.5 text-[13px] text-[#111111]"
                      >
                        {row.action}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-black/8 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[13px] text-[#6f716d]">
            Showing {intentShownStart}-{intentShownEnd} of {intentTotal} intents • sorted by recency.
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIntentPage((current) => Math.max(1, current - 1))}
              disabled={intentPage === 1}
              className="rounded-[0.65rem] border border-black/15 bg-white px-2.5 py-1.5 text-[13px] text-[#111111] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            {Array.from({ length: intentTotalPages }, (_, index) => index + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setIntentPage(page)}
                className={`h-8 min-w-8 rounded-[0.65rem] border px-2 text-[13px] transition ${
                  page === intentPage
                    ? 'border-[#111111] bg-[#111111] text-white'
                    : 'border-black/15 bg-white text-[#111111]'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIntentPage((current) => Math.min(intentTotalPages, current + 1))}
              disabled={intentPage === intentTotalPages}
              className="rounded-[0.65rem] border border-black/15 bg-white px-2.5 py-1.5 text-[13px] text-[#111111] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-8 grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
      <LightCard>
        <div className="flex items-start justify-between gap-3">
          <div>
            <SurfaceEyebrow>Trace &amp; Evidence</SurfaceEyebrow>
            <div className="mt-2 text-[1.2rem] font-medium text-[#111111]">
              One screen to explain exactly what happened to this payment, end-to-end.
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[#6f716d]">
              <span className="rounded-full border border-black/10 bg-white px-2.5 py-1">Live sync: {lastSyncAt}</span>
              <span className="rounded-full border border-black/10 bg-white px-2.5 py-1">Intents (24h): {overviewSummary.intentsReceived24h}</span>
              <span className="rounded-full border border-black/10 bg-white px-2.5 py-1">Success rate: {overviewSummary.successRatePct.toFixed(1)}%</span>
              <span className="rounded-full border border-black/10 bg-white px-2.5 py-1">P95 ingest: {overviewSummary.p95LatencyMs}ms</span>
              <span className="rounded-full border border-black/10 bg-white px-2.5 py-1">Tenants: {tenantCount}</span>
              <span className="rounded-full border border-black/10 bg-white px-2.5 py-1">Contracts: {contractCount}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => document.getElementById('trace-evidence-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="inline-flex items-center gap-2 rounded-[0.85rem] border border-black/15 bg-white px-3 py-2 text-[13px] font-medium text-[#111111]"
          >
            <Glyph name="document" className="h-4 w-4" />
            Open evidence pack
          </button>
        </div>

        {tablesLoading ? (
          <div className="mt-4 rounded-[0.95rem] border border-black/10 bg-[#f8f8f6] px-3 py-2 text-[13px] text-[#6f716d]">
            Loading live table data from overview, intents, envelopes, DLQ, contracts, and tenants APIs…
          </div>
        ) : null}

        {tablesError ? (
          <div className="mt-4 rounded-[0.95rem] border border-[#e3d58a] bg-[#fffbe6] px-3 py-2 text-[13px] text-[#7b6b2a]">
            {tablesError}
          </div>
        ) : null}

        <div className="mt-5 overflow-hidden rounded-[1.25rem] border border-black/10 bg-[#f7f7f8]">
          <div className="grid grid-cols-2 gap-x-5 gap-y-4 px-4 py-4 text-[13px] text-[#6f716d] sm:grid-cols-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a8a86]">Amount</div>
              <div className="mt-1 text-[1.13rem] font-medium text-[#111111]">{activeIntentDrilldown?.amount ?? '—'}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a8a86]">Beneficiary</div>
              <div className="mt-1 text-[1.13rem] font-medium text-[#111111]">{activeIntentDrilldown?.beneficiary ?? '—'}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a8a86]">Client</div>
              <div className="mt-1 text-[1.13rem] font-medium text-[#111111]">{activeIntentDrilldown?.company ?? '—'}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a8a86]">Status</div>
              <div className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${statusPill(activeIntentDrilldown?.status || 'Pending finality')}`}>
                <span className="h-2 w-2 rounded-full bg-[#4ADE80]" />
                {activeIntentDrilldown?.status ?? 'Pending finality'}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 rounded-[0.95rem] bg-[#f5f5f3] p-1.5">
          {TRACE_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-[0.7rem] px-3 py-2 text-[13px] transition ${
                activeTab === tab ? 'bg-[#111111] text-white' : 'text-[#6f716d] hover:bg-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {renderTabContent()}

        <div className="mt-4 rounded-[1.2rem] border border-black/10 bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a8a86]">Timeline</div>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {timelineSteps.map((item) => (
              <div key={item.step} className="rounded-[0.8rem] border border-black/10 bg-[#f7f7f5] px-3 py-2">
                <div className="text-[13px] font-medium text-[#111111]">{item.step}</div>
                <div className="mt-0.5 text-[12px] text-[#6f716d]">
                  {item.time} • {item.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </LightCard>

      <div className="grid gap-4">
        <div id="trace-evidence-panel">
          <LightCard>
            <div className="flex items-center justify-between gap-3">
              <div>
                <SurfaceEyebrow>Evidence pack</SurfaceEyebrow>
            <div className="mt-2 text-[1.13rem] font-medium text-[#111111]">Evidence pack: 100% complete</div>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#4ADE80]/30 bg-[#4ADE80]/14 px-2.5 py-1 text-[12px] font-medium text-[#166534]">
            <span className="h-2 w-2 rounded-full bg-[#4ADE80]" />
            {drilldownLoading ? 'Syncing' : 'Complete'}
          </div>
        </div>

            {drilldownError ? (
              <div className="mt-3 rounded-[0.8rem] border border-[#f0d5d5] bg-[#fff4f4] px-3 py-2 text-[13px] text-[#8d3b3b]">
                {drilldownError}
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              {[
                ['Payment request snapshot', activeIntentDrilldown?.intentId ?? '—'],
                ['Provider processing proof', activeIntentDrilldown?.source ?? '—'],
                ['Bank confirmation record', activeIntentDrilldown?.bankRef ?? 'Awaited'],
                ['Envelope parse status', activeIntentDrilldown?.parseStatus ?? 'UNKNOWN'],
                ['Final outcome certificate', activeIntentDrilldown?.status ?? 'Pending finality'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-[0.9rem] border border-black/8 bg-[#f8f8f5] px-3 py-2.5">
                  <span className="text-[14px] text-[#111111]">{label}</span>
                  <span className="text-[13px] text-[#6f716d]">{value}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="rounded-[0.9rem] bg-[#111111] px-3.5 py-2 text-[13px] font-medium text-white">
                Download pack (PDF)
              </button>
              <button type="button" className="rounded-[0.9rem] border border-black/15 bg-white px-3.5 py-2 text-[13px] font-medium text-[#111111]">
                Download pack (ZIP)
              </button>
            </div>
          </LightCard>
        </div>

        <LightCard className="bg-[#fcfcfa]">
          <SurfaceEyebrow>Safe exposure</SurfaceEyebrow>
          <div className="mt-2 text-[1.07rem] font-medium text-[#111111]">Business-safe drilldown output</div>
          <div className="mt-3 text-[14px] leading-6 text-[#6f716d]">
            This screen intentionally hides raw envelope IDs, event IDs, dispatch IDs, trace IDs, and cryptographic internals.
            Operators see a defensible payout story, while exported evidence can carry generic metadata labels when needed.
          </div>
          <div className="mt-4 rounded-[1rem] border border-black/8 bg-white p-3">
            <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#8a8a86]">External narrative</div>
            <div className="mt-2 text-[14px] leading-6 text-[#6f716d]">
              Request received → Provider processed → Bank confirmation pending → Finality expected in the same close window.
            </div>
          </div>
        </LightCard>
      </div>
    </div>
  )
}
