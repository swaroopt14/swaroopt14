'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type EventNodeStatus = 'success' | 'delayed' | 'failed' | 'retry' | 'skipped' | 'warning' | 'in_progress' | 'pending'
type EventLaneId = 'ingestion' | 'validation' | 'canonical' | 'outbox' | 'ops'
type TimeRangePreset = '5m' | '15m' | '1h' | '6h' | '24h'

type WorkflowOption = {
  id: string
  label: string
  traceId: string
  intentId: string
  envelopeId: string
  contractId: string
  ruleVersion: string
  environment: 'sandbox'
  contextTag: string
  inputOrigin: 'Client' | 'System' | 'Replay Engine'
  issueType: 'workflow anomaly' | 'finality replay'
  status: 'active' | 'running' | 'delayed' | 'degraded'
  description: string
}

type ScenarioNode = {
  name: string
  laneId: EventLaneId
  status: EventNodeStatus
  offsetMs: number
  durationMs?: number
  statePoint: 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'FUSION' | 'EVIDENCE' | 'OPS'
  confidence?: number
  details: Record<string, unknown>
  error?: { code: string; message: string; recovery?: string }
}

type EventNode = {
  id: string
  workflowId: string
  laneId: EventLaneId
  name: string
  status: EventNodeStatus
  timestampMs: number
  durationMs?: number
  confidence?: number
  details: Record<string, unknown>
  dependsOn?: string[]
  error?: { code: string; message: string; recovery?: string }
}

const STATUS_CONFIG: Record<
  EventNodeStatus,
  { label: string; color: string; bg: string; confidence: number; icon: 'check' | 'warn' | 'x' | 'clock' | 'retry' | 'minus' }
> = {
  success: { label: 'Success', color: '#0D9488', bg: 'rgba(45,212,191,0.24)', confidence: 96, icon: 'check' },
  delayed: { label: 'Delayed', color: '#F59E0B', bg: 'rgba(245,158,11,0.24)', confidence: 62, icon: 'clock' },
  failed: { label: 'Failed', color: '#DC2626', bg: 'rgba(239,68,68,0.24)', confidence: 10, icon: 'x' },
  retry: { label: 'Retry', color: '#6366F1', bg: 'rgba(165,180,252,0.34)', confidence: 55, icon: 'retry' },
  skipped: { label: 'Skipped', color: '#64748B', bg: 'rgba(148,163,184,0.26)', confidence: 0, icon: 'minus' },
  warning: { label: 'Warning', color: '#EA580C', bg: 'rgba(251,146,60,0.24)', confidence: 72, icon: 'warn' },
  in_progress: { label: 'In Progress', color: '#2563EB', bg: 'rgba(96,165,250,0.24)', confidence: 50, icon: 'clock' },
  pending: { label: 'Pending', color: '#64748B', bg: 'rgba(148,163,184,0.26)', confidence: 40, icon: 'clock' },
}

const LANE_CONFIG: Record<EventLaneId, { label: string; color: string }> = {
  ingestion: { label: 'Ingress', color: '#6366F1' },
  validation: { label: 'Validation', color: '#0EA5E9' },
  canonical: { label: 'Canonical', color: '#0D9488' },
  outbox: { label: 'Outbox', color: '#F59E0B' },
  ops: { label: 'Ops / Alerts', color: '#DC2626' },
}

