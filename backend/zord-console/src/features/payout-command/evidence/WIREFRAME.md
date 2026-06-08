# Evidence & Dispute Resolution — Wireframes

**List route:** `/payout-command-view/today?dock=proof&batch_id={batchId}`  
**Drill-down:** `/payout-command-view/evidence-pack/{packId}?tab=graph&batch_id={batchId}`

**APIs (session tenant injected by BFF):**

| UI | BFF | Upstream |
|----|-----|----------|
| Table rows | `GET /api/prod/evidence/batch/:batchId/intents` | `GET /v1/evidence/batch/:batchId/intents` |
| Graph timeline rail | `GET /api/prod/evidence/packs/:packId/timeline` | `GET /v1/evidence/packs/:packId/timeline` |
| Verify card | `POST /api/prod/evidence/packs/:packId/verify` | `POST /v1/evidence/packs/:packId/verify` |

---

## Page 1 — Evidence table (list)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Evidence & Dispute Resolution                    [Workspace] [Export]    │
├──────────────────────────────────────────────────────────────────────────┤
│ [Search]              Batch [ 22 ▼ ]        Intent [ All intents ▼ ]     │
│ KPI strip · proof breakdown · charts                                     │
├──────────────────────────────────────────────────────────────────────────┤
│ Evidence Pack Browser                                                    │
├──────────────┬────────┬──────────────┬────────────┬──────────┬───────────┤
│ Evidence Pack│ Batch  │ Intent       │ Payment Ref│ Decisions│ Action    │
├──────────────┼────────┼──────────────┼────────────┼──────────┼───────────┤
│ ep_1ae826…   │ 22     │ 2675eb67…    │ ZORD_501999│ Gov/Match│ View graph│
└──────────────┴────────┴──────────────┴────────────┴──────────┴───────────┘
```

**Implementation:** [`EvidenceSurface`](EvidenceSurface.tsx) + [`EvidencePackBrowser`](components/EvidencePackBrowser.tsx) + [`getEvidencePacksForBatchIntents`](../../../../services/payout-command/prod-api/getEvidencePacksForBatchIntents.ts).

---

## Page 2 — Drill-down (graph tab)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Evidence & Dispute Resolution                                          │
│ ep_c25f736a-…                                                            │
│ [Summary] [Timeline] [Items] [Graph*] [Export]                           │
├──────────────────────────────────────────────────────────────────────────┤
│ Context: Batch 22 · Intent 967085c0-…                                    │
├─────────────────────────────┬────────────────────────────────────────────┤
│ Operational proof timeline  │ Merkle lineage graph (embed)               │
│ ● events from timeline API  │                                            │
│                             │                                            │
│ Cryptographic verification  │                                            │
│ [Verify proof integrity]    │                                            │
│ Status + explanation card   │                                            │
└─────────────────────────────┴────────────────────────────────────────────┘
```

**Implementation:** [`EvidencePackGraphTab`](../../../evidence-pack/[packId]/_components/EvidencePackGraphTab.tsx) + [`EvidencePackProofRail`](components/EvidencePackProofRail.tsx) + [`EvidencePackVerifyCard`](components/EvidencePackVerifyCard.tsx) + [`MerkleGraphSurface`](../surfaces/MerkleGraphSurface.tsx).
