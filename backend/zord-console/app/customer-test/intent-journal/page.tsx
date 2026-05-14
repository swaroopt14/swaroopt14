'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { useSessionTenantId } from '@/services/auth/useSessionTenantId'

type TableType = 'intents' | 'dlq' | 'envelopes' | 'contracts'

type BaseRow = {
  kind: TableType
  rowId: string
  createdAt: string
  createdAtDate: Date
}

type IntentRow = BaseRow & {
  kind: 'intents'
  intentId: string
  envelopeId: string
  traceId: string
  source: string
  sourceLogo: string
  stage: 'Canonical' | 'Relay' | 'Fusion' | 'Evidence'
  status: string
  amount: string
  confidence: number
  schema: string
}

type DlqRow = BaseRow & {
  kind: 'dlq'
  dlqId: string
  envelopeId: string
  source: string
  sourceLogo: string
  stage: string
  reasonCode: string
  replayable: boolean
}

type EnvelopeRow = BaseRow & {
  kind: 'envelopes'
  envelopeId: string
  source: string
  parseStatus: string
  signatureStatus: string
  tenantId: string
  payloadHash: string
}

type ContractRow = BaseRow & {
  kind: 'contracts'
  contractId: string
  intentId: string
  envelopeId: string
  status: string
  traceId: string
  tenantId: string
}

type JournalRow = IntentRow | DlqRow | EnvelopeRow | ContractRow

type ApiIntent = {
  intent_id?: string
  envelope_id?: string
  status?: string
  amount?: string | number
  currency?: string
  confidence_score?: number
  created_at?: string
  schema_version?: string
  canonical_version?: string
}

type ApiDLQ = {
  dlq_id?: string
  envelope_id?: string
  stage?: string
  reason_code?: string
  replayable?: boolean
  created_at?: string
}

type ApiEnvelope = {
  envelope_id?: string
  source?: string
  parse_status?: string
  signature_status?: string
  received_at?: string
  tenant_id?: string
  sha256?: string
}

type ApiContract = {
  contract_id?: string
  intent_id?: string
  envelope_id?: string
  status?: string
  trace_id?: string
  tenant_id?: string
  created_at?: string
}

type ApiPagedResponse<T> = {
  items?: T[]
  pagination?: {
    page?: number
    page_size?: number
    total?: number
  }
  error?: string
}

type SourceMeta = { source: string; sourceLogo: string }

const SOURCE_SEQUENCE: SourceMeta[] = [
  { source: 'Razorpay', sourceLogo: '/sources/razorpay-clean-clean.png' },
  { source: 'PayPal', sourceLogo: '/sources/paypal-clean.png' },
  { source: 'Cashfree', sourceLogo: '/sources/cashfree-clean.png' },
  { source: 'PhonePe', sourceLogo: '/sources/phonepe-clean.png' },
  { source: 'SBI', sourceLogo: '/sources/sbi-clean.png' },
  { source: 'Google Pay', sourceLogo: '/sources/gpay-clean.png' },
  { source: 'BHIM', sourceLogo: '/sources/bhim-clean.png' },
  { source: 'Stripe', sourceLogo: '/sources/stripe-clean.png' },
  { source: 'HDFC Bank', sourceLogo: '/sources/hdfc-bank-clean.png' },
  { source: 'Visa', sourceLogo: '/sources/visa-clean.png' },
  { source: 'Mastercard', sourceLogo: '/sources/mastercard-clean.png' },
]

function sourceForKey(key: string): SourceMeta {
  const total = key.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return SOURCE_SEQUENCE[total % SOURCE_SEQUENCE.length]
}

const EXCLUDED_INTENT_IDS = new Set(['6339e5ff-1267-4135-bfe3-07b0f4518ef5'])

