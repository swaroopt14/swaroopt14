
-- TABLE 1: projection_state
-- ZPI reads Kafka events and computes KPI numbers from them.
-- For example: "corridor razorpay.UPI has 97% success rate in last 24h"
-- Those computed numbers are stored here.
--
-- THINK OF IT LIKE:
-- A calculator that keeps a running total.
-- Every time a finality certificate arrives, ZPI updates the numbers.
-- The frontend reads from this table via the /v1/intelligence/kpis API.
--
-- EXAMPLE ROWS:
-- tenant_id | projection_key                      | value_json
-- tnt_A     | corridor.success_rate.razorpay_UPI  | {"rate": 0.97, "total": 1000}
-- tnt_A     | corridor.finality_p95.razorpay_UPI  | {"p95_seconds": 480}
-- tnt_A     | tenant.evidence_readiness           | {"rate": 0.91, "total": 500}

CREATE TABLE IF NOT EXISTS projection_state (

    id                 BIGSERIAL    PRIMARY KEY,
    -- BIGSERIAL = auto-incrementing number. Postgres assigns it automatically.
    -- You never set this yourself.

    tenant_id          TEXT         NOT NULL,
    -- Which merchant/tenant this projection belongs to

    projection_key     TEXT         NOT NULL,
    -- The name of what we are measuring.
    -- Format: {what}.{metric}.{scope}
    -- Examples:
    --   "corridor.success_rate.razorpay_UPI"
    --   "corridor.finality_p95.cashfree_IMPS"
    --   "tenant.evidence_readiness"
    --   "tenant.sla_breach_rate"

    window_start       TIMESTAMPTZ  NOT NULL,
    window_end         TIMESTAMPTZ  NOT NULL,
    -- The time period this projection covers.
    -- Most projections use a rolling 24-hour window.
    -- Example: window_start=2024-01-15 00:00, window_end=2024-01-16 00:00

    value_json         JSONB        NOT NULL,
    -- The actual computed numbers stored as flexible JSON.
    -- JSONB = binary JSON. Faster to query than plain TEXT.
    -- Different projections store different shapes here:
    --   success_rate:  {"rate": 0.97, "settled": 970, "total": 1000}
    --   finality_p95:  {"p50_seconds": 120, "p95_seconds": 480, "count": 1000}
    --   evidence:      {"rate": 0.91, "with_evidence": 455, "total": 500}

    computed_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- When ZPI last updated this projection

    projection_version INT          NOT NULL DEFAULT 1,
    -- If we change how a projection is calculated, bump this number.
    -- Old version rows stay, new version rows are added alongside.
    -- Prevents confusion when formula changes.

    -- UNIQUE constraint: only one row per tenant+key+window+version
    -- This makes upsert (insert or update) safe to call multiple times
    CONSTRAINT uq_projection
        UNIQUE (tenant_id, projection_key, window_start, projection_version)
);

-- Index: "give me latest projections for tenant X" — most common query
CREATE INDEX IF NOT EXISTS idx_proj_tenant_key
    ON projection_state (tenant_id, projection_key, window_end DESC);

