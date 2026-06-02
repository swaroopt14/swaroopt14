'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LiveDataHint } from '../shared'
import { Glyph } from '../shared'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import {
  intelligenceBatchesForSelector,
  pickEvidenceBatchId,
} from '@/services/payout-command/prod-api/evidenceBatchScope'
import { getEvidencePackFull, listEvidencePacks } from '@/services/payout-command/prod-api/getEvidencePacks'
import { getEvidenceBatchLineageGraph } from '@/services/payout-command/prod-api/getEvidenceBatchLineageGraph'
import { isBatchEvidencePack } from '@/services/payout-command/prod-api/resolveBatchEvidencePack'
import { getEvidencePackLineageGraph } from '@/services/payout-command/prod-api/getEvidencePackLineageGraph'
import { listEvidencePacksForBatch } from '@/services/payout-command/prod-api/listEvidencePacksForBatch'
import {
  downloadEvidencePackPdf,
  downloadEvidencePackJson,
} from '@/services/payout-command/prod-api/exportEvidencePack'
import {
  downloadEvidenceBatchIntentsJson,
  downloadEvidenceBatchIntentsPdf,
} from '@/services/payout-command/prod-api/exportEvidenceBatchIntents'
import { getIntentJournalPaymentIntentsForSession } from '@/services/payout-command/prod-api/intentJournalApi'
import type {
  EvidencePackFull,
  EvidencePackSummaryRow,
} from '@/services/payout-command/prod-api/evidenceTypes'
import type { IntentJournalPaymentIntentItem } from '@/services/payout-command/prod-api/intentJournalTypes'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { evidenceCopy } from '../evidence/copy/evidenceCopy'
import {
  buildEvidencePackGraphFromApi,
  buildEvidencePackGraphFromLineage,
} from './evidencePackGraphFromApi'
import type {
  BatchMeta,
  EvidenceItemType,
  EvidencePackGraph,
  EvidencePackMode,
  IntermediateNode,
  LeafNode,
  LeafStatus,
  RootNode,
} from './evidenceGraphTypes'

export type {
  BatchMeta,
  EvidenceItemType,
  EvidencePackGraph,
  EvidencePackMode,
  IntermediateNode,
  LeafNode,
  LeafStatus,
  RootNode,
} from './evidenceGraphTypes'

/**
 * MerkleGraphSurface — Evidence Pack Graph.
 *
 * Visual proof of how an evidence pack is constructed and verified.
 * Layout: Leaves (left) → Intermediate hashes (middle) → Merkle Root (right).
 * Pill nodes on a grid canvas with curved Bezier connectors.
 *
 *   Valid    → green  (#4ADE80)
 *   Missing  → amber  (#F59E0B)
 *   Invalid  → red    (#EF4444)
 *   Derived  → grey   (#888888)
 *
 * Color is meaningful here (verification state). Page chrome stays minimal.
 */

// ─── Sample data ──────────────────────────────────────────────────────────────

// Mode A — Intent + Settlement Attachment (Service 6 §12.1). The minimal serious pack.
const VERIFIED_LEAVES: LeafNode[] = [
  { id: 'L1', name: 'Raw Ingress Envelope', artifact: 'ingress_envelope.json', itemType: 'RAW_INGRESS_ENVELOPE', stableRef: 'env_8a21f', version: 'v1', sourceService: 'zord-ingress', hashFull: 'sha256:a1f3d2c4e5b8f0a9d6c2e1b4f7a8d3c5e9b2f1a4d7c8e3b6f9a2d5', hashShort: 'a1f3…', leafHash: 'sha256:9c3e1b…leaf01', source: 'Service 1 — Ingress', receivedAt: '10:01 AM', status: 'valid', impact: 'Original raw intent envelope as received.', iconName: 'document' },
  { id: 'L2', name: 'Canonical Intent', artifact: 'canonical_intent.json', itemType: 'CANONICAL_INTENT', stableRef: 'INT-1023', version: 'intent_schema_v1', sourceService: 'zord-intent-engine', hashFull: 'sha256:7b9e2c4a8f1d3b6e5a9c2f4d7b8e1a3c6f9d2b5e8a1c4f7d3b6e9a2c', hashShort: '7b9e…', leafHash: 'sha256:2d8a4f…leaf02', source: 'Service 2 — Canonical', receivedAt: '10:01 AM', status: 'valid', impact: 'Normalised payout intent — schema v1.', iconName: 'zap' },
  { id: 'L3', name: 'Governance @ Canonical', artifact: 'governance_decision.json', itemType: 'GOVERNANCE_DECISION_AT_CANONICAL', stableRef: 'gov_dec_4421', version: 'rs-2026.05.1', sourceService: 'zord-governance', hashFull: 'sha256:c2e8a4f1b6d9e3c5a8f2b7d4e1a9c6f3b8d5e2a7f4c1b9e6d3a8f5b2', hashShort: 'c2e8…', leafHash: 'sha256:5b1f7c…leaf03', source: 'Service 3 — Governance', receivedAt: '10:01 AM', status: 'valid', impact: 'Why this payout was allowed — 11 gates passed.', iconName: 'shield' },
  { id: 'L4', name: 'Raw Settlement Envelope', artifact: 'settlement_envelope.json', itemType: 'RAW_SETTLEMENT_ENVELOPE', stableRef: 'env_set_771', version: 'v1', sourceService: 'zord-ingress', hashFull: 'sha256:f4d7c1b8e3a6f2d5b9e1c4a7f8d2e6b3c9a5f1d8e4b7c2a6f9d3e5b1', hashShort: 'f4d7…', leafHash: 'sha256:8e4c2a…leaf04', source: 'Service 1 — Ingress', receivedAt: '10:02 AM', status: 'valid', impact: 'Bank statement / outcome file as received.', iconName: 'arrow-up-right' },
  { id: 'L5', name: 'Canonical Settlement', artifact: 'canonical_settlement.json', itemType: 'CANONICAL_SETTLEMENT_OBSERVATION', stableRef: 'set_obs_991', version: 'outcome_schema_v1', sourceService: 'zord-outcome', hashFull: 'sha256:c9d1e4a7f2b8d5c3e6a1f9b4d7c2e8a5f3b6d9c1e4a7f2b5d8c3e6a9', hashShort: 'c9d1…', leafHash: 'sha256:3a7d9b…leaf05', source: 'Service 5 — Outcome', receivedAt: '10:03 AM', status: 'valid', impact: 'Canonicalised settlement-side truth.', iconName: 'bank' },
  { id: 'L6', name: 'Attachment Decision', artifact: 'attachment_decision.json', itemType: 'ATTACHMENT_DECISION', stableRef: 'att_dec_5512', version: 'attach_v1.0', sourceService: 'zord-attach', hashFull: 'sha256:b6e2f8a4c1d7b3e9a5f2c8d4b1e7a3f9c5d2b8e4a1f7c3d9b5e2a8f4', hashShort: 'b6e2…', leafHash: 'sha256:6c2e8a…leaf06', source: 'Service 5 — Attach', receivedAt: '10:14 AM', status: 'valid', impact: 'Exact / high-confidence attachment to intent.', iconName: 'bank' },
  { id: 'L7', name: 'Final Evidence View', artifact: 'final_evidence_view.json', itemType: 'FINAL_EVIDENCE_VIEW', stableRef: 'CTR-7781', version: 'contract_schema_v1', sourceService: 'zord-contracts', hashFull: 'sha256:d3a8c5e2b9f4d1a7c6e3b8f5a2d9c4e1b6f3a8d5c2e9b4f1a7d6c3e8', hashShort: 'd3a8…', leafHash: 'sha256:1f9b4d…leaf07', source: 'Service 6 — Evidence', receivedAt: '10:14 AM', status: 'valid', impact: 'Customer-facing proof-ready truth artifact.', iconName: 'grid' },
]

const INTERMEDIATES: IntermediateNode[] = [
  { id: 'H1', hashFull: 'sha256:e5a2b8d4c1f7e3a9d6b2c8f5e1a7d4c9b6f2e8a5d1c7b4f9e6a2d8c5', hashShort: 'e5a2…', derivedFrom: ['L1', 'L2'] },
  { id: 'H2', hashFull: 'sha256:f7b9d3a6e1c8b4f2d9a5c7e3b6f1d8a4c9e2b7f5d1a8c4e6b3f9d2a5', hashShort: 'f7b9…', derivedFrom: ['L3', 'L4'] },
  { id: 'H3', hashFull: 'sha256:c4e8b1d7a3f6c9b5e2d8a4f1c7b3e9d6a2f8c5b1e4d7a9f3c6b2e8d4', hashShort: 'c4e8…', derivedFrom: ['L5', 'L6', 'L7'] },
]

// A batch is an upstream grouping of many intents (1000s). Each intent has its own
// evidence pack. Service 6 §4: "one evidence pack = one lifecycle commitment".
const SHARED_SCHEMAS = { intent: 'v1', outcome: 'v1', contract: 'v1', attachment: 'v1' }

const SAMPLE_PACK: EvidencePackGraph = {
  packId: 'EP-2041',
  intentId: 'INT-1023',
  contractId: 'CTR-7781',
  batchId: 'BATCH-001',
  tenantId: 'tnt_acme',
  mode: 'INTELLIGENCE_ATTACH',
  rulesetVersion: 'attach_v1.0',
  schemaVersions: SHARED_SCHEMAS,
  createdAt: '2026-05-08T10:14:00Z',
  defensibilityScore: 98,
  leaves: VERIFIED_LEAVES,
  intermediates: INTERMEDIATES,
  root: {
    id: 'root',
    hashFull: 'sha256:9f2c4a6b8e1d3f7a5c9b2e4d6f8a1c3e5b7d9f2a4c6e8b1d3f5a7c9e2b4d6f8',
    hashShort: '9f2c4a6b…b2d4f6',
    status: 'verified',
    tamper: 'no-changes',
  },
}