const statusStyles: Record<string, string> = {
  FUSED_SUCCESS: 'border-[#0D9488] bg-[#2DD4BF]/25 text-[#134E4A]',
  READY_FOR_RELAY: 'border-[#6366F1] bg-[#A5B4FC]/40 text-[#312E81]',
  EXCEPTION: 'border-[#0F172A] bg-[#0F172A]/15 text-[#0F172A]',
  CANONICALIZED: 'border-[#6366F1] bg-[#A5B4FC]/35 text-[#312E81]',
  EVIDENCE_READY: 'border-[#0D9488] bg-[#2DD4BF]/25 text-[#134E4A]',
  OUTCOME_RECEIVED: 'border-[#0D9488] bg-[#2DD4BF]/25 text-[#134E4A]',
  PENDING: 'border-[#F59E0B] bg-[#F59E0B]/25 text-[#78350F]',
  DLQ: 'border-[#F59E0B] bg-[#F59E0B]/25 text-[#78350F]',
  RECEIVED: 'border-slate-300 bg-slate-100 text-slate-700',
  REJECTED_PREACC: 'border-[#0F172A] bg-[#0F172A]/15 text-[#0F172A]',
  QUEUED_ACC: 'border-[#6366F1] bg-[#A5B4FC]/40 text-[#312E81]',
  RAW_STORED: 'border-slate-300 bg-slate-100 text-slate-700',
}

function getStatusStyle(status: string) {
  return statusStyles[status] || 'border-slate-300 bg-slate-100 text-slate-700'
}

function getReasonCodeStyle(reasonCode: string) {
  const code = reasonCode.toUpperCase()
  if (code.includes('TIMEOUT')) return 'border-[#F59E0B] bg-[#F59E0B]/25 text-[#78350F]'
  if (code.includes('DELIVERY') || code.includes('RATE_LIMIT')) return 'border-[#6366F1] bg-[#A5B4FC]/40 text-[#312E81]'
  if (code.includes('SIGNATURE') || code.includes('AUTH') || code.includes('CONFLICT')) return 'border-[#0F172A] bg-[#0F172A]/15 text-[#0F172A]'
  if (code.includes('MERKLE') || code.includes('MISMATCH')) return 'border-[#0D9488] bg-[#2DD4BF]/25 text-[#134E4A]'
  return 'border-slate-300 bg-slate-100 text-slate-700'
}

function parseDate(value?: string) {
  if (!value) return new Date(0)
  const direct = new Date(value)
  if (!Number.isNaN(direct.getTime())) return direct
  const withOffset = value.includes(' ') ? new Date(`${value.replace(' ', 'T')}+05:30`) : new Date(value)
  if (!Number.isNaN(withOffset.getTime())) return withOffset
  return new Date(0)
}

function formatDateTime(value?: string) {
  const date = parseDate(value)
  if (date.getTime() === 0) return '—'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function formatAmount(amount?: string | number, currency?: string) {
  const numericAmount = Number(amount)
  const normalizedCurrency = (currency || 'INR').toUpperCase()
  if (Number.isFinite(numericAmount)) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(numericAmount)
  }
  if (amount === undefined || amount === null || amount === '') return '—'
  return `${normalizedCurrency} ${amount}`
}

function normalizeEnvelopeId(value?: string) {
  if (!value) return 'env_unknown'
  if (value.toLowerCase().startsWith('env_')) return value
  const compact = value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  return `env_${compact.slice(0, 8) || 'unknown'}`
}

function normalizeIntentStatus(status?: string) {
  const normalized = (status || '').trim().toUpperCase()
  const alias: Record<string, string> = {
    RECEIVED: 'CANONICALIZED',
    QUEUED_ACC: 'READY_FOR_RELAY',
    REJECTED_PREACC: 'EXCEPTION',
  }
  return alias[normalized] || normalized || 'PENDING'
}

function deriveStage(status: string): IntentRow['stage'] {
  if (status.includes('EVIDENCE')) return 'Evidence'
  if (status.includes('RELAY') || status.includes('OUTCOME') || status.includes('QUEUED')) return 'Relay'
  if (status.includes('FUSED') || status.includes('CONFLICT') || status.includes('FAILED') || status.includes('FINAL')) return 'Fusion'
  return 'Canonical'
}