-- TABLE 1B: processed_events
-- Tracks Kafka event IDs already processed by ZPI handlers.
-- Used for idempotency to avoid double-counting on retries/replays.
CREATE TABLE IF NOT EXISTS processed_events (
    tenant_id    TEXT        NOT NULL,
    event_id     TEXT        NOT NULL,
    PRIMARY KEY (tenant_id, event_id),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processed_events_at
    ON processed_events (processed_at DESC);

-- TABLE 1C: processed_finality
-- Business-level idempotency for finality certificates per tenant.
CREATE TABLE IF NOT EXISTS processed_finality (
    tenant_id      TEXT        NOT NULL,
    certificate_id TEXT        NOT NULL,
    processed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, certificate_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_finality_at
    ON processed_finality (processed_at DESC);


-- TABLE 2: policy_registry
-- Rules that ZPI evaluates. When conditions are met, ZPI creates an ActionContract.
--
-- THINK OF IT LIKE:
-- A list of IF-THEN rules stored in the database.
-- "IF corridor success rate drops below 90% THEN escalate to ops"
-- Adding a new rule = INSERT a row here. No code deployment needed.
--
-- EXAMPLE ROWS:
-- policy_id          | trigger               | dsl (the rule text)
-- P_SLA_BREACH_RISK  | cron: every 5 min     | IF finality_p95 > 6h THEN ESCALATE
-- P_FAILURE_BURST    | event: outcome.normal  | IF failure_rate > 30% THEN ESCALATE
-- P_EVIDENCE_GAP     | cron: every hour       | IF evidence_rate < 80% THEN GENERATE

CREATE TABLE IF NOT EXISTS policy_registry (

    policy_id      TEXT        PRIMARY KEY,
    -- Human-readable ID like "P_SLA_BREACH_RISK", "P_FAILURE_BURST"
    -- Not a UUID — kept readable so logs and alerts make sense

    version        INT         NOT NULL DEFAULT 1,
    -- Increment when you change the policy rules

    scope_type     TEXT        NOT NULL,
    -- What this policy looks at:
    -- "tenant"   → evaluates once per tenant
    -- "corridor" → evaluates once per corridor (razorpay_UPI, cashfree_IMPS etc.)
    -- "contract" → evaluates once per individual contract
    CHECK (scope_type IN ('tenant', 'corridor', 'contract')),

    trigger_type   TEXT        NOT NULL,
    -- WHEN does this policy get evaluated?
    -- "event" → fires when a specific Kafka message arrives
    -- "cron"  → fires on a schedule (every 5 min, every hour etc.)
    CHECK (trigger_type IN ('event', 'cron')),

    trigger_value  TEXT        NOT NULL,
    -- For "event" trigger: the Kafka topic name
    --   e.g. "final.contract.updated"
    -- For "cron" trigger: the schedule
    --   e.g. "*/5 * * * *" means every 5 minutes

    dsl            TEXT        NOT NULL,
    -- The actual rule text. Stored as plain text, parsed at evaluation time.
    -- Example:
    --   WHEN corridor.success_rate_1h < 0.90
    --   THEN ACTION ESCALATE severity=HIGH notify=OPS

    enabled        BOOLEAN     NOT NULL DEFAULT false,
    -- Policies start DISABLED for safety.
    -- You must explicitly enable via API: POST /v1/intelligence/policies/{id}/enable

    tenant_id      TEXT,
    -- NULL = applies to ALL tenants
    -- Set this to lock a policy to one specific tenant

    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: "give me all enabled policies for this trigger" — policy engine's main query
CREATE INDEX IF NOT EXISTS idx_policy_enabled_trigger
    ON policy_registry (trigger_type, trigger_value)
    WHERE enabled = true;


-- TABLE 3: action_contracts
-- Every decision ZPI makes is recorded here as an immutable signed record.
-- This is ZPI's audit trail — you can always answer "why did ZPI do that?"
--
-- GOLDEN RULE: NEVER UPDATE ROWS IN THIS TABLE.
-- Once inserted, a row stays forever exactly as written.
-- This is what makes ZPI audit-grade.
--
-- THINK OF IT LIKE:
-- A court judgment. Once written and signed, it cannot be changed.
-- If you want to override it, you write a NEW judgment referencing the old one.
--
-- EXAMPLE ROWS:
-- action_id | policy_id         | decision   | confidence | scope_refs
-- act_01    | P_SLA_BREACH_RISK | ESCALATE   | 0.95       | {"corridor_id": "razorpay_UPI"}
-- act_02    | P_EVIDENCE_GAP    | GENERATE   | 1.00       | {"tenant_id": "tnt_A"}
-- act_03    | P_FAILURE_BURST   | NOTIFY     | 0.87       | {"corridor_id": "cashfree_IMPS"}

CREATE TABLE IF NOT EXISTS action_contracts (

    action_id        TEXT         PRIMARY KEY,
    -- UUID we generate in Go code: "act_" + uuid

    tenant_id        TEXT         NOT NULL,

    policy_id        TEXT         NOT NULL,
    -- Which policy triggered this action. Links back to policy_registry.

    policy_version   INT          NOT NULL,
    -- Which version of the policy was active when this fired.
    -- Important: policy rules can change, but old actions stay as they were.

    scope_refs       JSONB        NOT NULL,
    -- What this action is about. Flexible JSON because scope varies:
    -- {"contract_id": "ctr_01"}
    -- {"corridor_id": "razorpay_UPI"}
    -- {"tenant_id": "tnt_A", "intent_id": "int_01"}
    -- NO PII here — only IDs and references

    input_refs_json  JSONB        NOT NULL,
    -- What evidence ZPI looked at to make this decision.
    -- Stores projection keys and values that triggered the rule.
    -- Example: {"projection_key": "corridor.success_rate.razorpay_UPI", "value": 0.82}

    decision         TEXT         NOT NULL,
    -- What ZPI decided to do:
    CHECK (decision IN (
        'ALLOW',                    -- explicit allow, audit only
        'ESCALATE',                 -- create ops incident
        'NOTIFY',                   -- send notification
        'HOLD',                     -- pause the payout (needs tenant approval)
        'RETRY',                    -- retry via Service 4 (needs tenant config)
        'GENERATE_EVIDENCE',        -- trigger Service 6 to build evidence pack
        'OPEN_OPS_INCIDENT',        -- open a structured ops ticket
        'ADVISORY_RECOMMENDATION'   -- suggestion only, no auto-action
    )),

    confidence       NUMERIC(4,3) NOT NULL,
    -- How certain ZPI was: 0.000 to 1.000
    -- 1.000 = completely certain (e.g. evidence_rate IS 0.60, fact not estimate)
    -- 0.750 = fairly confident (e.g. trend suggests breach coming)
    CHECK (confidence >= 0 AND confidence <= 1),

    payload_json     JSONB        NOT NULL,
    -- Extra data the actuator needs to carry out the action.
    -- Example for ESCALATE: {"severity": "HIGH", "notify": ["OPS"], "message": "..."}
    -- MUST NOT contain PII

    signature        TEXT         NOT NULL,
    -- Cryptographic signature proving this record was not tampered with.
    -- In development: a simple hash. In production: ed25519 signature via KMS.

    idempotency_key  TEXT         NOT NULL UNIQUE,
    -- Prevents creating duplicate action contracts for the same event.
    -- Built from: hash(policy_id + scope_refs + trigger_event_id)
    -- If the same event arrives twice, the second insert is silently ignored.

    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
    -- Set once, never changed. Matches IMMUTABILITY RULE.
);

-- Index: "show recent actions for this tenant" — main dashboard query
CREATE INDEX IF NOT EXISTS idx_ac_tenant_created
    ON action_contracts (tenant_id, created_at DESC);

-- Index: "all actions for contract ctr_01" — scope lookup
-- GIN index makes JSONB searches fast: scope_refs @> '{"contract_id":"ctr_01"}'
CREATE INDEX IF NOT EXISTS idx_ac_scope_refs
    ON action_contracts USING GIN (scope_refs);

-- Index: "how many times did P_SLA_BREACH_RISK fire today?"
CREATE INDEX IF NOT EXISTS idx_ac_policy
    ON action_contracts (policy_id, tenant_id, created_at DESC);


-- TABLE 4: actuation_outbox 

-- A delivery queue. When ZPI creates an ActionContract that needs to
-- trigger another service (retry, hold, alert), it writes to this table.
-- A background worker (outbox_worker.go) reads this and sends to Kafka.
--
-- WHY NOT SEND TO KAFKA DIRECTLY?
-- If ZPI writes to DB and then tries to send to Kafka, but crashes in between:
--   - DB has the action → good
--   - Kafka never got it → other service never triggered → BAD
--
-- With the outbox pattern:
--   - Write ActionContract + Outbox entry in ONE DB transaction (atomic)
--   - Worker picks up outbox and sends to Kafka separately
--   - If worker crashes, it retries when it restarts
--   - Guaranteed delivery, zero message loss
--
-- EXAMPLE ROWS:
-- event_id | action_id | event_type | status  | attempts
-- evt_01   | act_01    | ESCALATE   | PENDING | 0
-- evt_02   | act_02    | RETRY      | SENT    | 1
-- evt_03   | act_03    | GENERATE   | FAILED  | 5

CREATE TABLE IF NOT EXISTS actuation_outbox (

    event_id       TEXT         PRIMARY KEY,

    action_id      TEXT         NOT NULL
                                REFERENCES action_contracts(action_id),
    -- Links to the ActionContract that created this outbox entry

    event_type     TEXT         NOT NULL,
    -- Mirrors the decision from action_contracts:
    -- "ESCALATE", "RETRY", "GENERATE_EVIDENCE", "NOTIFY" etc.

    payload        JSONB        NOT NULL,
    -- JSON to publish to Kafka. Built from the ActionContract payload.

    status         TEXT         NOT NULL DEFAULT 'PENDING',
    -- Delivery lifecycle:
    -- PENDING → worker picks it up → sends to Kafka → SENT
    --                                              → fails → FAILED (retried later)
    CHECK (status IN ('PENDING', 'SENT', 'FAILED')),

    attempts       INT          NOT NULL DEFAULT 0,
    -- How many delivery attempts have been made.
    -- After 5 failed attempts, status becomes FAILED permanently.
    -- Requires manual intervention (ops team investigates).

    next_retry_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- When to try delivery next.
    -- Worker query: WHERE status IN ('PENDING','FAILED') AND next_retry_at <= now()
    -- Uses exponential backoff: 30s → 2m → 8m → 32m → permanent fail

    sent_at        TIMESTAMPTZ,
    -- When it was successfully delivered. NULL until delivered.

    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- This is the HOT index — the outbox worker queries this every 5 seconds.
-- Partial index (WHERE status IN ...) only indexes rows that need processing.
-- Much smaller and faster than a full table index.
CREATE INDEX IF NOT EXISTS idx_outbox_pending
    ON actuation_outbox (next_retry_at ASC)
    WHERE status IN ('PENDING', 'FAILED');


-- TABLE 5: sla_timers
-- Tracks the SLA (Service Level Agreement) deadline for each intent.
-- When a merchant creates a payout, there is a deadline by which it
-- must reach finality. This table tracks whether we are on time.
--
-- THINK OF IT LIKE:
-- A countdown timer per payout.
-- Intent created at 10:00 + SLA is 4 hours = deadline is 14:00.
-- If it is 13:45 and still PENDING, ZPI should warn ops.
--
-- EXAMPLE ROWS:
-- intent_id | sla_deadline        | status   | notified_at
-- int_01    | 2024-01-15 14:00   | ACTIVE   | null        ← ticking
-- int_02    | 2024-01-15 12:00   | RESOLVED | null        ← finished in time
-- int_03    | 2024-01-15 10:00   | BREACHED | 2024-01-15 10:05 ← late, ops alerted

CREATE TABLE IF NOT EXISTS sla_timers (

    id           BIGSERIAL    PRIMARY KEY,

    intent_id    TEXT         NOT NULL,
    tenant_id    TEXT         NOT NULL,
    corridor_id  TEXT         NOT NULL,

    sla_deadline TIMESTAMPTZ  NOT NULL,
    -- The deadline. Computed when intent arrives:
    -- sla_deadline = intent.created_at + corridor_sla_hours
    -- For now we use a default of 6 hours for all corridors.

    status       TEXT         NOT NULL DEFAULT 'ACTIVE',
    CHECK (status IN (
        'ACTIVE',    -- timer is running, payout not yet finalized
        'RESOLVED',  -- payout reached finality before deadline (good)
        'BREACHED'   -- deadline passed, payout still not finalized (bad)
    )),

    resolved_at  TIMESTAMPTZ,
    -- When finality was reached (NULL if still ACTIVE or BREACHED)

    notified_at  TIMESTAMPTZ,
    -- When we sent the breach notification to ops (NULL if not yet notified)
    -- This prevents sending duplicate alerts for the same breach.

    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- One timer per intent per tenant
    CONSTRAINT uq_sla_intent UNIQUE (tenant_id, intent_id)
);

-- Index: "find all ACTIVE timers approaching their deadline"
-- The sla_worker queries this every 5 minutes
CREATE INDEX IF NOT EXISTS idx_sla_active_deadline
    ON sla_timers (tenant_id, sla_deadline ASC)
    WHERE status = 'ACTIVE';

-- ── SEED: Pilot policies ─────────────────────────────────────────────────────
--
-- These are the 8 policies required for pilot 
-- All start DISABLED (enabled = false) for safety.
-- The ops team enables them one-by-one via the API after verifying thresholds:
--   POST /v1/intelligence/policies/P_SLA_BREACH_RISK/enable
--
-- ON CONFLICT DO NOTHING means running init.sql twice is safe —
-- existing rows are untouched (idempotent seed).
--
-- DSL guide:
--   WHEN <metric> <op> <threshold>  AND  <metric> <op> <threshold>
--   THEN ACTION <decision> severity=<HIGH|MEDIUM|LOW>
--
-- Time units: 6h = 6 hours, 30m = 30 minutes (handled by parseThreshold in Go)
-- Plain numbers: 0.70 = rate (0–1), 500 = count

INSERT INTO policy_registry
    (policy_id, version, scope_type, trigger_type, trigger_value, dsl, enabled)
VALUES

-- P1: SLA breach risk — fires when p95 finality is over 6h AND backlog > 500
-- scope: corridor (checked per corridor)  trigger: cron every 5 min
('P_SLA_BREACH_RISK', 1, 'corridor', 'cron', '*/5 * * * *',
'WHEN corridor.finality_p95_seconds > 6h AND corridor.total_pending > 500
THEN ACTION ESCALATE severity=HIGH',
false),

-- P2: Failure burst — fires when success rate drops below 70% in this corridor
-- scope: corridor  trigger: event (fires immediately when outcome arrives)
('P_FAILURE_BURST', 1, 'corridor', 'event', 'outcome.event.normalized',
'WHEN corridor.success_rate < 0.70
THEN ACTION ESCALATE severity=HIGH',
false),

-- P3: Pending backlog aging — fires when 6h+ bucket gets too large
-- scope: corridor  trigger: cron every 5 min
('P_PENDING_BACKLOG_AGING', 1, 'corridor', 'cron', '*/5 * * * *',
'WHEN corridor.pending_6h_plus > 50
THEN ACTION OPEN_OPS_INCIDENT severity=MEDIUM',
false),

-- P4: Conflict spike — fires when Outcome Fusion conflict rate is very high
-- A high conflict rate means PSP signals are unreliable — needs investigation
-- scope: corridor  trigger: finality cert event
('P_CONFLICT_SPIKE', 1, 'corridor', 'event', 'finality.certificate.issued',
'WHEN corridor.success_rate < 0.85
THEN ACTION NOTIFY severity=MEDIUM',
false),

-- P5: Evidence missing — fires when evidence readiness drops below 80%
-- scope: tenant  trigger: cron every hour (we use */5 for pilot simplicity)
('P_EVIDENCE_MISSING', 1, 'tenant', 'cron', '*/5 * * * *',
'WHEN tenant.evidence_readiness_rate < 0.80
THEN ACTION GENERATE_EVIDENCE severity=LOW',
false),

-- P6: DLQ retry suggestion — fires when statement match rate drops
-- Low match rate = payouts settled but not in statement = reconciliation exception
-- scope: corridor  trigger: statement match event
('P_STATEMENT_MISMATCH_SPIKE', 1, 'corridor', 'event', 'statement.match.event',
'WHEN corridor.statement_match_rate < 0.90
THEN ACTION OPEN_OPS_INCIDENT severity=MEDIUM',
false),

-- P7: Corridor degradation advisory — fires when success rate falls but not critical
-- Advisory only — suggests human review, no auto-action
-- scope: corridor  trigger: finality cert event
('P_CORRIDOR_DEGRADATION', 1, 'corridor', 'event', 'finality.certificate.issued',
'WHEN corridor.success_rate < 0.90
THEN ACTION ADVISORY_RECOMMENDATION severity=LOW',
false),

-- P8: SLA breach rate rising — fires when breach rate exceeds 5%
-- scope: tenant  trigger: cron every 5 min
('P_SLA_BREACH_RATE_HIGH', 1, 'tenant', 'cron', '*/5 * * * *',
'WHEN tenant.sla_breach_rate > 0.05
THEN ACTION ESCALATE severity=HIGH',
false)

ON CONFLICT (policy_id) DO NOTHING;

-- ── SEED: ML-driven policies ─────────────────────────────────────────────
-- Makes ML projections actionable via the existing policy engine.
INSERT INTO policy_registry
    (policy_id, version, scope_type, trigger_type, trigger_value, dsl, enabled)
VALUES
('P_ANOMALY_DETECTED', 1, 'corridor', 'cron', '*/5 * * * *',
'WHEN corridor.anomaly_score > 0.70
THEN ACTION ESCALATE severity=HIGH',
false),
('P_SLA_BREACH_RISK_HIGH', 1, 'corridor', 'cron', '*/5 * * * *',
'WHEN corridor.sla_breach_risk > 0.70
THEN ACTION NOTIFY severity=HIGH',
false),
('P_FAILURE_PATTERN_SHIFT', 1, 'corridor', 'event', 'outcome.event.normalized',
'WHEN corridor.failure_cluster_shift_score > 0.60
THEN ACTION ESCALATE severity=MEDIUM',
false),
('P_SLA_BREACH', 1, 'tenant', 'cron', '*/5 * * * *',
'WHEN tenant.sla_breach_rate > 0.00
THEN ACTION ESCALATE severity=HIGH',
false)
ON CONFLICT (policy_id) DO NOTHING;