const TIME_PRESETS: { value: TimeRangePreset; label: string; ms: number }[] = [
  { value: '5m', label: '5m', ms: 5 * 60 * 1000 },
  { value: '15m', label: '15m', ms: 15 * 60 * 1000 },
  { value: '1h', label: '1h', ms: 60 * 60 * 1000 },
  { value: '6h', label: '6h', ms: 6 * 60 * 60 * 1000 },
  { value: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
]

const WORKFLOWS: WorkflowOption[] = [
  {
    id: 'wf_onboarding_live',
    label: 'User Onboarding',
    traceId: 'tr_01J3Z0RD7QAYNC6T0M9SZC3T9V',
    intentId: 'int_onb_00091',
    envelopeId: 'env_onb_00091',
    contractId: 'ctr_user_onboarding',
    ruleVersion: 'v2.1',
    environment: 'sandbox',
    contextTag: 'ops pending',
    inputOrigin: 'Client',
    issueType: 'workflow anomaly',
    status: 'degraded',
    description: 'Live-style view: confidence drops at outbox and remains pending at notify.',
  },
  {
    id: 'wf_fusion_current_v21',
    label: 'Intent Fusion (Current v2.1)',
    traceId: 'trace_uvw321',
    intentId: 'int_xyz789',
    envelopeId: 'env_abc123',
    contractId: 'ctr_def456',
    ruleVersion: 'v2.1',
    environment: 'sandbox',
    contextTag: 'current decision',
    inputOrigin: 'System',
    issueType: 'workflow anomaly',
    status: 'running',
    description: 'State points mapped from walkthrough: S0/S1 + S2/S3/S4 fusion path.',
  },
  {
    id: 'wf_fusion_replay_v22',
    label: 'Intent Fusion (Replay v2.2)',
    traceId: 'trace_uvw321',
    intentId: 'int_xyz789',
    envelopeId: 'env_abc123',
    contractId: 'ctr_def456',
    ruleVersion: 'v2.2 (replay)',
    environment: 'sandbox',
    contextTag: 'replay comparison',
    inputOrigin: 'Replay Engine',
    issueType: 'finality replay',
    status: 'active',
    description: 'Replay run with higher poll confidence and earlier deterministic finality.',
  },
]

const BASE_TS = new Date('2026-03-04T09:00:00Z').getTime()

const SCENARIO_NODES: Record<string, ScenarioNode[]> = {
  wf_onboarding_live: [
    {
      name: 'INGRESS',
      laneId: 'ingestion',
      status: 'success',
      offsetMs: 0,
      durationMs: 900,
      statePoint: 'S0',
      confidence: 94,
      details: { step: 'INGRESS', ack_mode: 'DURABLE_ACK', source: 'Client API' },
    },
    {
      name: 'VALIDATE',
      laneId: 'validation',
      status: 'success',
      offsetMs: 68_000,
      durationMs: 2400,
      statePoint: 'S1',
      confidence: 94,
      details: { step: 'VALIDATE', schema: 'intent.request.v1', result: 'PASSED' },
    },
    {
      name: 'CANONICALIZE',
      laneId: 'canonical',
      status: 'success',
      offsetMs: 140_000,
      durationMs: 5200,
      statePoint: 'S1',
      confidence: 94,
      details: { step: 'CANONICALIZE', intent_id: 'int_onb_00091', pii: 'tokenized' },
    },
    {
      name: 'OUTBOX',
      laneId: 'outbox',
      status: 'warning',
      offsetMs: 280_000,
      durationMs: 12_000,
      statePoint: 'S1',
      confidence: 72,
      details: { step: 'OUTBOX', dispatch_id: 'disp_onb_0091', topic: 'z.intent.ready.v1', expected_duration_s: 12, actual_duration_s: 19 },
      error: {
        code: 'SLA_BREACH_RISK',
        message: 'Outbox publish slower than expected',
        recovery: 'Backoff retry scheduled',
      },
    },
    {
      name: 'VERIFY',
      laneId: 'ops',
      status: 'in_progress',
      offsetMs: 430_000,
      durationMs: 0,
      statePoint: 'S2',
      confidence: 50,
      details: { step: 'VERIFY', checks_pending: 2, webhook_state: 'partial' },
    },
    {
      name: 'NOTIFY',
      laneId: 'ops',
      status: 'pending',
      offsetMs: 540_000,
      durationMs: 0,
      statePoint: 'OPS',
      confidence: 40,
      details: { step: 'NOTIFY', reason: 'Awaiting terminal verification signal' },
    },
  ],
  wf_fusion_current_v21: [
    {
      name: 'RAW_INGEST',
      laneId: 'ingestion',
      status: 'success',
      offsetMs: 0,
      durationMs: 1100,
      statePoint: 'S0',
      confidence: 96,
      details: { envelope_id: 'env_abc123', ack: '202 Accepted', immutability: 'confirmed' },
    },
    {
      name: 'CANONICALIZE',
      laneId: 'validation',
      status: 'success',
      offsetMs: 42_000,
      durationMs: 3100,
      statePoint: 'S1',
      confidence: 96,
      details: { intent_id: 'int_xyz789', schema_version: 'canonical.v1.2' },
    },
    {
      name: 'TOKENIZE',
      laneId: 'canonical',
      status: 'success',
      offsetMs: 83_000,
      durationMs: 2500,
      statePoint: 'S1',
      confidence: 95,
      details: { pii_handling: 'tokenized', token_policy: 'pii_tokenization_policy' },
    },
    {
      name: 'DISPATCH_CREATED',
      laneId: 'outbox',
      status: 'success',
      offsetMs: 125_000,
      durationMs: 4200,
      statePoint: 'S1',
      confidence: 95,
      details: { dispatch_id: 'disp_789xyz', carrier_l1: 'reference_id', carrier_l2: 'narration' },
    },
    {
      name: 'WEBHOOK_S2',
      laneId: 'outbox',
      status: 'success',
      offsetMs: 190_000,
      durationMs: 2900,
      statePoint: 'S2',
      confidence: 100,
      details: { event_id: 'evt_888', provider_status: 'SUCCESS', utr: 'hash(SBIN123456789)' },
    },
    {
      name: 'POLL_S3',
      laneId: 'ops',
      status: 'delayed',
      offsetMs: 255_000,
      durationMs: 5000,
      statePoint: 'S3',
      confidence: 80,
      details: { event_id: 'evt_889', corroboration: 'pull signal', confidence: 0.8 },
    },
    {
      name: 'STATEMENT_S4',
      laneId: 'ops',
      status: 'success',
      offsetMs: 320_000,
      durationMs: 5300,
      statePoint: 'S4',
      confidence: 100,
      details: { event_id: 'evt_890', source: 'statement ground truth', utr_match: true },
    },
    {
      name: 'FUSION_FINALITY',
      laneId: 'canonical',
      status: 'success',
      offsetMs: 352_000,
      durationMs: 2600,
      statePoint: 'FUSION',
      confidence: 100,
      details: { final_state: 'SUCCESS', hierarchy: 'S4 > S2 > S3', rule: 'r1_utr_wins' },
    },
    {
      name: 'CERTIFICATE',
      laneId: 'canonical',
      status: 'success',
      offsetMs: 370_000,
      durationMs: 1200,
      statePoint: 'EVIDENCE',
      confidence: 100,
      details: { certificate_id: 'cert_123', signature: 'valid', pack: 'evidence_ready' },
    },
  ],
  wf_fusion_replay_v22: [
    {
      name: 'RAW_INGEST',
      laneId: 'ingestion',
      status: 'success',
      offsetMs: 0,
      durationMs: 1000,
      statePoint: 'S0',
      confidence: 96,
      details: { envelope_id: 'env_abc123', mode: 'replay', immutability: 'read-only' },
    },
    {
      name: 'CANONICALIZE',
      laneId: 'validation',
      status: 'success',
      offsetMs: 40_000,
      durationMs: 2800,
      statePoint: 'S1',
      confidence: 96,
      details: { intent_id: 'int_xyz789', schema_version: 'canonical.v1.2' },
    },
    {
      name: 'TOKENIZE',
      laneId: 'canonical',
      status: 'success',
      offsetMs: 80_000,
      durationMs: 2200,
      statePoint: 'S1',
      confidence: 95,
      details: { pii_handling: 'tokenized', policy: 'pii_tokenization_policy' },
    },
    {
      name: 'DISPATCH_CREATED',
      laneId: 'outbox',
      status: 'success',
      offsetMs: 119_000,
      durationMs: 3700,
      statePoint: 'S1',
      confidence: 95,
      details: { dispatch_id: 'disp_789xyz', replay: true },
    },
    {
      name: 'WEBHOOK_S2',
      laneId: 'outbox',
      status: 'success',
      offsetMs: 178_000,
      durationMs: 2100,
      statePoint: 'S2',
      confidence: 100,
      details: { event_id: 'evt_888', provider_status: 'SUCCESS', utr: 'hash(SBIN123456789)' },
    },
    {
      name: 'POLL_S3',
      laneId: 'ops',
      status: 'success',
      offsetMs: 221_000,
      durationMs: 2600,
      statePoint: 'S3',
      confidence: 92,
      details: { event_id: 'evt_889', confidence: 0.92, ruleset: 'utr_weight_boost_v2_2' },
    },
    {
      name: 'STATEMENT_S4',
      laneId: 'ops',
      status: 'success',
      offsetMs: 260_000,
      durationMs: 3900,
      statePoint: 'S4',
      confidence: 100,
      details: { event_id: 'evt_890', statement_match: true, priority: 'highest_truth' },
    },
    {
      name: 'FUSION_FINALITY',
      laneId: 'canonical',
      status: 'success',
      offsetMs: 282_000,
      durationMs: 2300,
      statePoint: 'FUSION',
      confidence: 100,
      details: { final_state: 'SUCCESS', finality_time_delta_min: -30, ruleset: 'v2.2' },
    },
    {
      name: 'CERTIFICATE',
      laneId: 'canonical',
      status: 'success',
      offsetMs: 298_000,
      durationMs: 900,
      statePoint: 'EVIDENCE',
      confidence: 100,
      details: { certificate_id: 'cert_123_replay', signature: 'valid', mutates_original: false },
    },
  ],
}

function buildWorkflowEvents(workflowId: string): EventNode[] {
  const nodes = SCENARIO_NODES[workflowId] ?? []
  return nodes.map((node, index) => ({
    id: `${workflowId}_n${index + 1}`,
    workflowId,
    laneId: node.laneId,
    name: node.name,
    status: node.status,
    timestampMs: BASE_TS + node.offsetMs,
    durationMs: node.durationMs,
    confidence: node.confidence,
    details: {
      ...node.details,
      state_point: node.statePoint,
    },
    dependsOn: index === 0 ? undefined : [`${workflowId}_n${index}`],
    error: node.error,
  }))
}

function formatTimeLabel(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function getConfidence(node: EventNode): number {
  if (typeof node.confidence === 'number') {
    return Math.max(0, Math.min(100, node.confidence))
  }
  return STATUS_CONFIG[node.status]?.confidence ?? 50
}

function statusDotClass(status: WorkflowOption['status']): string {
  if (status === 'delayed' || status === 'degraded') return 'bg-amber-500'
  if (status === 'running' || status === 'active') return 'bg-emerald-500'
  return 'bg-slate-400'
}

function workflowStatusChip(status: WorkflowOption['status']): string {
  if (status === 'active') return 'border-[#0D9488] bg-[#2DD4BF]/25 text-[#134E4A]'
  if (status === 'running') return 'border-[#6366F1] bg-[#A5B4FC]/40 text-[#312E81]'
  if (status === 'delayed') return 'border-[#F59E0B] bg-[#F59E0B]/25 text-[#78350F]'
  return 'border-[#DC2626] bg-[#FCA5A5]/30 text-[#7F1D1D]'
}

function MiniIcon({ kind }: { kind: 'check' | 'warn' | 'x' | 'clock' | 'retry' | 'minus' }) {
  const common = { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 2 }
  if (kind === 'check') {
    return (
      <svg {...common} className="h-3.5 w-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
      </svg>
    )
  }
  if (kind === 'warn') {
    return (
      <svg {...common} className="h-3.5 w-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.1 14.04A2 2 0 004 21h16a2 2 0 001.81-3.1l-8.1-14.04a2 2 0 00-3.42 0z" />
      </svg>
    )
  }
  if (kind === 'x') {
    return (
      <svg {...common} className="h-3.5 w-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    )
  }
  if (kind === 'retry') {
    return (
      <svg {...common} className="h-3.5 w-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5M20 8a8 8 0 10-2.34 5.66" />
      </svg>
    )
  }
  if (kind === 'minus') {
    return (
      <svg {...common} className="h-3.5 w-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
      </svg>
    )
  }
  return (
    <svg {...common} className="h-3.5 w-3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
    </svg>
  )
}

function Donut({ value, color }: { value: number; color: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div
      className="flex h-14 w-14 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(${color} ${v}%, rgba(148,163,184,0.25) 0)`,
      }}
    >
      <div className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-white">
        <span className="text-sm font-bold tabular-nums" style={{ color }}>
          {v}
        </span>
      </div>
    </div>
  )
}

function TimelineCanvas({
  nodes,
  visibleLanes,
  zoom,
  selectedNodeId,
  onSelect,
  startTime,
  endTime,
}: {
  nodes: EventNode[]
  visibleLanes: Set<EventLaneId>
  zoom: number
  selectedNodeId: string | null
  onSelect: (nodeId: string | null) => void
  startTime: number
  endTime: number
}) {
  const visibleNodes = useMemo(() => nodes.filter((n) => visibleLanes.has(n.laneId)), [nodes, visibleLanes])
  const sorted = useMemo(() => [...visibleNodes].sort((a, b) => a.timestampMs - b.timestampMs), [visibleNodes])
  const totalMs = Math.max(1, endTime - startTime)

  const PAD_X = 2
  const PAD_TOP = 6
  const PAD_BOTTOM = 6

  const toX = (ts: number) => PAD_X + ((ts - startTime) / totalMs) * (100 - PAD_X * 2)
  const toY = (conf: number) => PAD_TOP + ((100 - conf) / 100) * (100 - PAD_TOP - PAD_BOTTOM)

  const GRID_COLS = 8

  const linePoints = sorted.length < 2 ? '' : sorted.map((node) => `${toX(node.timestampMs)},${toY(getConfidence(node))}`).join(' ')

  const fillPoints = (() => {
    if (sorted.length < 2) return ''
    const first = toX(sorted[0].timestampMs)
    const last = toX(sorted[sorted.length - 1].timestampMs)
    const bottom = PAD_TOP + (100 - PAD_TOP - PAD_BOTTOM)
    return `${first},${bottom} ${linePoints} ${last},${bottom}`
  })()

  return (
    <div className="flex h-full flex-col" style={{ minWidth: `${zoom}%` }}>
      <div className="flex items-center justify-between border-b border-gray-200/70 bg-gradient-to-r from-slate-100/80 to-slate-50/70 px-5 py-3">
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm font-semibold text-slate-700">Confidence</span>
          <span className="rounded bg-slate-200/80 px-2 py-0.5 font-mono text-xs text-cx-neutral">UTC</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-cx-neutral">
          <span className="font-mono tabular-nums">{formatTimeLabel(startTime)}</span>
          <span className="text-slate-400">→</span>
          <span className="font-mono tabular-nums">{formatTimeLabel(endTime)}</span>
          <span className="ml-2 text-cx-neutral">({Math.round((endTime - startTime) / 60000)}m)</span>
        </div>
      </div>

      <div className="flex flex-1">
        <div className="flex w-14 flex-col justify-between border-r border-gray-100 bg-slate-50/50 py-4 pr-2 text-right">
          {[100, 75, 50, 25, 0].map((value) => (
            <span key={value} className="font-mono text-[10px] tabular-nums text-cx-neutral">
              {value}%
            </span>
          ))}
        </div>

        <div className="relative flex-1 overflow-hidden">
          <div className="absolute inset-0 flex flex-col">
            <div className="flex-[30] bg-gradient-to-b from-indigo-100/45 to-transparent" />
            <div className="flex-[20] bg-gradient-to-b from-transparent to-sky-100/30" />
            <div className="flex-[20] bg-gradient-to-b from-sky-100/30 to-teal-100/25" />
            <div className="flex-[30] bg-gradient-to-b from-amber-100/25 to-rose-100/30" />
          </div>

          <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
            {Array.from({ length: 6 }).map((_, index) => (
              <line
                key={`h-${index}`}
                x1="0"
                y1={`${(index / 5) * 100}%`}
                x2="100%"
                y2={`${(index / 5) * 100}%`}
                stroke="#e2e8f0"
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
                strokeDasharray={index === 0 || index === 5 ? '0' : '4 4'}
              />
            ))}
            {Array.from({ length: GRID_COLS + 1 }).map((_, index) => (
              <line
                key={`v-${index}`}
                x1={`${(index / GRID_COLS) * 100}%`}
                y1="0"
                x2={`${(index / GRID_COLS) * 100}%`}
                y2="100%"
                stroke="#e2e8f0"
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
                strokeDasharray="4 4"
              />
            ))}
          </svg>

          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="confidence-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(99, 102, 241, 0.24)" />
                <stop offset="100%" stopColor="rgba(99, 102, 241, 0)" />
              </linearGradient>
              <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366F1" />
                <stop offset="50%" stopColor="#0D9488" />
                <stop offset="100%" stopColor="#F59E0B" />
              </linearGradient>
            </defs>
            {fillPoints ? <polygon fill="url(#confidence-gradient)" points={fillPoints} /> : null}
            {linePoints ? (
              <polyline
                fill="none"
                stroke="url(#line-gradient)"
                strokeWidth="0.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={linePoints}
              />
            ) : null}
          </svg>

          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {visibleNodes
              .filter((node) => (node.dependsOn || []).length > 0)
              .flatMap((node) =>
                (node.dependsOn || []).map((dependencyId) => {
                  const dependency = visibleNodes.find((candidate) => candidate.id === dependencyId)
                  if (!dependency) return null
                  const x1 = toX(dependency.timestampMs)
                  const y1 = toY(getConfidence(dependency))
                  const x2 = toX(node.timestampMs)
                  const y2 = toY(getConfidence(node))
                  return (
                    <line
                      key={`${dependencyId}-${node.id}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#cbd5e1"
                      strokeWidth="0.3"
                      strokeDasharray="2 2"
                      vectorEffect="non-scaling-stroke"
                    />
                  )
                })
              )}
          </svg>

          {visibleNodes.map((node) => {
            const leftPercent = toX(node.timestampMs)
            const confidence = getConfidence(node)
            const topPercent = toY(confidence)
            const isSelected = selectedNodeId === node.id
            const statusConfig = STATUS_CONFIG[node.status]
            const laneConfig = LANE_CONFIG[node.laneId]
            return (
              <div
                key={node.id}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${leftPercent}%`, top: `${topPercent}%` }}
              >
                <button
                  onClick={() => onSelect(isSelected ? null : node.id)}
                  className={`group flex flex-col items-center gap-1 transition-all duration-200 focus:outline-none ${
                    isSelected ? 'z-20 scale-125' : 'hover:scale-110'
                  }`}
                  title={`${node.name} — ${statusConfig.label} (${confidence}%)`}
                >
                  <div
                    className={`relative flex items-center justify-center text-white shadow-lg transition-transform ${
                      isSelected ? 'h-8 w-8 rounded-xl' : 'h-6 w-6 rounded-lg'
                    }`}
                    style={{
                      backgroundColor: statusConfig.color,
                      boxShadow: isSelected ? `0 0 16px ${statusConfig.color}60` : undefined,
                    }}
                  >
                    <MiniIcon kind={statusConfig.icon} />
                    <div className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-white" style={{ backgroundColor: laneConfig.color }} />
                  </div>
                  <span
                    className={`max-w-[90px] truncate text-center text-[9px] font-semibold transition-opacity ${
                      isSelected ? 'text-cx-text opacity-100' : 'text-cx-neutral opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {node.name}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex border-t border-gray-100 bg-slate-50/50">
        <div className="w-14" />
        <div className="flex flex-1 justify-between px-2 py-2">
          {Array.from({ length: GRID_COLS + 1 }).map((_, index) => {
            const tickMs = startTime + (totalMs / GRID_COLS) * index
            return (
              <span key={index} className="font-mono text-[10px] tabular-nums text-cx-neutral">
                {formatTimeLabel(tickMs)}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function EventDetailsPanel({ node }: { node: EventNode | null }) {
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
          <div className="h-8 w-8 rounded-full border-2 border-dashed border-slate-300" />
        </div>
        <p className="max-w-[240px] text-sm text-cx-neutral">No event selected. Click a node on the timeline to view details.</p>
      </div>
    )
  }

  const statusConfig = STATUS_CONFIG[node.status]
  const laneConfig = LANE_CONFIG[node.laneId]
  const confidence = getConfidence(node)
  const confidenceColor = confidence >= 80 ? '#10b981' : confidence >= 50 ? '#f59e0b' : '#ef4444'
  const statePoint = typeof node.details.state_point === 'string' ? node.details.state_point : 'N/A'

  const what = `${laneConfig.label}: ${node.name} is ${statusConfig.label.toLowerCase()}.${node.durationMs ? ` Duration ${(node.durationMs / 1000).toFixed(1)}s.` : ''}`
  const how = node.error?.message ? `Error: ${node.error.message}` : 'Source/actor context not available for this event.'

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 p-5">
        <div className="ct-frost-chip rounded-xl border border-white/70 bg-white/70 p-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">What Happened</div>
          <p className="text-sm text-cx-text">{what}</p>
          <div className="mb-2 mt-3 text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">How It Happened</div>
          <p className="text-xs text-slate-600">{how}</p>
        </div>

        <div className="space-y-4 rounded-xl border border-white/70 bg-gradient-to-br from-slate-50/80 to-white/75 p-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Event</div>
            <div className="mt-0.5 text-base font-semibold text-cx-text">{node.name}</div>
            <code className="text-[10px] text-cx-neutral">{node.id}</code>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Status</div>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${statusConfig.color}15`, color: statusConfig.color }}>
                <MiniIcon kind={statusConfig.icon} />
                {statusConfig.label}
              </span>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Lane</div>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${laneConfig.color}15`, color: laneConfig.color }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: laneConfig.color }} />
                {laneConfig.label}
              </span>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Confidence</div>
            <div className="flex items-center gap-3">
              <Donut value={confidence} color={confidenceColor} />
              <div>
                <div className="text-2xl font-bold tabular-nums" style={{ color: confidenceColor }}>
                  {confidence}%
                </div>
                <div className="text-[11px] text-cx-neutral">Derived from deterministic status mapping</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-[10px] text-cx-neutral">Timestamp (UTC)</div>
              <div className="mt-0.5 text-xs font-mono font-semibold text-cx-text">{formatTimeLabel(node.timestampMs)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-[10px] text-cx-neutral">Duration</div>
              <div className="mt-0.5 text-xs font-mono font-semibold text-cx-text">{node.durationMs ? `${node.durationMs}ms` : '-'}</div>
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-[10px] text-cx-neutral">State Point</div>
            <div className="mt-0.5 text-xs font-mono font-semibold text-cx-text">{statePoint}</div>
          </div>
        </div>

        <div className="rounded-xl border border-white/70 bg-white/70 p-4">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Context</div>
          <pre className="max-h-72 overflow-auto rounded-lg border border-gray-100 bg-slate-50 p-3 font-mono text-[11px] text-cx-text">{safeJson(node.details)}</pre>
        </div>

        {node.error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-rose-700">Error — {node.error.code}</div>
            <p className="text-xs text-rose-700">{node.error.message}</p>
            {node.error.recovery ? <p className="mt-2 text-xs text-rose-600">Recovery: {node.error.recovery}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function EventGraphLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-cx-neutral">Status</span>
      {(['success', 'delayed', 'failed', 'retry', 'warning', 'in_progress', 'pending'] as EventNodeStatus[]).map((status) => {
        const config = STATUS_CONFIG[status]
        return (
          <div key={status} className="flex items-center gap-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-md text-white" style={{ backgroundColor: config.color }}>
              <MiniIcon kind={config.icon} />
            </div>
            <span className="text-[11px] text-cx-neutral">{config.label}</span>
          </div>
        )
      })}
      <div className="mx-2 h-4 w-px bg-gray-200" />
      <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-cx-neutral">Lanes</span>
      {(Object.entries(LANE_CONFIG) as [EventLaneId, (typeof LANE_CONFIG)[EventLaneId]][]).map(([laneId, laneConfig]) => (
        <div key={laneId} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: laneConfig.color }} />
          <span className="text-[11px] text-cx-neutral">{laneConfig.label}</span>
        </div>
      ))}
    </div>
  )
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([safeJson(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function CustomerTestWorkflowTimelinePage() {
  const laneIds = useMemo(() => Object.keys(LANE_CONFIG) as EventLaneId[], [])
  const allLanes = useMemo(() => new Set(laneIds), [laneIds])

  const [selectedWorkflowId, setSelectedWorkflowId] = useState(WORKFLOWS[0].id)
  const [showGraph, setShowGraph] = useState(false)
  const [timeRange, setTimeRange] = useState<TimeRangePreset>('15m')
  const [zoom, setZoom] = useState(100)
  const [visibleLanes, setVisibleLanes] = useState<Set<EventLaneId>>(allLanes)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [showLaneDropdown, setShowLaneDropdown] = useState(false)
  const [clock, setClock] = useState(() => BASE_TS + 10 * 60 * 1000)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!dropdownRef.current) return
      if (!dropdownRef.current.contains(event.target as Node)) setShowLaneDropdown(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const selectedWorkflow = useMemo(() => WORKFLOWS.find((workflow) => workflow.id === selectedWorkflowId) ?? WORKFLOWS[0], [selectedWorkflowId])

  const workflowNodesBase = useMemo(() => buildWorkflowEvents(selectedWorkflow.id).sort((a, b) => a.timestampMs - b.timestampMs), [selectedWorkflow.id])

  const [baseStart, baseEnd] = useMemo(() => {
    if (!workflowNodesBase.length) return [BASE_TS, BASE_TS + 1]
    return [workflowNodesBase[0].timestampMs, workflowNodesBase[workflowNodesBase.length - 1].timestampMs]
  }, [workflowNodesBase])

  const shiftMs = useMemo(() => clock - baseEnd, [clock, baseEnd])

  const workflowNodesAll = useMemo(() => {
    if (!workflowNodesBase.length) return []
    const phase = Math.floor(clock / 3000) % 4
    return workflowNodesBase.map((node) => {
      const shiftedTimestamp = node.timestampMs + shiftMs
      if (node.status === 'in_progress') {
        const nextStatus: EventNodeStatus = phase >= 2 ? 'success' : 'in_progress'
        const durationMs = Math.max(0, clock - shiftedTimestamp)
        return { ...node, timestampMs: shiftedTimestamp, status: nextStatus, durationMs }
      }
      if (node.status === 'pending') {
        const nextStatus: EventNodeStatus = phase === 3 ? 'in_progress' : 'pending'
        return { ...node, timestampMs: shiftedTimestamp, status: nextStatus }
      }
      return { ...node, timestampMs: shiftedTimestamp }
    })
  }, [clock, shiftMs, workflowNodesBase])

  const [startTime, endTime] = useMemo(() => {
    if (!workflowNodesAll.length) return [BASE_TS, BASE_TS + 1]
    return [baseStart + shiftMs, baseEnd + shiftMs]
  }, [workflowNodesAll.length, baseStart, baseEnd, shiftMs])

  const windowMs = useMemo(() => TIME_PRESETS.find((preset) => preset.value === timeRange)?.ms ?? TIME_PRESETS[1].ms, [timeRange])
  const rangeStart = Math.max(startTime, endTime - windowMs)

  const workflowNodes = useMemo(() => workflowNodesAll.filter((node) => node.timestampMs >= rangeStart), [workflowNodesAll, rangeStart])

  useEffect(() => {
    if (!workflowNodes.length) {
      setSelectedNodeId(null)
      return
    }
    if (!selectedNodeId || !workflowNodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(workflowNodes[workflowNodes.length - 1].id)
    }
  }, [workflowNodes, selectedNodeId, selectedWorkflowId])

  const selectedNode = useMemo(() => {
    if (!workflowNodes.length) return null
    return workflowNodes.find((node) => node.id === selectedNodeId) ?? workflowNodes[workflowNodes.length - 1]
  }, [workflowNodes, selectedNodeId])

  const overallConfidence = useMemo(() => {
    if (!workflowNodes.length) return 0
    const average = Math.round(workflowNodes.reduce((accumulator, node) => accumulator + getConfidence(node), 0) / workflowNodes.length)
    return Math.max(0, Math.min(100, average))
  }, [workflowNodes])

  const isDegraded = overallConfidence < 80
  const visibleNodeCount = useMemo(() => workflowNodes.filter((node) => visibleLanes.has(node.laneId)).length, [workflowNodes, visibleLanes])

  const toggleLane = (laneId: EventLaneId) => {
    setVisibleLanes((previous) => {
      const next = new Set(previous)
      if (next.has(laneId)) next.delete(laneId)
      else next.add(laneId)
      return next
    })
  }

  const situationRows = useMemo(() => {
    return WORKFLOWS.map((workflow) => {
      const nodes = SCENARIO_NODES[workflow.id] ?? []
      const total = nodes.length
      const warnings = nodes.filter((node) => node.status === 'warning' || node.status === 'delayed').length
      const pending = nodes.filter((node) => node.status === 'pending' || node.status === 'in_progress').length
      return {
        workflow,
        total,
        warnings,
        pending,
      }
    })
  }, [])

  return (
    <div className="w-full p-6 lg:p-8">
      <section className="relative z-10 w-full overflow-hidden rounded-3xl border border-white/20 bg-[linear-gradient(180deg,rgba(44,49,57,0.94)_0%,rgba(35,39,46,0.96)_100%)] px-7 py-6 text-white shadow-[0_20px_48px_rgba(0,0,0,0.28)]">
        <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-b from-white/10 via-white/0 to-transparent" />
        <div className="pointer-events-none absolute -left-10 -top-14 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-slate-300/20 blur-3xl" />

        <div className="relative z-[1] flex items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="inline-flex size-12 items-center justify-center rounded-xl bg-black text-white">Z</div>
            <div>
              <h1 className="text-[30px] font-semibold tracking-tight">Workflow Event Timeline</h1>
              <p className="mt-1 text-sm text-slate-200">Live workflow graph with lane health and confidence tracking.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-2 py-1 text-xs font-medium backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live (simulated)
            </span>
            <select
              value={selectedWorkflow.id}
              onChange={(event) => {
                setSelectedWorkflowId(event.target.value)
                setSelectedNodeId(null)
                setShowGraph(true)
              }}
              className="h-10 w-[540px] max-w-[60vw] rounded-lg border border-white/20 bg-white/10 px-3.5 text-sm text-slate-100 backdrop-blur-sm outline-none"
            >
              {WORKFLOWS.map((workflow) => (
                <option key={workflow.id} value={workflow.id} className="bg-slate-800 text-slate-100">
                  {workflow.id} — {workflow.label} [{workflow.ruleVersion}]
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative z-[1] mt-4 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${workflowStatusChip(selectedWorkflow.status)}`}>
            <span className={`h-2 w-2 rounded-full ${statusDotClass(selectedWorkflow.status)}`} />
            {selectedWorkflow.status}
          </span>
        </div>
      </section>

      <main className="ct-main-panel relative z-20 mt-3 w-full px-5 pb-6 pt-6">
        <section className="ct-clear-glass rounded-xl p-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Situations</h2>
            <span className="text-xs text-slate-600">{situationRows.length} workflows</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-gray-200/70 text-left text-[11px] uppercase tracking-wider text-cx-neutral">
                  <th className="px-3 py-2 font-semibold">Workflow</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Nodes</th>
                  <th className="px-3 py-2 font-semibold">Alerts</th>
                  <th className="px-3 py-2 font-semibold">Pending</th>
                  <th className="px-3 py-2 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {situationRows.map((row) => {
                  const isActive = showGraph && row.workflow.id === selectedWorkflow.id
                  return (
                    <tr key={row.workflow.id} className={`border-b border-gray-100/80 last:border-0 ${isActive ? 'bg-slate-50/70' : 'hover:bg-white/60'}`}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(row.workflow.status)}`} />
                          <p className="font-medium text-slate-800">{row.workflow.label}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${workflowStatusChip(row.workflow.status)}`}>
                          <span className={`h-2 w-2 rounded-full ${statusDotClass(row.workflow.status)}`} />
                          {row.workflow.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700">{row.total}</td>
                      <td className="px-3 py-2 text-xs text-amber-700">{row.warnings}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">{row.pending}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => {
                            setSelectedWorkflowId(row.workflow.id)
                            setSelectedNodeId(null)
                            setShowGraph(true)
                          }}
                          className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                            isActive ? 'bg-slate-800 text-white' : 'bg-white/80 text-slate-700 hover:bg-white'
                          }`}
                        >
                          {isActive ? 'Viewing' : 'View Timeline'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {showGraph ? (
          <>
        <div className="ct-clear-glass mt-3 flex flex-wrap items-center gap-5 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Time</span>
            <div className="flex rounded-lg border border-gray-200 bg-white/60 p-0.5">
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setTimeRange(preset.value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    timeRange === preset.value ? 'border border-gray-200 bg-white text-cx-text shadow-sm' : 'text-cx-neutral hover:text-cx-text'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Zoom</span>
            <input type="range" min={50} max={200} step={10} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="w-28 accent-slate-600" />
            <span className="w-10 text-right font-mono text-xs tabular-nums text-cx-neutral">{zoom}%</span>
          </div>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowLaneDropdown((state) => !state)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white/75 px-3.5 py-2 text-xs font-semibold text-cx-text transition-colors hover:bg-white"
            >
              Lanes <span aria-hidden>▾</span>
            </button>
            {showLaneDropdown ? (
              <div className="ct-clear-glass absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-white/70 p-2 shadow-lg">
                {(Object.entries(LANE_CONFIG) as [EventLaneId, (typeof LANE_CONFIG)[EventLaneId]][]).map(([laneId, laneConfig]) => (
                  <label key={laneId} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/60">
                    <input type="checkbox" checked={visibleLanes.has(laneId)} onChange={() => toggleLane(laneId)} className="accent-slate-600" />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: laneConfig.color }} />
                    <span className="text-cx-text">{laneConfig.label}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          <div className="h-6 w-px bg-gray-200" />

          <div className="flex items-center gap-2">
            <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">{visibleNodeCount} events</span>
            <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">
              {visibleLanes.size} / {laneIds.length} lanes
            </span>
          </div>

          <button
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white/75 px-3.5 py-2 text-xs font-semibold text-cx-text transition-colors hover:bg-white"
            onClick={() => downloadJson(`${selectedWorkflow.id}-timeline.json`, { workflow: selectedWorkflow, nodes: workflowNodes })}
          >
            Export
          </button>
          <button
            onClick={() => setShowGraph(false)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white/75 px-3.5 py-2 text-xs font-semibold text-cx-text transition-colors hover:bg-white"
          >
            Back to Situations
          </button>
        </div>

        <div className="mt-3 flex min-h-0 rounded-2xl border border-white/70 bg-white/85 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200/70 bg-white/75 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-slate-700">{selectedWorkflow.label}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-cx-neutral">Confidence</span>
                <span
                  className="font-mono text-sm font-bold tabular-nums"
                  style={{ color: overallConfidence >= 80 ? '#10b981' : overallConfidence >= 50 ? '#f59e0b' : '#ef4444' }}
                >
                  {overallConfidence}%
                </span>
                {isDegraded ? (
                  <span className="flex items-center gap-1 text-xs text-amber-600">
                    <MiniIcon kind="warn" />
                    Degraded
                  </span>
                ) : null}
              </div>
              <div className="font-mono text-xs text-cx-neutral">
                {formatTimeLabel(rangeStart)} → {formatTimeLabel(endTime)}
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-white/70">
              <TimelineCanvas
                nodes={workflowNodes}
                visibleLanes={visibleLanes}
                zoom={zoom}
                selectedNodeId={selectedNodeId}
                onSelect={setSelectedNodeId}
                startTime={rangeStart}
                endTime={endTime}
              />
            </div>

            <div className="border-t border-gray-100 bg-slate-50/60 px-5 py-3">
              <EventGraphLegend />
            </div>
          </div>

          <aside className="hidden w-[380px] shrink-0 border-l border-gray-100/80 bg-white/88 lg:block">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-slate-100/70 to-white/70 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-cx-text">Event Details</h3>
                <p className="text-[11px] text-cx-neutral">Click a node on the timeline</p>
              </div>
              {selectedNode ? (
                <button onClick={() => setSelectedNodeId(null)} className="rounded-lg p-1.5 transition-colors hover:bg-slate-100">
                  <span className="text-cx-neutral">✕</span>
                </button>
              ) : null}
            </div>
            <div style={{ height: 'calc(100% - 72px)' }}>
              <EventDetailsPanel node={selectedNode} />
            </div>
          </aside>
        </div>

          </>
        ) : (
          <div className="ct-clear-glass mt-3 rounded-xl border border-white/70 p-4 text-sm text-slate-700">
            Select a situation from the table above, then click <span className="font-semibold">View Timeline</span> to open the graph.
          </div>
        )}
      </main>
    </div>
  )
}