function toIntentRow(intent: ApiIntent): IntentRow {
  const intentId = intent.intent_id || `in_missing_${Math.random().toString(36).slice(2, 8)}`
  const normalizedStatus = normalizeIntentStatus(intent.status)
  const createdAt = formatDateTime(intent.created_at)
  return {
    kind: 'intents',
    rowId: intentId,
    intentId,
    envelopeId: intent.envelope_id || 'env_unknown',
    traceId: `tr_${intentId.slice(-6)}`,
    ...sourceForKey(intentId),
    stage: deriveStage(normalizedStatus),
    status: normalizedStatus,
    amount: formatAmount(intent.amount, intent.currency),
    confidence: Number(intent.confidence_score ?? 0.9),
    createdAt,
    createdAtDate: parseDate(createdAt),
    schema: intent.schema_version || intent.canonical_version || 'v3.2.0',
  }
}

function toDlqRow(item: ApiDLQ): DlqRow {
  const dlqId = item.dlq_id || `dlq_${Math.random().toString(36).slice(2, 8)}`
  const createdAt = formatDateTime(item.created_at)
  return {
    kind: 'dlq',
    rowId: dlqId,
    dlqId,
    envelopeId: normalizeEnvelopeId(item.envelope_id),
    ...sourceForKey(dlqId),
    stage: item.stage || 'Validation',
    reasonCode: item.reason_code || 'UNKNOWN',
    replayable: Boolean(item.replayable),
    createdAt,
    createdAtDate: parseDate(createdAt),
  }
}

function toEnvelopeRow(item: ApiEnvelope): EnvelopeRow {
  const envelopeId = item.envelope_id || `env_${Math.random().toString(36).slice(2, 8)}`
  const createdAt = formatDateTime(item.received_at)
  return {
    kind: 'envelopes',
    rowId: envelopeId,
    envelopeId,
    source: item.source || 'API',
    parseStatus: item.parse_status || 'UNKNOWN',
    signatureStatus: item.signature_status || 'UNKNOWN',
    tenantId: item.tenant_id || '—',
    payloadHash: item.sha256 || '—',
    createdAt,
    createdAtDate: parseDate(createdAt),
  }
}

function toContractRow(item: ApiContract): ContractRow {
  const contractId = item.contract_id || `ctr_${Math.random().toString(36).slice(2, 8)}`
  const createdAt = formatDateTime(item.created_at)
  return {
    kind: 'contracts',
    rowId: contractId,
    contractId,
    intentId: item.intent_id || '—',
    envelopeId: item.envelope_id || '—',
    status: (item.status || 'UNKNOWN').toUpperCase(),
    traceId: item.trace_id || `tr_${contractId.slice(-6)}`,
    tenantId: item.tenant_id || '—',
    createdAt,
    createdAtDate: parseDate(createdAt),
  }
}

function sourceLogoDimensions() {
  return {
    width: 112,
    height: 32,
    className: 'h-8 w-[112px] object-contain',
  }
}

function rowSearchText(row: JournalRow) {
  if (row.kind === 'intents') {
    return `${row.intentId} ${row.envelopeId} ${row.traceId} ${row.source} ${row.status} ${row.schema}`.toLowerCase()
  }
  if (row.kind === 'dlq') {
    return `${row.dlqId} ${row.envelopeId} ${row.source} ${row.stage} ${row.reasonCode}`.toLowerCase()
  }
  if (row.kind === 'envelopes') {
    return `${row.envelopeId} ${row.source} ${row.parseStatus} ${row.signatureStatus} ${row.tenantId} ${row.payloadHash}`.toLowerCase()
  }
  return `${row.contractId} ${row.intentId} ${row.envelopeId} ${row.status} ${row.traceId} ${row.tenantId}`.toLowerCase()
}