const SAMPLE_PACK_PARTNER: EvidencePackGraph = {
  packId: 'EP-2042',
  intentId: 'INT-1024',
  contractId: 'CTR-7782',
  batchId: 'BATCH-001',
  tenantId: 'tnt_acme',
  mode: 'INTELLIGENCE_ATTACH',
  rulesetVersion: 'attach_v1.0',
  schemaVersions: SHARED_SCHEMAS,
  createdAt: '2026-05-08T10:18:00Z',
  defensibilityScore: 94,
  leaves: VERIFIED_LEAVES.map((leaf) =>
    leaf.id === 'L7' ? { ...leaf, status: 'missing' as LeafStatus, impact: 'Final evidence view not yet exposed for this intent.' } : leaf,
  ),
  intermediates: INTERMEDIATES,
  root: {
    id: 'root',
    hashFull: 'sha256:5d2a8c7e1f9b4d6a3c8e5f2b9d7a4c1e6b8f3d5a2c9e7b4d1f6a8c3e5b2d9f7a',
    hashShort: '5d2a8c7e…d9f7a',
    status: 'partial',
    tamper: 'no-changes',
  },
}

const SAMPLE_PACK_THIRD: EvidencePackGraph = {
  packId: 'EP-2043',
  intentId: 'INT-1025',
  contractId: 'CTR-7783',
  batchId: 'BATCH-001',
  tenantId: 'tnt_acme',
  mode: 'SECONDARY_DISPATCH',
  rulesetVersion: 'attach_v1.0',
  schemaVersions: SHARED_SCHEMAS,
  createdAt: '2026-05-08T10:21:00Z',
  defensibilityScore: 89,
  leaves: VERIFIED_LEAVES,
  intermediates: INTERMEDIATES,
  root: {
    id: 'root',
    hashFull: 'sha256:7c4e2b9a8d1f5c3e6b9a4d7f2c8e5b1a9f6d3c8e4b7a2f5d1c9e6b3a8f4d7c2e',
    hashShort: '7c4e2b9a…d7c2e',
    status: 'verified',
    tamper: 'no-changes',
  },
}

const SAMPLE_PACK_TAMPERED: EvidencePackGraph = {
  packId: 'EP-2039',
  intentId: 'INT-1019',
  contractId: 'CTR-7790',
  batchId: 'BATCH-002',
  tenantId: 'tnt_acme',
  mode: 'FULL_CONTROL',
  rulesetVersion: 'fusion_v1.0',
  schemaVersions: SHARED_SCHEMAS,
  createdAt: '2026-05-08T09:42:00Z',
  defensibilityScore: 72,
  leaves: VERIFIED_LEAVES.map((leaf) => {
    if (leaf.id === 'L6') return { ...leaf, status: 'missing' as LeafStatus, impact: 'Attachment decision missing — independent confirmation absent.' }
    if (leaf.id === 'L4') return { ...leaf, status: 'invalid' as LeafStatus, impact: 'Settlement envelope hash mismatch — file altered.' }
    return leaf
  }),
  intermediates: INTERMEDIATES,
  root: {
    id: 'root',
    hashFull: 'sha256:3e7b1a4d8c2f5e9b6d1a4f7c2e8b5d9a3f6c1e4b8d7a2f5c9e3b6d1a4f7c2e8b',
    hashShort: '3e7b1a4d…c2e8b',
    status: 'partial',
    tamper: 'changes-detected',
  },
}

const SAMPLE_PACKS: Record<string, EvidencePackGraph> = {
  [SAMPLE_PACK.packId]: SAMPLE_PACK,
  [SAMPLE_PACK_PARTNER.packId]: SAMPLE_PACK_PARTNER,
  [SAMPLE_PACK_THIRD.packId]: SAMPLE_PACK_THIRD,
  [SAMPLE_PACK_TAMPERED.packId]: SAMPLE_PACK_TAMPERED,
}

// Batch-level metadata. Real batches contain hundreds-to-thousands of intents — the
// `totalIntents` here is the upstream truth, while only a sample slice is loaded into
// `SAMPLE_PACKS` for the demo UI.
const SAMPLE_BATCHES: Record<string, BatchMeta> = {
  'BATCH-001': { batchId: 'BATCH-001', totalIntents: 1000, totalTransactions: 300, receivedAt: '2026-05-08T09:55:00Z' },
  'BATCH-002': { batchId: 'BATCH-002', totalIntents: 84, totalTransactions: 84, receivedAt: '2026-05-08T09:30:00Z' },
}

function packsForBatch(batchId: string): EvidencePackGraph[] {
  return Object.values(SAMPLE_PACKS).filter((p) => p.batchId === batchId)
}

const ALL_BATCH_IDS = Object.keys(SAMPLE_BATCHES)

/** Safe graph shell when live pack is not loaded (hooks must not see null). */
const EMPTY_LIVE_PACK: EvidencePackGraph = {
  packId: '—',
  intentId: '—',
  contractId: '—',
  batchId: '—',
  tenantId: '—',
  mode: 'INTELLIGENCE_ATTACH',
  rulesetVersion: '—',
  schemaVersions: SHARED_SCHEMAS,
  createdAt: new Date(0).toISOString(),
  defensibilityScore: 0,
  leaves: [],
  intermediates: [],
  root: { id: 'root', hashFull: '', hashShort: '—', status: 'partial', tamper: 'no-changes' },
}

// ─── Component ────────────────────────────────────────────────────────────────

type SelectedNode =
  | { kind: 'leaf'; node: LeafNode }
  | { kind: 'intermediate'; node: IntermediateNode }
  | { kind: 'root'; node: RootNode }
  | null

export type MerkleGraphSurfaceProps = {
  /** Deep-link from `/payout-command-view/evidence-pack/[packId]`. */
  initialPackId?: string
  /** Demo / fallback graph when no session tenant (local UI only). */
  pack?: EvidencePackGraph
  /** Embedded in pack detail Graph tab or Evidence dock — hides page chrome. */
  embedMode?: boolean
  /** Parent-owned batch id (Evidence dock batch picker). */
  controlledBatchId?: string
  /** Parent-owned pack id — updates when Evidence intent filter changes. */
  controlledPackId?: string
  /** `table`: only packs already loaded; `journal`: full intent roster from intent-engine. */
  intentOptionsSource?: 'table' | 'journal'
  /** Hide batch / intent·pack pickers when parent controls scope. */
  hideScopePickers?: boolean
  /** Called when the active evidence pack changes (intent · pack picker). */
  onActivePackIdChange?: (packId: string) => void
}

