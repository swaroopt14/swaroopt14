# Payout Command View (`/payout-command-view/today` & `/sandbox`) — API data map

Both routes render `PayoutCommandViewClient` with the same dock surfaces; only `EnvironmentProvider` mode (`live` vs `sandbox`) differs. Session tenant (`useSessionTenantId`) scopes `/api/prod/*` calls the same way in both.

## Home dock — `HomeSurface`

| UI region | Source | Console / upstream route |
|-----------|--------|----------------------------|
| Hero “Total Disbursement Value” (settled subset) | Leakage KPI | `GET /api/prod/intelligence/leakage` → zord-intelligence `/v1/intelligence/leakage` |
| Hero subtitle (intended) | Same | `total_intended_amount_minor` on leakage payload |
| Action panel headline (₹ exposure) | Leakage | unmatched + under_settlement + reversal from leakage |
| Action panel copy | Patterns / leakage / ambiguity | `GET /api/prod/intelligence/patterns`, leakage, `GET /api/prod/intelligence/ambiguity` |
| Trend chart (bars / lines) | Disbursement trend | `GET /api/prod/home/disbursement-trend?tenant_id=…&range=…` |
| KPI cards (2×2) | Intelligence dashboards | `leakage`, `defensibility`, `patterns`, `recommendations`, `ambiguity` via `useIntelligenceKpis` → `/api/prod/intelligence/{leakage,defensibility,patterns,recommendations,ambiguity}` |
| Period strip (Today / Week / Month / year chips, quarter grid) | **Local UI only** | Labels from `buildHomeTimeframeLayout` — not financial data |
| Ask Zord prompt strip | **UX only** | Quick prompts update scenario copy; responses are scripted from scenario text, not a chat API |

**Decoupled from mock math:** animated `buildSimulatedHomeOverviewSnapshot` + interval tick were removed from `useHomeState`. `snapshot` is now a **static shell** (`buildStaticHomeOverviewSnapshot`) for timeframe labels only — no sine-wave chart series.

## Intent Journal dock — `IntentJournalSurface`

| UI region | Source | Route |
|-----------|--------|--------|
| Sidebar batches | Intelligence batch list | `GET /api/prod/intelligence/batches` |
| Batch KPI / overview | Batch detail + patterns | `GET /api/prod/intelligence/batches/{id}`, `GET /api/prod/intelligence/patterns?batch_id=…` |
| Intents table | Intent engine | `GET /api/prod/intents?tenant_id=…` |
| Failures / DLQ | Intent engine | `GET /api/prod/dlq?tenant_id=…` (includes `client_batch_ref` when present) |

No synthetic `__sandbox_no_batch__` row; overview KPIs render only when a real batch is selected from the API list.

## Other docks (snapshot)

| Dock | Primary data | Notes |
|------|----------------|-------|
| Leakage / Ambiguity / Evidence / Merkle / Billing / Proof | Various `getIntelligence*` / prod routes | Surfaces already oriented on API where wired |
| Connectors | `ConnectorIntelligenceClient` (live) or `SandboxConnectorsSurface` | Sandbox: connector keys UI |
| Live sync | `LiveSyncSurface` | **Still mock telemetry** — replace with real health APIs when available |
| Workspace | `WorkspaceSurface` | Ask-style simulation for workspace tab; not ledger-backed |
| Batch Command Center | Separate route | May still use mock ops payload in `CommandCenterPage` when embedded |

## Intelligence KPI helper (`useIntelligenceKpis`)

Polls every 30s (default):  
`/api/prod/intelligence/leakage`, `ambiguity`, `defensibility`, `patterns`, `recommendations` (each forwarded to zord-intelligence v1 paths under `/v1/intelligence/...`).