function CustomerTestIntentJournalContent() {
  const searchParams = useSearchParams()
  const tenantId = useSessionTenantId()
  const [tableType, setTableType] = useState<TableType>('intents')
  const [rows, setRows] = useState<JournalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [timeRange, setTimeRange] = useState('24h')
  const [statusFilter, setStatusFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [schemaFilter, setSchemaFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const rowsPerPage = 10

  const fetchPaged = useCallback(async <T,>(endpoint: string, tid: string) => {
    const pageSize = 200
    const maxPages = 5
    let currentPage = 1
    let total = 0
    const collected: T[] = []
    const tidTrim = tid.trim()
    if (!tidTrim) return collected

    while (currentPage <= maxPages) {
      const params = new URLSearchParams()
      params.set('page', String(currentPage))
      params.set('page_size', String(pageSize))
      params.set('tenant_id', tidTrim)

      const response = await fetch(`${endpoint}?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) break

      const data = (await response.json()) as ApiPagedResponse<T>
      const items = data.items || []
      collected.push(...items)

      total = Number(data.pagination?.total ?? collected.length)
      if (items.length === 0 || collected.length >= total) break
      currentPage += 1
    }

    return collected
  }, [])

  const loadTableData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setSelected([])
    setPage(1)

    try {
      if (tableType === 'intents') {
        const items = await fetchPaged<ApiIntent>('/api/prod/intents', tenantId)
        const mapped = items.map(toIntentRow).filter((row) => !EXCLUDED_INTENT_IDS.has(row.intentId))
        setRows(mapped)
        setLoadError(null)
      } else if (tableType === 'dlq') {
        const tid = tenantId.trim()
        const response = await fetch(
          tid ? `/api/prod/dlq?tenant_id=${encodeURIComponent(tid)}` : '/api/prod/dlq',
          { cache: 'no-store' },
        )
        if (!response.ok) {
          setRows([])
          setLoadError(null)
        } else {
          const data = (await response.json()) as ApiPagedResponse<ApiDLQ>
          const mapped = (data.items || []).map(toDlqRow)
          setRows(mapped)
          setLoadError(null)
        }
      } else if (tableType === 'envelopes') {
        const items = await fetchPaged<ApiEnvelope>('/api/prod/raw-envelopes', tenantId)
        setRows(items.map(toEnvelopeRow))
        setLoadError(null)
      } else {
        const response = await fetch('/api/prod/payout-contracts', { cache: 'no-store' })
        if (!response.ok) throw new Error(`Failed to load contracts (${response.status})`)
        const data = (await response.json()) as ApiPagedResponse<ApiContract>
        setRows((data.items || []).map(toContractRow))
        setLoadError(null)
      }
    } catch (error) {
      setRows([])
      setLoadError(error instanceof Error ? error.message : 'Unable to load backend data.')
    } finally {
      setLoading(false)
    }
  }, [fetchPaged, tableType, tenantId])

  useEffect(() => {
    void loadTableData()
  }, [loadTableData])

  useEffect(() => {
    const q = searchParams.get('q') ?? ''
    if (q) setQuery(q)
  }, [searchParams])

  useEffect(() => {
    setPage(1)
  }, [query, timeRange, statusFilter, stageFilter, schemaFilter, tableType])

  const referenceNow = useMemo(() => {
    if (rows.length === 0) return new Date()
    const timestamps = rows.map((row) => row.createdAtDate.getTime())
    return new Date(Math.max(...timestamps) + 2 * 60 * 60 * 1000)
  }, [rows])

  const availableSchemas = useMemo(() => {
    if (tableType !== 'intents') return []
    const intentRows = rows.filter((row): row is IntentRow => row.kind === 'intents')
    return Array.from(new Set(intentRows.map((row) => row.schema))).sort()
  }, [rows, tableType])

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const normalizedQuery = query.trim().toLowerCase()
      const matchQuery = normalizedQuery === '' || rowSearchText(row).includes(normalizedQuery)

      const ageInHours = (referenceNow.getTime() - row.createdAtDate.getTime()) / (1000 * 60 * 60)
      const matchTimeRange =
        timeRange === 'all' ||
        (timeRange === '24h' && ageInHours <= 24) ||
        (timeRange === '7d' && ageInHours <= 24 * 7) ||
        (timeRange === '30d' && ageInHours <= 24 * 30)

      const matchStatus = statusFilter === 'all' || (row.kind === 'intents' && row.status === statusFilter)
      const matchStage = stageFilter === 'all' || (row.kind === 'intents' && row.stage === stageFilter)
      const matchSchema = schemaFilter === 'all' || (row.kind === 'intents' && row.schema === schemaFilter)

      return matchQuery && matchTimeRange && matchStatus && matchStage && matchSchema
    })
  }, [rows, query, referenceNow, timeRange, statusFilter, stageFilter, schemaFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const paginated = useMemo(() => {
    const start = (page - 1) * rowsPerPage
    return filtered.slice(start, start + rowsPerPage)
  }, [filtered, page])

  const allCheckedOnPage = paginated.length > 0 && paginated.every((row) => selected.includes(row.rowId))

  const toggleSelectAllOnPage = () => {
    if (allCheckedOnPage) {
      setSelected((prev) => prev.filter((id) => !paginated.some((row) => row.rowId === id)))
      return
    }
    const next = new Set(selected)
    paginated.forEach((row) => next.add(row.rowId))
    setSelected(Array.from(next))
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const handleCreateReport = () => {
    const headersByType: Record<TableType, string[]> = {
      intents: ['intent_id', 'envelope_id', 'trace_id', 'source', 'stage', 'status', 'amount', 'confidence', 'created_at', 'schema'],
      dlq: ['dlq_id', 'envelope_id', 'source', 'stage', 'reason_code', 'replayable', 'created_at'],
      envelopes: ['envelope_id', 'source', 'parse_status', 'signature_status', 'tenant_id', 'hash', 'received_at'],
      contracts: ['contract_id', 'intent_id', 'envelope_id', 'status', 'trace_id', 'tenant_id', 'created_at'],
    }

    const rowValues = filtered.map((row) => {
      if (row.kind === 'intents') return [row.intentId, row.envelopeId, row.traceId, row.source, row.stage, row.status, row.amount, row.confidence.toFixed(2), row.createdAt, row.schema]
      if (row.kind === 'dlq') return [row.dlqId, row.envelopeId, row.source, row.stage, row.reasonCode, row.replayable ? 'yes' : 'no', row.createdAt]
      if (row.kind === 'envelopes') return [row.envelopeId, row.source, row.parseStatus, row.signatureStatus, row.tenantId, row.payloadHash, row.createdAt]
      return [row.contractId, row.intentId, row.envelopeId, row.status, row.traceId, row.tenantId, row.createdAt]
    })

    const csvRows = [
      headersByType[tableType].join(','),
      ...rowValues.map((values) => values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')),
    ]

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `journal-${tableType}-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="w-full p-6 lg:p-8">
      <main className="ct-main-panel mt-1 bg-gradient-to-b from-[#f9fbff] via-[#f7f8fa] to-[#f6f7fa] px-6 pb-7 pt-6">
        <div className="border-b border-gray-200/80 pb-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[34px] font-semibold tracking-tight text-gray-900">Intent Journal</h2>
            <div className="flex items-center gap-2">
              <select value={tableType} onChange={(event) => setTableType(event.target.value as TableType)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 outline-none">
                <option value="intents">Intent Table</option>
                <option value="dlq">DLQ Table</option>
                <option value="envelopes">Envelope Table</option>
                <option value="contracts">Contract Table</option>
              </select>
              <select value={timeRange} onChange={(event) => setTimeRange(event.target.value)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 outline-none">
                <option value="24h">Last 24h</option>
                <option value="7d">Last 7d</option>
                <option value="30d">Last 30d</option>
                <option value="all">All time</option>
              </select>
              <button onClick={loadTableData} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-50" disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
              <button onClick={handleCreateReport} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700">
                Create Report
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <div className="relative w-[360px]">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search intent_id, envelope_id, dlq_id, contract_id..."
                className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-400"
              />
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 outline-none">
              <option value="all">Status: All</option>
            </select>
            <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 outline-none">
              <option value="all">Stage: All</option>
            </select>
            <select value={schemaFilter} onChange={(event) => setSchemaFilter(event.target.value)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 outline-none">
              <option value="all">Schema: All</option>
              {tableType === 'intents'
                ? availableSchemas.map((schema) => (
                  <option key={schema} value={schema}>
                    {schema}
                  </option>
                ))
                : null}
            </select>
          </div>

          {loadError ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {loadError}
            </div>
          ) : null}
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <div className="ct-sidebar-scroll overflow-auto">
            <table className="min-w-[1220px] w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="w-[42px] px-3 py-3">
                    <input checked={allCheckedOnPage} onChange={toggleSelectAllOnPage} type="checkbox" className="h-4 w-4 rounded border-gray-300 text-violet-600" />
                  </th>
                  {tableType === 'intents' ? (
                    <>
                      <th className="px-4 py-3">Intent ID</th>
                      <th className="px-4 py-3">Envelope ID</th>
                      <th className="px-4 py-3">Trace ID</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Stage</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Confidence</th>
                      <th className="px-4 py-3">Created At</th>
                      <th className="px-4 py-3">Schema</th>
                    </>
                  ) : null}
                  {tableType === 'dlq' ? (
                    <>
                      <th className="px-4 py-3">DLQ ID</th>
                      <th className="px-4 py-3">Envelope ID</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Stage</th>
                      <th className="px-4 py-3">Reason Code</th>
                      <th className="px-4 py-3">Replayable</th>
                      <th className="px-4 py-3">Created At</th>
                    </>
                  ) : null}
                  {tableType === 'envelopes' ? (
                    <>
                      <th className="px-4 py-3">Envelope ID</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Parse Status</th>
                      <th className="px-4 py-3">Signature</th>
                      <th className="px-4 py-3">Tenant</th>
                      <th className="px-4 py-3">Hash</th>
                      <th className="px-4 py-3">Received At</th>
                    </>
                  ) : null}
                  {tableType === 'contracts' ? (
                    <>
                      <th className="px-4 py-3">Contract ID</th>
                      <th className="px-4 py-3">Intent ID</th>
                      <th className="px-4 py-3">Envelope ID</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Trace ID</th>
                      <th className="px-4 py-3">Tenant</th>
                      <th className="px-4 py-3">Created At</th>
                    </>
                  ) : null}
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-gray-500" colSpan={12}>
                      Loading {tableType} from backend…
                    </td>
                  </tr>
                ) : paginated.length ? (
                  paginated.map((row) => (
                    <tr key={row.rowId} className="border-t border-gray-100 hover:bg-gray-50/70">
                      <td className="px-3 py-3">
                        <input checked={selected.includes(row.rowId)} onChange={() => toggleSelect(row.rowId)} type="checkbox" className="h-4 w-4 rounded border-gray-300 text-violet-600" />
                      </td>
                      {row.kind === 'intents' ? (
                        <>
                          <td className="px-4 py-3 font-medium text-gray-900">{row.intentId}</td>
                          <td className="px-4 py-3 text-gray-600">{row.envelopeId}</td>
                          <td className="px-4 py-3 text-gray-600">{row.traceId}</td>
                          <td className="px-4 py-3">
                            <div className="inline-flex h-12 min-w-[116px] items-center justify-center rounded-md border border-gray-200 bg-white px-2">
                              <Image
                                src={row.sourceLogo}
                                alt={row.source}
                                width={sourceLogoDimensions().width}
                                height={sourceLogoDimensions().height}
                                className={sourceLogoDimensions().className}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{row.stage}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${getStatusStyle(row.status)}`}>{row.status}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{row.amount}</td>
                          <td className="px-4 py-3 text-gray-700">{row.confidence.toFixed(2)}</td>
                          <td className="px-4 py-3 text-gray-600">{row.createdAt}</td>
                          <td className="px-4 py-3 text-gray-600">{row.schema}</td>
                        </>
                      ) : null}
                      {row.kind === 'dlq' ? (
                        <>
                          <td className="px-4 py-3 font-medium text-gray-900">{row.dlqId}</td>
                          <td className="px-4 py-3 text-gray-600">{row.envelopeId}</td>
                          <td className="px-4 py-3">
                            <div className="inline-flex h-12 min-w-[116px] items-center justify-center rounded-md border border-gray-200 bg-white px-2">
                              <Image
                                src={row.sourceLogo}
                                alt={row.source}
                                width={sourceLogoDimensions().width}
                                height={sourceLogoDimensions().height}
                                className={sourceLogoDimensions().className}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{row.stage}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${getReasonCodeStyle(row.reasonCode)}`}>
                              {row.reasonCode}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{row.replayable ? 'Yes' : 'No'}</td>
                          <td className="px-4 py-3 text-gray-600">{row.createdAt}</td>
                        </>
                      ) : null}
                      {row.kind === 'envelopes' ? (
                        <>
                          <td className="px-4 py-3 font-medium text-gray-900">{row.envelopeId}</td>
                          <td className="px-4 py-3 text-gray-700">{row.source}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${getStatusStyle(row.parseStatus.toUpperCase())}`}>{row.parseStatus}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${getStatusStyle(row.signatureStatus.toUpperCase())}`}>{row.signatureStatus}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{row.tenantId}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.payloadHash.slice(0, 18)}{row.payloadHash.length > 18 ? '…' : ''}</td>
                          <td className="px-4 py-3 text-gray-600">{row.createdAt}</td>
                        </>
                      ) : null}
                      {row.kind === 'contracts' ? (
                        <>
                          <td className="px-4 py-3 font-medium text-gray-900">{row.contractId}</td>
                          <td className="px-4 py-3 text-gray-700">{row.intentId}</td>
                          <td className="px-4 py-3 text-gray-700">{row.envelopeId}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${getStatusStyle(row.status)}`}>{row.status}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{row.traceId}</td>
                          <td className="px-4 py-3 text-gray-700">{row.tenantId}</td>
                          <td className="px-4 py-3 text-gray-600">{row.createdAt}</td>
                        </>
                      ) : null}
                      <td className="px-4 py-3 text-right">
                        <button className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">View</button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-6 text-sm text-gray-500" colSpan={12}>
                      No records found for selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/80 px-4 py-3 text-xs text-gray-600">
            <div>Rows per page: 10</div>
            <div className="flex items-center gap-4">
              <span>
                {filtered.length === 0 ? '0-0' : `${(page - 1) * rowsPerPage + 1}-${Math.min(page * rowsPerPage, filtered.length)}`} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="rounded-md border border-gray-200 bg-white px-2 py-1 disabled:opacity-40">
                  ‹
                </button>
                <button onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages} className="rounded-md border border-gray-200 bg-white px-2 py-1 disabled:opacity-40">
                  ›
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className="mx-auto mt-24 max-w-md rounded-2xl border border-white/60 bg-white/70 p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.08)] lg:hidden">
        <p className="text-base font-semibold text-gray-800">Desktop View Recommended</p>
      </div>
    </div>
  )
}

export default function CustomerTestIntentJournalPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full p-6 lg:p-8">
          <main className="ct-main-panel mt-1 bg-gradient-to-b from-[#f9fbff] via-[#f7f8fa] to-[#f6f7fa] px-6 pb-7 pt-6">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-sm text-gray-600">Loading intent journal...</div>
          </main>
        </div>
      }
    >
      <CustomerTestIntentJournalContent />
    </Suspense>
  )
}