export function MerkleGraphSurface({
  initialPackId,
  pack: initialPack = SAMPLE_PACK,
  embedMode = false,
  controlledBatchId,
  controlledPackId,
  intentOptionsSource = 'journal',
  hideScopePickers = false,
  onActivePackIdChange,
}: MerkleGraphSurfaceProps = {}) {
  const searchParams = useSearchParams()
  const urlBatchId = searchParams.get('batch_id')?.trim() ?? ''
  const { tenantId, tenantReady } = useSessionTenant()
  const useLive = tenantReady

  // Pack id pinned by a deep-link (Evidence Packs table → ?tab=graph). When set,
  // batch-level fetches must never clobber this value — the intent pack we landed
  // on may not appear in `liveBatchPacks` until the per-intent fan-out completes,
  // or may be beyond MAX_INTENT_PACK_QUERIES entirely.
  const pinnedPackId = useMemo(
    () => apiTrimmedString(controlledPackId) || apiTrimmedString(initialPackId),
    [controlledPackId, initialPackId],
  )

  const [activePackId, setActivePackId] = useState(() => pinnedPackId || initialPack.packId)
  const [activeBatchId, setActiveBatchId] = useState(
    () => apiTrimmedString(controlledBatchId) || apiTrimmedString(initialPack.batchId),
  )
  const [intelBatches, setIntelBatches] = useState<IntelligenceBatchRow[]>([])
  const [packSummaries, setPackSummaries] = useState<EvidencePackSummaryRow[]>([])
  const [liveGraphs, setLiveGraphs] = useState<Record<string, EvidencePackGraph>>({})
  const [liveListError, setLiveListError] = useState<string | null>(null)
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const [exporting, setExporting] = useState<'pdf' | 'json' | null>(null)
  // Every payment intent in the active batch — drives the Intent · pack picker.
  // Sourced from intent-engine so we don't depend on the per-intent evidence
  // fan-out (which is capped) and the dropdown always lists the whole batch.
  const [batchIntents, setBatchIntents] = useState<IntentJournalPaymentIntentItem[]>([])
  const [resolvingIntentId, setResolvingIntentId] = useState<string | null>(null)
  const lastNotifiedPackIdRef = useRef('')

  const {
    defensibility,
    refresh: refreshKpis,
  } = useIntelligenceKpis({ tenantReady, batchId: activeBatchId, intervalMs: 0 })
  const defensibilityResolved = isDataAvailable(defensibility) ? defensibility : null
  const defensibilityScore = defensibilityResolved?.defensibility_score ?? 55

  const isBatchScopedPack = useCallback(
    (summary: EvidencePackSummaryRow | null | undefined, full: EvidencePackFull): boolean => {
      if (summary && isBatchEvidencePack(summary)) return true
      const fullIntentId = apiTrimmedString(full.intent_id)
      const fullMode = apiTrimmedString(full.mode).toUpperCase()
      return !fullIntentId && (fullMode.includes('BATCH') || fullMode === '')
    },
    [],
  )

  const resolvePackGraph = useCallback(
    async (full: EvidencePackFull, summary?: EvidencePackSummaryRow | null): Promise<EvidencePackGraph> => {
      const batchId = apiTrimmedString(activeBatchId) || 'batch'
      const batchCandidate = isBatchScopedPack(summary, full)
      if (batchId && batchCandidate) {
        const batchLineage = await getEvidenceBatchLineageGraph(batchId)
        if (batchLineage.data) {
          return buildEvidencePackGraphFromLineage(full, batchLineage.data, {
            batchId,
            defensibilityScore,
          })
        }
      }

      const lineage = await getEvidencePackLineageGraph(full.evidence_pack_id)
      if (lineage.data) {
        return buildEvidencePackGraphFromLineage(full, lineage.data, {
          batchId,
          defensibilityScore,
        })
      }

      return buildEvidencePackGraphFromApi(full, {
        batchId,
        defensibilityScore,
      })
    },
    [activeBatchId, defensibilityScore, isBatchScopedPack],
  )

  useEffect(() => {
    const bid = apiTrimmedString(controlledBatchId)
    if (bid) {
      setActiveBatchId(bid)
      return
    }
    if (!useLive || !urlBatchId) return
    setActiveBatchId(urlBatchId)
  }, [useLive, urlBatchId, controlledBatchId])

  useEffect(() => {
    const pid = apiTrimmedString(controlledPackId)
    if (pid) setActivePackId(pid)
  }, [controlledPackId])

  useEffect(() => {
    if (!activePackId || lastNotifiedPackIdRef.current === activePackId) return
    lastNotifiedPackIdRef.current = activePackId
    onActivePackIdChange?.(activePackId)
  }, [activePackId, onActivePackIdChange])

  useEffect(() => {
    if (!useLive) return
    let cancelled = false
    void getIntelligenceBatches({ limit: 80 }).then((res) => {
      if (cancelled) return
      const intelBatches = res?.batches ?? []
      setIntelBatches(intelBatches)
      setActiveBatchId((prev) =>
        pickEvidenceBatchId(intelBatches, apiTrimmedString(prev) || urlBatchId),
      )
    })
    return () => {
      cancelled = true
    }
  }, [useLive, urlBatchId])

  useEffect(() => {
    if (!useLive || !activeBatchId) {
      setPackSummaries([])
      setLiveListError(null)
      return
    }
    let cancelled = false
    setLiveListError(null)
    void listEvidencePacksForBatch(activeBatchId).then((packs) => {
      if (cancelled) return
      if (!packs.length) {
        setLiveListError('Evidence list unavailable. Confirm zord-evidence is up and list filters match your deployment.')
        setPackSummaries([])
        return
      }
      setPackSummaries(packs)
    })
    return () => {
      cancelled = true
    }
  }, [useLive, activeBatchId])

  // Pull the full intent roster for the active batch from intent-engine (journal mode only).
  useEffect(() => {
    if (intentOptionsSource === 'table' || !useLive || !activeBatchId) {
      setBatchIntents([])
      return
    }
    let cancelled = false
    void getIntentJournalPaymentIntentsForSession(activeBatchId).then((res) => {
      if (cancelled) return
      setBatchIntents(res.data?.items ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [useLive, activeBatchId, intentOptionsSource])

  useEffect(() => {
    if (!useLive || packSummaries.length === 0) return
    let cancelled = false
    const summaryByPackId = new Map<string, EvidencePackSummaryRow>()
    for (const summary of packSummaries) {
      const pid = apiTrimmedString(summary.evidence_pack_id)
      if (pid) summaryByPackId.set(pid, summary)
    }
    const ids = [...summaryByPackId.keys()].slice(0, 256)
    void Promise.all(
      ids.map(async (id) => {
        const full = await getEvidencePackFull(id)
        if (!full) return
        const g = await resolvePackGraph(full, summaryByPackId.get(id))
        return [id, g] as const
      }),
    ).then((pairs) => {
      if (cancelled) return
      const next: Record<string, EvidencePackGraph> = {}
      for (const row of pairs) {
        if (row) next[row[0]] = row[1]
      }
      setLiveGraphs((prev) => ({ ...prev, ...next }))
    })
    return () => {
      cancelled = true
    }
  }, [useLive, packSummaries, resolvePackGraph])

  useEffect(() => {
    const packIdFromUrl = apiTrimmedString(initialPackId)
    if (!useLive || !packIdFromUrl) return
    let cancelled = false
    void getEvidencePackFull(packIdFromUrl).then(async (full) => {
      if (cancelled || !full) return
      const summary = packSummaries.find(
        (row) => apiTrimmedString(row.evidence_pack_id) === packIdFromUrl,
      )
      const g = await resolvePackGraph(full, summary)
      if (cancelled) return
      setLiveGraphs((prev) => ({ ...prev, [g.packId]: g }))
      setActivePackId(g.packId)
    })
    return () => {
      cancelled = true
    }
  }, [useLive, initialPackId, packSummaries, resolvePackGraph])

  const demoPack = SAMPLE_PACKS[activePackId] ?? initialPack
  const demoBatchPacks = useMemo(() => packsForBatch(activeBatchId), [activeBatchId])

  const liveBatchPacks = useMemo(() => {
    const graphs: EvidencePackGraph[] = []
    const seen = new Set<string>()
    // Always surface the URL-pinned pack first when its graph is loaded — even
    // if it isn't in the current batch's pack summaries — so the Intent picker
    // can reach it and `livePack` resolves it cleanly.
    if (pinnedPackId) {
      const g = liveGraphs[pinnedPackId]
      if (g) {
        graphs.push(g)
        seen.add(pinnedPackId)
      }
    }
    for (const s of packSummaries) {
      const id = apiTrimmedString(s.evidence_pack_id)
      if (!id || seen.has(id)) continue
      const g = liveGraphs[id]
      if (g) {
        graphs.push(g)
        seen.add(id)
      }
    }
    return graphs
  }, [packSummaries, liveGraphs, pinnedPackId])

  // intent_id → pack_id index built from everything we already know.
  const intentIdToPackId = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of packSummaries) {
      const iid = apiTrimmedString(s.intent_id)
      const pid = apiTrimmedString(s.evidence_pack_id)
      if (iid && pid && !m.has(iid)) m.set(iid, pid)
    }
    for (const g of Object.values(liveGraphs)) {
      const iid = apiTrimmedString(g.intentId)
      if (iid && iid !== '—' && !m.has(iid)) m.set(iid, g.packId)
    }
    return m
  }, [packSummaries, liveGraphs])

  // Dropdown options. Every intent in the batch shows up; entries whose pack
  // hasn't been fetched yet use an `intent:<id>` value and resolve on click.
  type PackOption = { value: string; label: string; intentId?: string }
  const packOptions = useMemo((): PackOption[] => {
    const opts: PackOption[] = []
    const seenPacks = new Set<string>()
    const seenIntents = new Set<string>()
    const labelForIntent = (
      iid: string,
      ref: string,
      pid: string | undefined,
    ): string => {
      const head = ref || (iid.length > 14 ? `${iid.slice(0, 14)}…` : iid)
      if (!pid) return `${head} · (load)`
      return `${head} · ${pid.length > 22 ? `${pid.slice(0, 22)}…` : pid}`
    }

    for (const s of packSummaries) {
      const pid = apiTrimmedString(s.evidence_pack_id)
      const iid = apiTrimmedString(s.intent_id)
      if (!pid || seenPacks.has(pid)) continue
      seenPacks.add(pid)
      const ref = apiTrimmedString(s.client_payout_ref) || apiTrimmedString(s.client_reference)
      if (iid) {
        seenIntents.add(iid)
        opts.push({ value: pid, label: labelForIntent(iid, ref, pid), intentId: iid })
      } else {
        const head = pid.length > 22 ? `${pid.slice(0, 22)}…` : pid
        opts.push({ value: pid, label: `Batch pack · ${head}` })
      }
    }

    if (intentOptionsSource === 'journal') {
      for (const it of batchIntents) {
        const iid = apiTrimmedString(it.intent_id)
        if (!iid || seenIntents.has(iid)) continue
        seenIntents.add(iid)
        const ref = apiTrimmedString(it.client_payout_ref)
        const known = intentIdToPackId.get(iid)
        if (known && seenPacks.has(known)) continue
        if (known) seenPacks.add(known)
        opts.push({
          value: known ?? `intent:${iid}`,
          label: labelForIntent(iid, ref, known),
          intentId: iid,
        })
      }
    }

    // Catch-all: surface any loaded graph not yet in the list (e.g. URL pinned
    // pack when its batch hasn't projected into intent-engine yet).
    for (const g of Object.values(liveGraphs)) {
      if (seenPacks.has(g.packId)) continue
      seenPacks.add(g.packId)
      const iid = apiTrimmedString(g.intentId)
      const ref = iid && iid !== '—' ? iid : ''
      if (iid && iid !== '—') {
        opts.push({ value: g.packId, label: labelForIntent(iid, ref, g.packId), intentId: iid })
      } else {
        const head = g.packId.length > 22 ? `${g.packId.slice(0, 22)}…` : g.packId
        opts.push({ value: g.packId, label: `Batch pack · ${head}` })
      }
    }

    return opts
  }, [packSummaries, batchIntents, intentIdToPackId, liveGraphs, intentOptionsSource])

  const packSelectValue = useMemo(() => {
    if (packOptions.some((o) => o.value === activePackId)) return activePackId
    if (resolvingIntentId) {
      const found = packOptions.find((o) => o.intentId === resolvingIntentId && o.value.startsWith('intent:'))
      if (found) return found.value
    }
    return ''
  }, [packOptions, activePackId, resolvingIntentId])

  const handlePackPickerChange = useCallback(
    async (value: string) => {
      if (!value) return
      if (!value.startsWith('intent:')) {
        setActivePackId(value)
        return
      }
      const iid = value.slice('intent:'.length)
      setResolvingIntentId(iid)
      try {
        const known = intentIdToPackId.get(iid)
        if (known) {
          setActivePackId(known)
          return
        }
        const res = await listEvidencePacks({ intentId: iid })
        const summary = res?.packs?.[0]
        const pid = apiTrimmedString(summary?.evidence_pack_id)
        if (!pid || !summary) {
          setLiveListError(`No evidence pack for intent ${iid}.`)
          return
        }
        setPackSummaries((prev) =>
          prev.some((s) => apiTrimmedString(s.evidence_pack_id) === pid) ? prev : [...prev, summary],
        )
        const full = await getEvidencePackFull(pid)
        if (!full) return
        const g = await resolvePackGraph(full, summary)
        setLiveGraphs((prev) => ({ ...prev, [pid]: g }))
        setActivePackId(pid)
      } finally {
        setResolvingIntentId((cur) => (cur === iid ? null : cur))
      }
    },
    [intentIdToPackId, resolvePackGraph],
  )

  const livePack =
    liveGraphs[activePackId] ??
    liveBatchPacks.find((p) => p.packId === activePackId) ??
    liveBatchPacks[0] ??
    null

  const livePackMissing = useLive && livePack === null
  const pack = (useLive ? livePack : demoPack) ?? EMPTY_LIVE_PACK
  const batchPacks = useLive ? liveBatchPacks : demoBatchPacks
  const showGraph = !useLive || (tenantReady && !livePackMissing)

  const handleManualRefresh = useCallback(async () => {
    if (!useLive) return

    const bid = apiTrimmedString(activeBatchId)
    const targetPackId =
      apiTrimmedString(activePackId) ||
      apiTrimmedString(controlledPackId) ||
      apiTrimmedString(initialPackId)

    if (!bid && !targetPackId) return

    setManualRefreshing(true)
    setLiveListError(null)
    try {
      await refreshKpis()

      let nextSummaries = packSummaries
      if (bid) {
        nextSummaries = await listEvidencePacksForBatch(bid)
        if (nextSummaries.length) {
          setPackSummaries(nextSummaries)
        } else {
          setLiveListError('Evidence list unavailable. Confirm zord-evidence is up and list filters match your deployment.')
          setPackSummaries([])
          return
        }
      }

      const summary =
        nextSummaries.find((row) => apiTrimmedString(row.evidence_pack_id) === targetPackId) ??
        packSummaries.find((row) => apiTrimmedString(row.evidence_pack_id) === targetPackId) ??
        nextSummaries[0]

      const pid = apiTrimmedString(summary?.evidence_pack_id) || targetPackId
      if (!pid) return

      const full = await getEvidencePackFull(pid)
      if (full) {
        const graph = await resolvePackGraph(full, summary)
        setLiveGraphs((prev) => ({ ...prev, [graph.packId]: graph }))
        setActivePackId(graph.packId)
        return
      }

      if (bid && summary && isBatchEvidencePack(summary)) {
        const lineage = await getEvidenceBatchLineageGraph(bid)
        if (lineage.data) {
          const fallbackFull: EvidencePackFull = {
            evidence_pack_id: apiTrimmedString(lineage.data.evidence_pack_id) || pid,
            tenant_id: apiTrimmedString(lineage.data.tenant_id) || apiTrimmedString(summary.tenant_id),
            intent_id: apiTrimmedString(lineage.data.intent_id),
            batch_id: bid,
            contract_id: apiTrimmedString(summary.contract_id) || '-',
            mode: apiTrimmedString(summary.mode) || 'BATCH_PROOF',
            pack_status: apiTrimmedString(summary.pack_status) || 'ACTIVE',
            items: [],
            merkle_root: apiTrimmedString(lineage.data.merkle_root) || apiTrimmedString(summary.merkle_root),
            ruleset_version: apiTrimmedString(summary.ruleset_version) || 'v1',
            created_at: apiTrimmedString(summary.created_at) || new Date().toISOString(),
          }
          const graph = buildEvidencePackGraphFromLineage(fallbackFull, lineage.data, {
            batchId: bid,
            defensibilityScore,
          })
          setLiveGraphs((prev) => ({ ...prev, [graph.packId]: graph }))
          setActivePackId(graph.packId)
          return
        }
      }

      setLiveListError(`Could not refresh evidence pack ${pid}.`)
    } catch {
      setLiveListError('Could not refresh evidence graph. Please try again.')
    } finally {
      setManualRefreshing(false)
    }
  }, [
    activeBatchId,
    activePackId,
    controlledPackId,
    defensibilityScore,
    initialPackId,
    packSummaries,
    refreshKpis,
    resolvePackGraph,
    useLive,
  ])

  const handleExport = useCallback(
    async (kind: 'pdf' | 'json') => {
      const pid = apiTrimmedString(activePackId) || apiTrimmedString(controlledPackId) || apiTrimmedString(initialPackId) || apiTrimmedString(pack.packId)
      const bid = apiTrimmedString(activeBatchId) || apiTrimmedString(controlledBatchId) || apiTrimmedString(initialPack.batchId) || apiTrimmedString(pack.batchId)
      if (!pid || pid === EMPTY_LIVE_PACK.packId) return

      setExporting(kind)
      setLiveListError(null)
      try {
        const result = bid
          ? kind === 'json'
            ? await downloadEvidenceBatchIntentsJson(bid)
            : await downloadEvidenceBatchIntentsPdf(bid)
          : kind === 'json'
            ? await downloadEvidencePackJson(pid)
            : await downloadEvidencePackPdf(pid)
        if (!result.ok) {
          setLiveListError(
            result.errorText?.slice(0, 240) ||
              `Could not export evidence pack ${pid} (${result.status}).`,
          )
        }
      } catch {
        setLiveListError(`Could not export evidence pack ${pid}.`)
      } finally {
        setExporting(null)
      }
    },
    [activePackId, activeBatchId, controlledBatchId, controlledPackId, initialPack.batchId, initialPackId, pack.batchId, pack.packId],
  )

  useEffect(() => {
    if (!useLive) return
    if (batchPacks.length === 0) return
    // Honor URL deep-link: never auto-reset away from the pinned pack while the
    // batch list / per-intent fan-out is still racing the direct pack fetch.
    // Without this guard, the batch pack (loaded first by the cheap list query)
    // would overwrite the per-intent pack the user actually clicked into.
    if (pinnedPackId && activePackId === pinnedPackId) return
    if (!batchPacks.some((p) => p.packId === activePackId)) {
      setActivePackId(batchPacks[0].packId)
    }
  }, [useLive, batchPacks, activePackId, pinnedPackId])

  useEffect(() => {
    if (useLive) return
    const inBatch = batchPacks.some((p) => p.packId === activePackId)
    if (!inBatch && batchPacks[0]) setActivePackId(batchPacks[0].packId)
  }, [useLive, activeBatchId, batchPacks, activePackId])

  const [zoom, setZoom] = useState(100)
  const [collapsed, setCollapsed] = useState(false)
  const [highlightMissing, setHighlightMissing] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SelectedNode>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const rootBtnRef = useRef<HTMLButtonElement>(null)

  const intermediateForLeaf = useMemo(() => {
    const map = new Map<string, IntermediateNode>()
    for (const inter of pack.intermediates) {
      for (const leafId of inter.derivedFrom) map.set(leafId, inter)
    }
    return map
  }, [pack.intermediates])

  // Lineage = the set of node ids that should stay highlighted when a node is selected.
  // (Selecting a leaf highlights leaf → its intermediate → root; selecting an intermediate
  // highlights its leaves → itself → root; selecting root keeps everything bright.)
  const lineage = useMemo<Set<string> | null>(() => {
    if (!selected) return null
    if (selected.kind === 'root') return null
    if (selected.kind === 'intermediate') {
      return new Set<string>(['root', selected.node.id, ...selected.node.derivedFrom])
    }
    const inter = intermediateForLeaf.get(selected.node.id)
    return new Set<string>(['root', selected.node.id, ...(inter ? [inter.id] : [])])
  }, [selected, intermediateForLeaf])

  const matchesSearch = useCallback(
    (text: string): boolean => {
      const q = search.trim().toLowerCase()
      return q.length > 0 && text.toLowerCase().includes(q)
    },
    [search],
  )

  // Aggregated values across sampled packs in the batch (header + chips).
  const batchAggregate = useMemo(() => {
    if (batchPacks.length === 0) {
      return { defensibility: 0, valid: 0, missing: 0, invalid: 0, total: 0, status: 'verified' as const }
    }
    const defensibility = Math.round(
      batchPacks.reduce((sum, p) => sum + p.defensibilityScore, 0) / batchPacks.length,
    )
    let valid = 0, missing = 0, invalid = 0, total = 0
    for (const p of batchPacks) {
      for (const l of p.leaves) {
        total++
        if (l.status === 'valid') valid++
        else if (l.status === 'missing') missing++
        else invalid++
      }
    }
    const hasInvalid = batchPacks.some((p) => p.root.status === 'invalid')
    const hasPartial = batchPacks.some((p) => p.root.status !== 'verified')
    const status: 'verified' | 'partial' | 'invalid' = hasInvalid ? 'invalid' : hasPartial ? 'partial' : 'verified'
    return { defensibility, valid, missing, invalid, total, status }
  }, [batchPacks])

  const displayDefensibility = batchAggregate.defensibility
  const displayCounts = {
    valid: batchAggregate.valid,
    missing: batchAggregate.missing,
    invalid: batchAggregate.invalid,
  }
  const displayStatus = batchAggregate.status
  const displayStatusLabel = displayStatus === 'verified' ? 'Verified' : displayStatus === 'partial' ? 'Partial' : 'Invalid'
  const displayStatusDot = displayStatus === 'verified' ? 'bg-[#4ADE80]' : displayStatus === 'partial' ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'

  const handleCopy = useCallback((key: string, value: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1400)
    })
  }, [])

  const handleLocateRoot = useCallback(() => {
    rootBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    setSelected({ kind: 'root', node: pack.root })
  }, [pack.root])

  const intelBatchOptions = useMemo(
    () => intelligenceBatchesForSelector(intelBatches, activeBatchId, tenantId),
    [intelBatches, activeBatchId, tenantId],
  )

  const batchMetaResolved = useMemo((): BatchMeta | undefined => {
    if (!useLive) return SAMPLE_BATCHES[activeBatchId]
    const row = intelBatches.find((b) => b.batch_id === activeBatchId)
    if (row) {
      return {
        batchId: row.batch_id,
        totalIntents: row.total_count,
        totalTransactions: row.total_count,
        receivedAt: new Date().toISOString(),
      }
    }
    if (activeBatchId) {
      return {
        batchId: activeBatchId,
        totalIntents: 0,
        totalTransactions: 0,
        receivedAt: new Date().toISOString(),
      }
    }
    return undefined
  }, [useLive, activeBatchId, intelBatches])

  return (
    <div className="space-y-5">
      {!embedMode ? (
      <header>
        <div className="flex items-center gap-3">
          <Link
            href="/payout-command-view/today?dock=proof"
            className="inline-flex items-center gap-1 rounded-full border border-[#E5E5E5] bg-white px-2.5 py-1 text-[15px] font-medium text-[#475569] transition hover:bg-[#fafafa]"
          >
            ← Evidence
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2.5 py-0.5 text-[14px] font-semibold uppercase tracking-[0.12em] text-[#6f716d]">
            <Glyph name="shield" className="h-2.5 w-2.5" />
            Proof lineage
          </span>
        </div>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-[#111111]">{evidenceCopy.graph.title}</h1>
        <p className="mt-1 max-w-2xl text-[17px] leading-relaxed text-[#6f716d]">{evidenceCopy.graph.subtitle}</p>
      </header>
      ) : null}

      {liveListError ? (
        <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[15px] text-amber-950">
          {liveListError}
        </div>
      ) : null}

      {!tenantReady && useLive ? (
        <section className="rounded-[16px] border border-slate-200 bg-white p-6 text-[15px] text-slate-600">
          Sign in to load evidence packs from your session tenant. Demo graph data is not shown in live mode.
        </section>
      ) : null}

      {tenantReady && livePackMissing ? (
        <section className="rounded-[16px] border border-slate-200 bg-white p-6">
          <LiveDataHint isLive={false} source="evidence" />
          <p className="mt-3 text-[15px] text-slate-600">
            {initialPackId?.trim()
              ? `Pack ${initialPackId} was not found for batch ${activeBatchId || '—'}. Confirm GET /v1/evidence/packs and pack detail for your tenant.`
              : `No evidence packs for batch ${activeBatchId || '—'}. Select a batch with ingested packs or open from the Evidence dock.`}
          </p>
        </section>
      ) : null}

      {showGraph ? (
      <>
      <section className={`flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[16px] border border-[#E5E5E5] bg-white px-5 py-3 ${embedMode ? 'text-[14px]' : ''}`}>
        {!hideScopePickers ? (
        <div>
            <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Batch</p>
            <select
              value={activeBatchId}
              onChange={(e) => {
                setActiveBatchId(e.target.value)
                setSelected(null)
              }}
              disabled={Boolean(apiTrimmedString(controlledBatchId))}
              className="mt-0.5 cursor-pointer rounded-[6px] border border-[#E5E5E5] bg-white px-1.5 py-0.5 font-mono text-[17px] font-semibold text-[#111111] outline-none transition hover:bg-[#fafafa]"
            >
              {useLive
                ? intelBatchOptions.map((b) => (
                    <option key={b.batch_id} value={b.batch_id}>
                      {b.batch_id}
                      {intelBatches.some((x) => apiTrimmedString(x.batch_id) === apiTrimmedString(b.batch_id))
                        ? ''
                        : ' (evidence)'}
                    </option>
                  ))
                : ALL_BATCH_IDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
            </select>
          </div>
        ) : apiTrimmedString(controlledBatchId) ? (
          <div>
            <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Batch</p>
            <p className="mt-0.5 font-mono text-[17px] font-semibold text-[#111111]">{activeBatchId || '—'}</p>
          </div>
        ) : null}
          {!hideScopePickers ? (
          <div>
            <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Intent · pack</p>
            {useLive ? (
              <select
                value={packSelectValue}
                onChange={(e) => {
                  setSelected(null)
                  void handlePackPickerChange(e.target.value)
                }}
                disabled={packOptions.length === 0}
                className="mt-0.5 min-w-[12rem] max-w-[24rem] cursor-pointer rounded-[6px] border border-[#E5E5E5] bg-white px-1.5 py-0.5 font-mono text-[15px] font-semibold text-[#111111] outline-none transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {packOptions.length === 0 ? (
                  <option value="" disabled>
                    No intents in this batch
                  </option>
                ) : (
                  <>
                    {!packOptions.some((o) => o.value === packSelectValue) ? (
                      <option value="" disabled>
                        Select intent…
                      </option>
                    ) : null}
                    {packOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </>
                )}
              </select>
            ) : (
              <select
                value={activePackId}
                onChange={(e) => {
                  setActivePackId(e.target.value)
                  setSelected(null)
                }}
                disabled={batchPacks.length === 0}
                className="mt-0.5 min-w-[12rem] max-w-[20rem] cursor-pointer rounded-[6px] border border-[#E5E5E5] bg-white px-1.5 py-0.5 font-mono text-[15px] font-semibold text-[#111111] outline-none transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {batchPacks.map((p) => (
                  <option key={p.packId} value={p.packId}>
                    {p.intentId} · {p.packId}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1 max-w-[20rem] text-[12px] leading-snug text-[#94a3b8]">
              {resolvingIntentId
                ? 'Loading evidence pack for the selected intent…'
                : 'Graph below is for this intent; metrics in the bar stay batch-aggregated.'}
            </p>
          </div>
          ) : null}
          <ContextField label="Intents" value={String(batchMetaResolved?.totalIntents ?? batchPacks.length)} />
          <ContextField label="Transactions" value={String(batchMetaResolved?.totalTransactions ?? 0)} />
          <ContextField
            label="Loaded packs"
            value={useLive ? `${batchPacks.length} from API` : `${batchPacks.length} sampled`}
          />
          <ContextField label="Contract" value={pack.contractId} mono />
          <ContextField label="Mode" value={pack.mode} />
        <div>
          <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Proof score</p>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="text-[24px] font-semibold leading-none tabular-nums text-[#111111]">{displayDefensibility}</span>
            <span className="text-[15px] text-[#94a3b8]">/ 100</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Status</p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2 py-0.5 text-[15px] font-semibold text-[#111111]">
            <span className={`h-1.5 w-1.5 rounded-full ${displayStatusDot}`} aria-hidden />
            {displayStatusLabel}
          </span>
        </div>

        {/* Status summary chips */}
        <div className="flex items-center gap-1.5">
          <SummaryChip dot="bg-[#4ADE80]" label="Valid" count={displayCounts.valid} />
          {displayCounts.missing > 0 ? <SummaryChip dot="bg-[#F59E0B]" label="Missing" count={displayCounts.missing} /> : null}
          {displayCounts.invalid > 0 ? <SummaryChip dot="bg-[#EF4444]" label="Invalid" count={displayCounts.invalid} /> : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            disabled={!useLive || manualRefreshing}
            title="Refresh evidence graph"
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-[15px] font-medium text-[#111111] transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Glyph name="refresh" className={`h-3.5 w-3.5 ${manualRefreshing ? 'animate-spin' : ''}`} />
            {manualRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => void handleExport('pdf')}
            disabled={Boolean(exporting) || !showGraph}
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-[15px] font-medium text-[#111111] transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}
          </button>
          <button
            type="button"
            onClick={() => void handleExport('json')}
            disabled={Boolean(exporting) || !showGraph}
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-[15px] font-medium text-[#111111] transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting === 'json' ? 'Exporting...' : 'Export JSON'}
          </button>
        </div>
      </section>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center gap-2 rounded-[16px] border border-[#E5E5E5] bg-white px-3 py-2.5">
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search node…"
            className="h-8 w-[14rem] rounded-[8px] border border-[#E5E5E5] bg-white pl-7 pr-2 text-[16px] outline-none transition placeholder:text-[#94a3b8] focus:border-[#111111]/40"
          />
          <Glyph name="search" className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-[#94a3b8]" />
        </div>

        <div className="flex items-center gap-1 rounded-[8px] border border-[#E5E5E5] bg-white px-1 py-0.5">
          <button type="button" onClick={() => setZoom((z) => Math.max(60, z - 10))} className="h-6 w-6 rounded-md text-[16px] font-semibold text-[#475569] hover:bg-[#fafafa]" aria-label="Zoom out">−</button>
          <span className="w-12 text-center text-[15px] tabular-nums text-[#475569]">{zoom}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(160, z + 10))} className="h-6 w-6 rounded-md text-[16px] font-semibold text-[#475569] hover:bg-[#fafafa]" aria-label="Zoom in">+</button>
          <button type="button" onClick={() => setZoom(100)} className="h-6 rounded-md px-1.5 text-[15px] font-medium text-[#475569] hover:bg-[#fafafa]">Reset</button>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-[15px] font-medium text-[#111111] transition hover:bg-[#fafafa]"
        >
          {collapsed ? 'Expand all' : 'Collapse'}
        </button>

        <button
          type="button"
          onClick={() => setHighlightMissing((h) => !h)}
          className={`inline-flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[15px] font-medium transition ${
            highlightMissing
              ? 'border-[#F59E0B] bg-[#FFFBEB] text-[#92400E]'
              : 'border-[#E5E5E5] bg-white text-[#111111] hover:bg-[#fafafa]'
          }`}
        >
          Highlight missing
        </button>

        <button
          type="button"
          onClick={handleLocateRoot}
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-[15px] font-medium text-[#111111] transition hover:bg-[#fafafa]"
        >
          <Glyph name="shield" className="h-3 w-3" />
          Locate root
        </button>

        {selected ? (
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-[15px] font-medium text-[#111111] transition hover:bg-[#fafafa]"
          >
            Clear selection
          </button>
        ) : null}

        <div className="ml-auto flex items-center gap-3 text-[14px] text-[#6f716d]">
          <Legend dot="bg-[#4ADE80]" label="Valid" />
          <Legend dot="bg-[#F59E0B]" label="Missing" />
          <Legend dot="bg-[#EF4444]" label="Invalid" />
          <Legend dot="bg-[#888888]" label="Derived" />
        </div>
      </section>

      {/* ── Graph canvas + side panel ───────────────────────────────── */}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <GraphCanvas
          pack={pack}
          zoom={zoom}
          collapsed={collapsed}
          highlightMissing={highlightMissing}
          matchesSearch={matchesSearch}
          selected={selected}
          lineage={lineage}
          onSelect={setSelected}
          rootBtnRef={rootBtnRef}
        />
        <SidePanel
          selected={selected}
          intermediateForLeaf={intermediateForLeaf}
          pack={pack}
          onSelect={setSelected}
          onCopy={handleCopy}
          copiedKey={copiedKey}
        />
      </section>

      {!embedMode ? (
      <BatchSummary
        batchMeta={batchMetaResolved}
        packs={batchPacks}
        onOpenPack={(packId) => {
          setActivePackId(packId)
          setSelected(null)
        }}
      />
      ) : null}
      </>
      ) : null}
    </div>
  )
}

// ─── Graph canvas (horizontal pill layout) ────────────────────────────────────

const PILL_W = 256
const PILL_H = 48
const ROOT_W = 272
const COL_GAP = 140
const ROW_GAP = 22
const PAD_X = 28
const PAD_Y = 32

function edgeColor(status: LeafStatus | 'derived'): string {
  if (status === 'valid') return '#4ADE80'
  if (status === 'missing') return '#F59E0B'
  if (status === 'invalid') return '#EF4444'
  return '#cfcfcf'
}

function GraphCanvas({
  pack,
  zoom,
  collapsed,
  highlightMissing,
  matchesSearch,
  selected,
  lineage,
  onSelect,
  rootBtnRef,
}: {
  pack: EvidencePackGraph
  zoom: number
  collapsed: boolean
  highlightMissing: boolean
  matchesSearch: (text: string) => boolean
  selected: SelectedNode
  lineage: Set<string> | null
  onSelect: (next: SelectedNode) => void
  rootBtnRef: React.RefObject<HTMLButtonElement | null>
}) {
  const layout = useMemo(() => {
    const leafX = PAD_X
    const leafPositions = new Map<string, { x: number; y: number }>()
    pack.leaves.forEach((leaf, i) => {
      leafPositions.set(leaf.id, { x: leafX, y: PAD_Y + i * (PILL_H + ROW_GAP) })
    })

    const interX = leafX + PILL_W + COL_GAP
    const interPositions = new Map<string, { x: number; y: number }>()
    pack.intermediates.forEach((inter) => {
      const ys = inter.derivedFrom
        .map((id) => leafPositions.get(id)?.y)
        .filter((y): y is number => typeof y === 'number')
      const y = ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : PAD_Y
      interPositions.set(inter.id, { x: interX, y })
    })

    const rootX = interX + PILL_W + COL_GAP
    const interYs = Array.from(interPositions.values()).map((p) => p.y)
    const rootY = interYs.length > 0 ? interYs.reduce((a, b) => a + b, 0) / interYs.length : PAD_Y

    const totalHeight = PAD_Y * 2 + pack.leaves.length * PILL_H + (pack.leaves.length - 1) * ROW_GAP
    const totalWidth = rootX + ROOT_W + PAD_X

    return { leafPositions, interPositions, rootPos: { x: rootX, y: rootY }, totalWidth, totalHeight }
  }, [pack])

  // Container width must include the scaled total width so horizontal scroll works at zoom > 100%.
  const scaledWidth = (layout.totalWidth * zoom) / 100
  const scaledHeight = (layout.totalHeight * zoom) / 100

  const isLeafSelected = (id: string) => selected?.kind === 'leaf' && selected.node.id === id
  const isInterSelected = (id: string) => selected?.kind === 'intermediate' && selected.node.id === id
  const isRootSelected = selected?.kind === 'root'

  // Helper: should this node be dimmed?
  const dimNode = (kind: 'leaf' | 'intermediate' | 'root', id: string, leafStatus?: LeafStatus): boolean => {
    if (lineage && !lineage.has(id)) return true
    if (highlightMissing && kind === 'leaf' && leafStatus !== 'missing') return true
    return false
  }

  // Helper: should this edge be dimmed?
  const dimEdge = (leafId: string, interId: string, leafStatus: LeafStatus): boolean => {
    if (lineage) {
      // Edge is in lineage if BOTH endpoints are in lineage.
      if (!(lineage.has(leafId) && lineage.has(interId))) return true
    }
    if (highlightMissing && leafStatus !== 'missing') return true
    return false
  }

  const dimRootEdge = (interId: string): boolean => {
    if (lineage) return !(lineage.has(interId) && lineage.has('root'))
    return false
  }

  return (
    <div
      className="relative overflow-auto rounded-[16px] border border-[#E5E5E5]"
      style={{
        backgroundColor: '#fafafa',
        backgroundImage:
          'linear-gradient(to right, rgba(15,23,42,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.05) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      {/* Outer wrapper sized to scaled dimensions so scroll bounds are correct. */}
      <div style={{ width: scaledWidth, height: scaledHeight, position: 'relative' }}>
        <div
          className="absolute left-0 top-0"
          style={{
            width: layout.totalWidth,
            height: layout.totalHeight,
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top left',
          }}
        >
          {/* SVG connector layer */}
          <svg
            className="pointer-events-none absolute inset-0"
            width={layout.totalWidth}
            height={layout.totalHeight}
            aria-hidden
          >
            <defs>
              {(['#4ADE80', '#F59E0B', '#EF4444', '#cfcfcf'] as const).map((c) => (
                <marker
                  key={c}
                  id={`arrow-${c.replace('#', '')}`}
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="4"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L6,4 L0,8 Z" fill={c} />
                </marker>
              ))}
            </defs>

            {/* Leaf → intermediate edges */}
            {!collapsed &&
              pack.intermediates.flatMap((inter) => {
                const target = layout.interPositions.get(inter.id)
                if (!target) return []
                return inter.derivedFrom.map((leafId) => {
                  const leaf = pack.leaves.find((l) => l.id === leafId)
                  const source = layout.leafPositions.get(leafId)
                  if (!leaf || !source) return null
                  const color = edgeColor(leaf.status)
                  const dim = dimEdge(leafId, inter.id, leaf.status)
                  const inLineage = lineage?.has(leafId) && lineage?.has(inter.id)
                  return (
                    <CurvedEdge
                      key={`${inter.id}-${leafId}`}
                      from={{ x: source.x + PILL_W, y: source.y + PILL_H / 2 }}
                      to={{ x: target.x, y: target.y + PILL_H / 2 }}
                      color={color}
                      dim={dim}
                      thick={Boolean(inLineage)}
                    />
                  )
                })
              })}

            {/* Intermediate → root edges */}
            {pack.intermediates.map((inter) => {
              const source = layout.interPositions.get(inter.id)
              if (!source) return null
              const allValid = inter.derivedFrom.every(
                (id) => pack.leaves.find((l) => l.id === id)?.status === 'valid',
              )
              const color = allValid ? '#4ADE80' : '#F59E0B'
              const dim = dimRootEdge(inter.id)
              const inLineage = lineage?.has(inter.id) && lineage?.has('root')
              return (
                <CurvedEdge
                  key={`root-${inter.id}`}
                  from={{ x: source.x + PILL_W, y: source.y + PILL_H / 2 }}
                  to={{ x: layout.rootPos.x, y: layout.rootPos.y + PILL_H / 2 }}
                  color={color}
                  dim={dim}
                  thick={Boolean(inLineage)}
                />
              )
            })}
          </svg>

          {/* Column labels */}
          <div className="absolute left-0 right-0 top-2 flex justify-between px-7 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">
            <span>Evidence items</span>
            <span>Intermediate hashes</span>
            <span>Merkle root</span>
          </div>

          {/* Leaves */}
          {!collapsed &&
            pack.leaves.map((leaf) => {
              const pos = layout.leafPositions.get(leaf.id)
              if (!pos) return null
              const hit = matchesSearch(leaf.name) || matchesSearch(leaf.hashShort) || matchesSearch(leaf.artifact)
              const dim = dimNode('leaf', leaf.id, leaf.status)
              return (
                <LeafPill
                  key={leaf.id}
                  node={leaf}
                  x={pos.x}
                  y={pos.y}
                  selected={isLeafSelected(leaf.id)}
                  onClick={() => onSelect({ kind: 'leaf', node: leaf })}
                  dim={dim}
                  highlight={hit}
                />
              )
            })}

          {/* Intermediates */}
          {pack.intermediates.map((inter) => {
            const pos = layout.interPositions.get(inter.id)
            if (!pos) return null
            const hit = matchesSearch(inter.hashShort) || matchesSearch(inter.id)
            const dim = dimNode('intermediate', inter.id)
            return (
              <IntermediatePill
                key={inter.id}
                node={inter}
                leafLookup={pack.leaves}
                x={pos.x}
                y={pos.y}
                selected={isInterSelected(inter.id)}
                onClick={() => onSelect({ kind: 'intermediate', node: inter })}
                highlight={hit}
                dim={dim}
              />
            )
          })}

          {/* Root */}
          <RootPill
            ref={rootBtnRef}
            node={pack.root}
            x={layout.rootPos.x}
            y={layout.rootPos.y}
            selected={isRootSelected}
            onClick={() => onSelect({ kind: 'root', node: pack.root })}
            highlight={matchesSearch('merkle root') || matchesSearch(pack.root.hashShort)}
            dim={dimNode('root', 'root')}
          />
        </div>
      </div>
    </div>
  )
}

function CurvedEdge({
  from,
  to,
  color,
  dim,
  thick,
}: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  color: string
  dim: boolean
  thick: boolean
}) {
  const dx = (to.x - from.x) * 0.5
  const path = `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
  return (
    <path
      d={path}
      stroke={color}
      strokeWidth={thick ? 2.75 : 1.75}
      fill="none"
      opacity={dim ? 0.12 : 1}
      markerEnd={`url(#arrow-${color.replace('#', '')})`}
    />
  )
}

function LeafPill({
  node,
  x,
  y,
  selected,
  onClick,
  dim,
  highlight,
}: {
  node: LeafNode
  x: number
  y: number
  selected: boolean
  onClick: () => void
  dim: boolean
  highlight: boolean
}) {
  const dot =
    node.status === 'valid' ? 'bg-[#4ADE80]' : node.status === 'missing' ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'
  const border =
    node.status === 'valid'
      ? 'border-[#E5E5E5]'
      : node.status === 'missing'
        ? 'border-[#F59E0B]'
        : 'border-[#EF4444]'
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${node.name} · ${node.hashFull}`}
      style={{ left: x, top: y, width: PILL_W, height: PILL_H }}
      className={`absolute flex items-center gap-2.5 rounded-full border bg-white pl-2.5 pr-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition ${border} ${
        selected ? 'ring-2 ring-[#4ADE80] ring-offset-2 ring-offset-[#fafafa]' : 'hover:border-[#cfcfcf] hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]'
      } ${dim ? 'opacity-25' : ''} ${highlight ? 'shadow-[0_0_0_3px_#F59E0B]' : ''}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fafafa] text-[#475569]">
        <Glyph name={node.iconName} className="h-3.5 w-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[16px] font-semibold text-[#111111]">{node.name}</span>
        <span className="truncate font-mono text-[14px] text-[#6f716d]">{node.hashShort}</span>
      </span>
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
    </button>
  )
}

function IntermediatePill({
  node,
  leafLookup,
  x,
  y,
  selected,
  onClick,
  highlight,
  dim,
}: {
  node: IntermediateNode
  leafLookup: LeafNode[]
  x: number
  y: number
  selected: boolean
  onClick: () => void
  highlight: boolean
  dim: boolean
}) {
  const fromNames = node.derivedFrom
    .map((id) => leafLookup.find((l) => l.id === id)?.name ?? id)
    .join(' + ')
  const allValid = node.derivedFrom.every(
    (id) => leafLookup.find((l) => l.id === id)?.status === 'valid',
  )
  const dotColor = allValid ? 'bg-[#4ADE80]' : 'bg-[#F59E0B]'
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ left: x, top: y, width: PILL_W, height: PILL_H }}
      title={`Combined hash · From: ${fromNames}`}
      className={`absolute flex items-center gap-2.5 rounded-full border bg-white pl-2.5 pr-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition ${
        selected ? 'border-[#888888] ring-2 ring-[#888888]/30' : 'border-[#E5E5E5] hover:border-[#cfcfcf] hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]'
      } ${dim ? 'opacity-25' : ''} ${highlight ? 'shadow-[0_0_0_3px_#F59E0B]' : ''}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fafafa] text-[#475569]">
        <Glyph name="lock" className="h-3.5 w-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-[14px] font-semibold uppercase tracking-[0.1em] text-[#6f716d]">Combined</span>
        <span className="truncate font-mono text-[16px] font-semibold text-[#111111]">{node.hashShort}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fafafa] px-1.5 py-0.5 font-mono text-[13px] text-[#6f716d]">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden />
        {node.derivedFrom.length}
      </span>
    </button>
  )
}

type RootPillProps = {
  node: RootNode
  x: number
  y: number
  selected: boolean
  onClick: () => void
  highlight: boolean
  dim: boolean
}

const RootPill = forwardRef<HTMLButtonElement, RootPillProps>(function RootPill(
  { node, x, y, selected, onClick, highlight, dim },
  ref,
) {
  const dot =
    node.status === 'verified' ? 'bg-[#4ADE80]' : node.status === 'partial' ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      title={`Merkle Root · ${node.hashFull}`}
      style={{ left: x, top: y, width: ROOT_W, height: PILL_H }}
      className={`absolute flex items-center gap-2.5 rounded-full border bg-[#0f172a] pl-2.5 pr-3 text-left text-white shadow-[0_4px_14px_rgba(15,23,42,0.18)] transition ${
        selected ? 'ring-2 ring-[#4ADE80] ring-offset-2 ring-offset-[#fafafa]' : 'border-[#0f172a]'
      } ${dim ? 'opacity-25' : ''} ${highlight ? 'shadow-[0_0_0_3px_#F59E0B]' : ''}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[#4ADE80]">
        <Glyph name="shield" className="h-3.5 w-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-[14px] font-semibold uppercase tracking-[0.12em] text-white/55">Proof Root</span>
        <span className="truncate font-mono text-[16px] font-semibold tabular-nums">{node.hashShort}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[14px] font-semibold capitalize text-white">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
        {node.status}
      </span>
    </button>
  )
})

// ─── Sub-components ───────────────────────────────────────────────────────────

function ContextField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">{label}</p>
      <p className={`text-[17px] font-semibold text-[#111111] ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  )
}

function SummaryChip({ dot, label, count }: { dot: string; label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2 py-0.5 text-[15px] font-semibold text-[#475569]">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      <span className="tabular-nums">{count}</span>
      <span className="text-[#6f716d]">{label}</span>
    </span>
  )
}

// ─── Side panel ───────────────────────────────────────────────────────────────

function SidePanel({
  selected,
  intermediateForLeaf,
  pack,
  onSelect,
  onCopy,
  copiedKey,
}: {
  selected: SelectedNode
  intermediateForLeaf: Map<string, IntermediateNode>
  pack: EvidencePackGraph
  onSelect: (next: SelectedNode) => void
  onCopy: (key: string, value: string) => void
  copiedKey: string | null
}) {
  if (!selected) {
    return (
      <aside className="rounded-[16px] border border-[#E5E5E5] bg-white p-5">
        <p className="text-[17px] font-semibold text-[#111111]">Node details</p>
        <p className="mt-1 text-[15px] text-[#6f716d]">
          Click any node to inspect the artifact, hash, source, and verification status.
        </p>
        <div className="mt-4 rounded-[10px] border border-dashed border-[#cfcfcf] bg-[#fafafa] p-4 text-center text-[15px] text-[#94a3b8]">
          No node selected
        </div>
        <p className="mt-4 text-[14px] uppercase tracking-[0.12em] text-[#94a3b8]">Tip</p>
        <p className="mt-1 text-[15px] leading-relaxed text-[#6f716d]">
          Selecting a leaf highlights its lineage all the way to the Merkle root. Use{' '}
          <span className="font-semibold text-[#111111]">Locate root</span> to jump to the apex.
        </p>
      </aside>
    )
  }

  if (selected.kind === 'leaf') {
    const inter = intermediateForLeaf.get(selected.node.id)
    const dot =
      selected.node.status === 'valid' ? 'bg-[#4ADE80]' : selected.node.status === 'missing' ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'
    return (
      <aside className="rounded-[16px] border border-[#E5E5E5] bg-white p-5">
        <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">{evidenceCopy.nodeDrawer.proofItem}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fafafa] text-[#475569]">
            <Glyph name={selected.node.iconName} className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[20px] font-semibold text-[#111111]">{selected.node.name}</p>
            <p className="truncate font-mono text-[12px] text-[#94a3b8]">
              {evidenceCopy.nodeDrawer.technicalName}: {selected.node.itemType}
            </p>
            <p className="truncate text-[15px] text-[#6f716d]">{selected.node.artifact}</p>
          </div>
        </div>

        <Field
          label={evidenceCopy.nodeDrawer.status}
          value={
            selected.node.status === 'valid'
              ? 'Verified'
              : selected.node.status === 'missing'
                ? 'Missing'
                : 'Invalid'
          }
        />
        <Field label={evidenceCopy.nodeDrawer.source} value={selected.node.source} />
        <Field label={evidenceCopy.nodeDrawer.createdAt} value={selected.node.receivedAt} />
        <Field label={evidenceCopy.nodeDrawer.usedInPack} value="Yes" />
        <Field
          label={evidenceCopy.nodeDrawer.risk}
          value={selected.node.status === 'missing' ? 'Incomplete proof' : 'None'}
        />
        {selected.node.status === 'missing' ? (
          <p className="mt-2 text-[14px] leading-relaxed text-amber-900">{evidenceCopy.nodeDrawer.missingHint}</p>
        ) : null}

        <Field label="Item type" value={selected.node.itemType} mono />
        <Field label="Stable ref" value={selected.node.stableRef} mono />
        <Field label="Version" value={selected.node.version} mono />
        <Field label="Source service" value={selected.node.sourceService} mono />
        <CopyableField label={evidenceCopy.nodeDrawer.hash} value={selected.node.hashFull} keyId={`leaf-${selected.node.id}-hash`} onCopy={onCopy} copiedKey={copiedKey} />
        <CopyableField label="Leaf hash · SHA256(type ‖ stable_ref ‖ item_hash ‖ version)" value={selected.node.leafHash} keyId={`leaf-${selected.node.id}-leafhash`} onCopy={onCopy} copiedKey={copiedKey} />
        <Field label="Source" value={selected.node.source} />
        <Field label="Received" value={selected.node.receivedAt} />

        <div className="mt-3">
          <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Verification</p>
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2 py-0.5 text-[15px] font-semibold capitalize text-[#111111]">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
            {selected.node.status}
          </p>
        </div>

        <div className="mt-3">
          <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Impact</p>
          <p className="mt-1 text-[16px] leading-relaxed text-[#475569]">{selected.node.impact}</p>
        </div>

        {/* Lineage trace */}
        <div className="mt-4 rounded-[10px] border border-[#E5E5E5] bg-[#fafafa] p-3">
          <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Lineage</p>
          <ol className="mt-2 space-y-1.5 text-[15px]">
            <li className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
              <span className="font-semibold text-[#111111]">{selected.node.name}</span>
              <span className="font-mono text-[14px] text-[#6f716d]">{selected.node.hashShort}</span>
            </li>
            {inter ? (
              <li className="flex items-center gap-2 pl-3">
                <span className="text-[#cfcfcf]">↳</span>
                <button
                  type="button"
                  onClick={() => onSelect({ kind: 'intermediate', node: inter })}
                  className="font-semibold text-[#111111] underline-offset-2 hover:underline"
                >
                  Combined hash
                </button>
                <span className="font-mono text-[14px] text-[#6f716d]">{inter.hashShort}</span>
              </li>
            ) : null}
            <li className="flex items-center gap-2 pl-6">
              <span className="text-[#cfcfcf]">↳</span>
              <button
                type="button"
                onClick={() => onSelect({ kind: 'root', node: pack.root })}
                className="font-semibold text-[#111111] underline-offset-2 hover:underline"
              >
                Merkle root
              </button>
              <span className="font-mono text-[14px] text-[#6f716d]">{pack.root.hashShort}</span>
            </li>
          </ol>
        </div>

        <button
          type="button"
          className="mt-4 w-full rounded-[8px] bg-[#111111] px-3 py-2 text-[15px] font-semibold text-white transition hover:bg-black"
        >
          View JSON
        </button>
      </aside>
    )
  }

  if (selected.kind === 'intermediate') {
    return (
      <aside className="rounded-[16px] border border-[#E5E5E5] bg-white p-5">
        <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Intermediate hash</p>
        <p className="mt-1 text-[20px] font-semibold text-[#111111]">Combined hash</p>
        <p className="text-[15px] text-[#6f716d]">Derived from {selected.node.derivedFrom.length} artifacts</p>

        <CopyableField
          label="Hash"
          value={selected.node.hashFull}
          keyId={`inter-${selected.node.id}-hash`}
          onCopy={onCopy}
          copiedKey={copiedKey}
        />

        <div className="mt-3">
          <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Derived from</p>
          <ul className="mt-1 space-y-1">
            {selected.node.derivedFrom.map((id) => {
              const leaf = pack.leaves.find((l) => l.id === id)
              if (!leaf) return null
              const dot =
                leaf.status === 'valid' ? 'bg-[#4ADE80]' : leaf.status === 'missing' ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ kind: 'leaf', node: leaf })}
                    className="flex w-full items-center gap-2 rounded-[8px] border border-[#E5E5E5] bg-[#fafafa] px-2 py-1.5 text-left transition hover:bg-white"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
                    <span className="text-[15px] font-medium text-[#111111]">{leaf.name}</span>
                    <span className="ml-auto font-mono text-[14px] text-[#6f716d]">{leaf.hashShort}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="mt-3">
          <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Rolls up to</p>
          <button
            type="button"
            onClick={() => onSelect({ kind: 'root', node: pack.root })}
            className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-white px-2 py-0.5 text-[15px] font-semibold text-[#111111] transition hover:bg-[#fafafa]"
          >
            <Glyph name="shield" className="h-3 w-3" />
            Merkle root
          </button>
        </div>
      </aside>
    )
  }

  // root
  const dot =
    selected.node.status === 'verified' ? 'bg-[#4ADE80]' : selected.node.status === 'partial' ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'
  return (
    <aside className="rounded-[16px] border border-[#E5E5E5] bg-white p-5">
      <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Merkle root</p>
      <p className="mt-1 text-[20px] font-semibold text-[#111111]">Verified composite hash</p>

      <CopyableField label="Full hash" value={selected.node.hashFull} keyId="root-hash" onCopy={onCopy} copiedKey={copiedKey} />

      <div className="mt-3">
        <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Verified</p>
        <p className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2 py-0.5 text-[15px] font-semibold capitalize text-[#111111]">
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
          {selected.node.status === 'verified' ? 'Yes' : selected.node.status}
        </p>
      </div>

      <div className="mt-3">
        <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Tamper status</p>
        <p className="mt-1 text-[16px] leading-relaxed text-[#475569]">
          {selected.node.tamper === 'no-changes' ? 'No changes detected — pack hash matches sealed state.' : 'Changes detected — at least one underlying artifact has been altered or is missing.'}
        </p>
      </div>

      {/* Branches summary */}
      <div className="mt-4 rounded-[10px] border border-[#E5E5E5] bg-[#fafafa] p-3">
        <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Branches</p>
        <ul className="mt-2 space-y-1.5">
          {pack.intermediates.map((inter) => {
            const allValid = inter.derivedFrom.every(
              (id) => pack.leaves.find((l) => l.id === id)?.status === 'valid',
            )
            const branchDot = allValid ? 'bg-[#4ADE80]' : 'bg-[#F59E0B]'
            return (
              <li key={inter.id}>
                <button
                  type="button"
                  onClick={() => onSelect({ kind: 'intermediate', node: inter })}
                  className="flex w-full items-center gap-2 text-left text-[15px] hover:underline"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${branchDot}`} aria-hidden />
                  <span className="font-mono text-[14px] text-[#111111]">{inter.hashShort}</span>
                  <span className="ml-auto text-[14px] text-[#6f716d]">{inter.derivedFrom.length} leaves</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mt-3">
      <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">{label}</p>
      <p className={`mt-1 text-[16px] text-[#475569] ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

function CopyableField({
  label,
  value,
  keyId,
  onCopy,
  copiedKey,
}: {
  label: string
  value: string
  keyId: string
  onCopy: (key: string, value: string) => void
  copiedKey: string | null
}) {
  const copied = copiedKey === keyId
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">{label}</p>
        <button
          type="button"
          onClick={() => onCopy(keyId, value)}
          className="inline-flex items-center gap-1 rounded-[6px] border border-[#E5E5E5] bg-white px-1.5 py-0.5 text-[14px] font-medium text-[#475569] transition hover:bg-[#fafafa]"
        >
          <Glyph name={copied ? 'check' : 'copy'} className="h-2.5 w-2.5" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-1 break-all rounded-[8px] border border-[#E5E5E5] bg-[#fafafa] px-2 py-1.5 font-mono text-[14px] leading-relaxed text-[#475569]">
        {value}
      </p>
    </div>
  )
}

// ─── Batch summary view ───────────────────────────────────────────────────────

function BatchSummary({
  batchMeta,
  packs,
  onOpenPack,
}: {
  batchMeta: BatchMeta | undefined
  packs: EvidencePackGraph[]
  onOpenPack: (packId: string) => void
}) {
  if (!batchMeta) {
    return (
      <section className="rounded-[16px] border border-[#E5E5E5] bg-white p-6 text-[15px] text-[#6f716d]">
        Batch not found.
      </section>
    )
  }
  if (packs.length === 0) {
    return (
      <section className="rounded-[16px] border border-[#E5E5E5] bg-white p-6 text-[15px] text-[#6f716d]">
        No evidence packs loaded for batch <span className="font-mono">{batchMeta.batchId}</span>.
      </section>
    )
  }
  return (
    <section className="rounded-[16px] border border-[#E5E5E5] bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Batch</p>
          <p className="mt-0.5 font-mono text-[20px] font-semibold text-[#111111]">{batchMeta.batchId}</p>
        </div>
        <div className="flex items-center gap-4 text-[14px] text-[#6f716d]">
          <span><span className="font-semibold text-[#111111] tabular-nums">{batchMeta.totalIntents.toLocaleString()}</span> intents</span>
          <span><span className="font-semibold text-[#111111] tabular-nums">{batchMeta.totalTransactions.toLocaleString()}</span> transactions</span>
          <span>
            Showing <span className="font-semibold text-[#111111] tabular-nums">{packs.length}</span> of <span className="tabular-nums">{batchMeta.totalIntents.toLocaleString()}</span> evidence packs
          </span>
        </div>
      </div>

      <p className="mt-2 text-[13px] text-[#94a3b8]">
        Each intent in this batch has its own evidence pack — Service 6 commits one pack per lifecycle, never per batch.
      </p>

      <ul className="mt-4 grid gap-2">
        {packs.map((p) => {
          const valid = p.leaves.filter((l) => l.status === 'valid').length
          const missing = p.leaves.filter((l) => l.status === 'missing').length
          const invalid = p.leaves.filter((l) => l.status === 'invalid').length
          const dot = p.root.status === 'verified' ? 'bg-[#4ADE80]' : p.root.status === 'partial' ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'
          return (
            <li key={p.packId}>
              <button
                type="button"
                onClick={() => onOpenPack(p.packId)}
                className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto] items-center gap-3 rounded-[10px] border border-[#E5E5E5] bg-[#fafafa] px-3 py-2.5 text-left transition hover:bg-white"
              >
                <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[16px] font-semibold text-[#111111]">{p.packId}</span>
                  <span className="block truncate font-mono text-[13px] text-[#6f716d]">Intent {p.intentId} · {p.contractId}</span>
                </span>
                <span className="inline-flex items-center rounded-full border border-[#E5E5E5] bg-white px-2 py-0.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#475569]">
                  {p.mode.replace(/_/g, ' ')}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-white px-2 py-0.5 text-[14px] font-semibold text-[#111111]">
                  <span className="tabular-nums">{p.defensibilityScore}</span>
                  <span className="text-[12px] text-[#94a3b8]">/100</span>
                </span>
                <span className="flex items-center gap-1 text-[13px] text-[#6f716d]">
                  <SummaryChip dot="bg-[#4ADE80]" label="Valid" count={valid} />
                  {missing > 0 ? <SummaryChip dot="bg-[#F59E0B]" label="Missing" count={missing} /> : null}
                  {invalid > 0 ? <SummaryChip dot="bg-[#EF4444]" label="Invalid" count={invalid} /> : null}
                </span>
                <span className="text-[14px] font-medium text-[#475569]">Show graph →</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
