# Payment Batch Review — Wireframe

**Routes:** `/payout-command-view/batch-command-center`, `/sandbox/batch-command-center`

---

## Section order (top → bottom)

```
┌ Payout shell nav (unchanged) ─────────────────────────────────────────┐
├ Page title: Payment Batch Review + subtitle ─────────────────────────┤
├ Toolbar: [Upload Payment File] [Upload Bank/Settlement] [Create Manually] │
│           Live hint · Synced · [Payment journal] [Settlement journal] [↻][Share] │
├ Workspace bar: Company (tenant suffix) · Environment · Current batch │
│           [Select batch] [Refresh]                                      │
├ Advanced details (collapsed): SessionTenantScopeBar ──────────────────┤
├ Batch Intake: source type, partner, batch reference, reprocess, API key │
│   Side-by-side upload cards (Step 1 payment file · Step 2 confirmation) │
├ File processing status (progress list) ───────────────────────────────┤
├ Batch Progress (6-step payment proof pipeline) ────────────────────────┤
├ Payment Status Breakdown (pie chart) ───────────────────────────────────┤
├ Review Items table + [Review in Intent Engine] → failures tab ──────────┤
└ (no settlement summary card) ──────────────────────────────────────────┘
```

---

## Upload success dialogs

| Trigger | Dialog copy |
|---------|-------------|
| Payment file ingest OK | “Payment file uploaded” — batch id + optional journal link |
| Settlement ingest OK | “Confirmation file uploaded” — batch id + settlement journal link |

---

## Banned visible UI terms

`intent-engine`, `intelligence`, `close readiness`, `sign-off`, `disbursement processing`, `Fetch tenant id` on main surface, `0.0%` with zero denominator.

---

## Mobile

Workspace → Advanced (collapsed) → intake config → stacked upload cards → monitoring sections stacked.

---

## Implementation checklist

- [x] `batchCommandCenterCopy.ts`
- [x] `BatchWorkspaceBar` + `BatchAdvancedDetails`
- [x] `BatchIngestSuccessDialog`
- [x] Intake relabel + `#batch-intake-step-1` / `#batch-intake-step-2`
- [x] `derivePaymentProofTimeline` + `BatchProgressPanel`
- [x] File processing status rows in `deriveBatchPortalProgress`
- [x] Payment status breakdown + review table (no health banner / KPI grid / `SettlementStatusCard`)
- [x] E2E heading assertion
