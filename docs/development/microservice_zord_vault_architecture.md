# Zord Vault Microservices Architecture

## Overview

Start with **6 deployable backend services + 1 frontend** - the sweet spot for speed, clarity, and future scaling.

---

## 🏗️ Service Architecture

### Backend Services (6)

1. **Edge / Ingress API** (`zord-edge`)
2. **Raw Journal (Vault) Service** (`zord-vault-journal`)
3. **Intent Engine Service** (`zord-intent-engine`)
4. **PII Enclave Service** (`zord-pii-enclave`)
5. **Event Relay (Outbox Publisher) Service** (`zord-relay`)
6. **Contracts + Evidence Service** (`zord-contracts`)

### Frontend (1)

7. **Console UI** (`zord-console`) + (optional thin BFF inside zord-edge)

### Shared Infrastructure

- **PostgreSQL** - Primary database
- **Kafka** (use KRaft, not ZooKeeper for new builds)
- **Redis** - Caching and message queuing
- **Object Store** (S3-compatible) for immutable blobs
- **Observability Stack** (OpenTelemetry + logs/metrics)

### Safe Merging Strategy

If someone insists "this is too many," the only safe merge is:
- **Merge Contracts into Intent Engine initially**
- **PII Enclave should remain isolated** (security boundary)

---

## 🔒 Core Invariants (What Must Never Break)
## 2. The invariants (what must never break) 

### Invariant A — Raw is Immutable
- Raw request/response payloads are **never modified**
- They are always **retrievable by envelope_id**
- They are always **cryptographically traceable** (hash + signature chain)

### Invariant B — Canonical Intent is the Single Internal Truth
- Everything downstream consumes **CanonicalIntent v1/v2...**
- No downstream service "re-interprets" raw payload directly (**anti-corruption rule**)

### Invariant C — Mutations Happen Only via Versioned Events
If anything changes (enrichment, confidence adjustment, corrected instrument, fused outcome):
- You do **not mutate old canonical data silently**
- You produce a **new version + signed reason + link to inputs**
- This keeps you **deterministic, replayable, and explainable**

> **This is the core of your defensibility.**

---

## 📋 3. Service Specifications

### 3.1 `zord-edge` — Edge / Ingress API (The "Front Door")

**Purpose:** Accept traffic cleanly and consistently.

#### Responsibilities
- **Authentication** (API keys / OAuth2 later)
- **Tenant resolution and enforcement** (tenant_id is mandatory)
- **Rate limiting** (tenant + intent-type aware later)
- **Request shaping:** content-type handling, size limits, decompression
- **Generates trace_id** and propagates it everywhere
- **Routes to Raw Journal** for durable intake
- **Exposes Status APIs + Webhooks** registration (or delegates to status later)

#### What it Must NOT Do
- Canonicalization
- Business rules that change frequently (keep those in policy/intent engine)
- Heavy parsing/ML

#### APIs (Typical)
- `POST /v1/intents` (merchant/psp sends payout intent)
- `POST /v1/envelopes/webhook` (psp callback forwarder intake)
- `GET /v1/intents/{id}` (status)
- `POST /v1/webhooks` (register webhook endpoints)

#### Scaling
- **Stateless** - Horizontal scale easily
- **Protects your core** by absorbing spikes

---

### 3.2 `zord-vault-journal` — Raw Immutable Journal (The "Truth Basement")

**Purpose:** Store everything as received, safely, immutably, queryable.

#### Responsibilities
- Accept **"RawEnvelope"**
- Compute **content hash** (sha256)
- Store **encrypted raw payload** in object storage
- Store **metadata in PostgreSQL** for indexing & querying
- Append **hash-chain pointer** (tamper-evident sequence)
- **Sign envelope receipt** (system signature)

#### Data it Owns
- `raw_envelopes` table (metadata)
- Object store path: `s3://vault/raw/{tenant}/{yyyy}/{mm}/{dd}/{envelope_id}.bin`

#### Outputs
- Returns `envelope_id + content_hash + received_at`
- Emits event: `vault.envelope.stored.v1`

#### Critical Design
- **ACK Rule:** Edge returns 202 Accepted only after vault-journal confirms durable storage
- This gives you **"we have your data, safe"** semantics

---

### 3.3 `zord-intent-engine` — Canonical Intent Engine (The "Meaning Factory")

**Purpose:** Turn raw into canonical, deterministic intent + enforce invariants.

This service is where your earlier 11-step flow lives, but split correctly.

#### Inputs
- `vault.envelope.stored.v1` (from Kafka)
- Or a direct pull by envelope_id if you prefer (but event-driven is cleaner)

#### Responsibilities (Ordered)
1. **Fetch RawEnvelope** (by envelope_id)
2. **Schema validation** (json/xml/csv based on source_type)
3. **Semantic validation** (amount>0, currency ISO, timestamps valid)
4. **Instrument checks** (IFSC format + directory lookup, IBAN mod-97, UPI VPA structure)
5. **Canonicalize** (normalize unicode NFKC, UTC conversion, decimals, trimmed casing)
6. **PII tokenization call-out** (replace PII with tokens)
7. **Idempotency** (client key + salient hash; return prior terminal result deterministically)
8. **Pre-guards** (tenant corridor, caps, deadline windows)
9. **Persist canonical intent** (PostgreSQL)
10. **Write outbox** (same DB transaction)
11. **Emit "intent accepted" state** for status projections

#### What it Must NOT Do
- Kafka publishing directly (that's relay)
- Anything that requires bank integrations (you're not modifying bank systems; you're consuming external signals only)

#### Data it Owns
- `intents` (canonical intent versions)
- `intent_versions` (optional explicit version chain)
- `idempotency_keys`
- `decision_log` (optional but recommended: rule decisions, reason codes)
- `outbox` (event stubs)

#### Events it Produces (via outbox)
- `intent.created.v1`
- `intent.rejected.v1` (with reason codes)
- `intent.dlq.v1` (invalid, ambiguous, policy-blocked)

#### Canonical Output Verification Layer
In v1, implement it as:
- `intent.canonical_verified.v1` emitted when the canonical form passes internal invariants
- Later (when outcomes exist) add `intent.outcome_verified.v1` that asserts final state matches contract rules

> **Canonical output verification is a separate step/event, not "handwavy."**
> It becomes the anchor for payout contract generation.

---

### 3.4 `zord-pii-enclave` — PII Tokenization Enclave (Security Boundary)

**Purpose:** Keep raw PII out of your core tables.

#### Responsibilities
- **Detect PII fields** (based on a registry per intent type)
- **Tokenize + store mapping** securely
- **Return token references** + policy decisions

#### Inputs
- `TokenizeRequest` from intent-engine

#### Outputs
- **Token references:** `tok_<...>`
- **Policy response:** allow / deny / redact / partial mask

#### Data it Owns
- `pii_tokens`
- **Encryption keys** (ideally via KMS/HSM later)
- **Access audit logs**

#### Security
- **Separate network policy** (only intent-engine can call it)
- **Separate DB/schema**
- **Strict audit logging**

> **This service is important because it allows you to credibly say:**
> *"Core Zord Vault systems never store raw beneficiary PII."*

---

### 3.5 `zord-relay` — Outbox Publisher (The Reliability Spine)

**Purpose:** Guarantee event publication without losing data.

You already chose the right pattern: **persist then publish, with replayable safety.**

#### Why This Exists
- If you publish to Kafka directly from request handling, you can lose events during crashes
- The **transactional outbox pattern** solves this by storing an "event stub" in DB in the same transaction as the intent write, then publishing asynchronously

#### Responsibilities
- **Poll (or stream) outbox rows**
- **Publish to Kafka topics**
- **Retry with exponential backoff**
- **Move permanently failing events to DLQ**
- **Mark outbox row as published** with offsets/metadata

#### Data it Owns
- It reads from the outbox table (owned by intent-engine), but maintains its own state about publishing attempts

#### Kafka Topics
- `z.intent.created.v1`
- `z.intent.rejected.v1`
- `z.intent.dlq.v1`
- `z.vault.envelope.stored.v1`
- Plus internal `z.relay.publish_failed.v1`

---

### 3.6 `zord-contracts` — Payout Contracts + Evidence Packs (Your V1 Differentiator)

**Purpose:** Produce the "artifact" customers actually pay for.

This is where you stop sounding like "another orchestration layer," and start being a **payout contract + proof infrastructure product.**

#### Inputs
- `intent.canonical_verified.v1`
- `intent.created.v1`
- (Later) `outcome.events.*` + `fusion.decided.v1`

#### Responsibilities (V1)
- **Generate PayoutContract v1** from CanonicalIntent + policy profile
- **Generate EvidencePack v1** that includes:
  - Raw envelope reference + hashes
  - Canonical intent (versioned)
  - Validation decisions + reason codes
  - Signatures (system + tenant, if available)
- **Sign the pack**
- **Store pack immutably** (object store + index in PostgreSQL)
- **Expose download API** (or via console)

#### Outputs
- `contract.issued.v1`
- `evidence.pack.created.v1`

#### Why This is Crucial for Revenue in 4 Months
Because a contract + evidence pack is:
- **Tangible value**
- **Easy to sell** (compliance/audit/ops)
- Not "wait, what do you do exactly?"

> **You sell:** *"Every payout becomes a replayable, signed contract with a forensic evidence trail."*

---

## 🤖 4. AI-Readiness Without Putting AI in the Hot Path

**Your rule is correct:** No AI in hot path.

So your "AI heavy support" should be implemented as **asynchronous consumers.**

### Add Later as Separate Services (Not in the Initial 6)
- **`zord-insights`** (ClickHouse analytics, anomaly detection, operational dashboards)
- **`zord-event-graph`** (Neo4j graph linking envelopes ↔ intents ↔ outcomes ↔ disputes)
- **`zord-fusion`** (multi-source outcome fusion + confidence)
- **`zord-predict`** (prediction layer, confidence-aware state)

### Key Principle
**AI services never mutate canonical truth.**

They emit proposals:
- `intent.enrichment.proposed.v1`
- `outcome.predicted.v1`
- With **confidence + provenance**

Then your **deterministic rules** decide whether those proposals become new versions.

---

## ⚙️ 5.  Kafka Setup Choice: Use KRaft

If you're starting now, use **Kafka in KRaft mode**, because ZooKeeper support is being removed and KRaft is the forward path.

### For Your Team
- **Local dev:** docker-compose Kafka KRaft
- **Staging/prod:** managed Kafka or self-hosted KRaft cluster
- **Keep topic naming + schemas strict** from day 1

---

## 🔄 6.  How This Design Lets You Change Services Without Changing "Core"

Because **"core" is not code — it's contracts + invariants.**

### What You Freeze Early
- **CanonicalIntent schema versions** (v1, later v1.1, v2)
- **Envelope metadata schema**
- **Event names and compatibility rules**
- **EvidencePack structure**

### What You Allow to Evolve Fast
- **Adapters** (new source formats)
- **Policy rulesets**
- **Enrichment/prediction models**
- **Event graph analytics**
- **New contract templates** per client segment

### You Get "Customization" By
- **Policy profiles** (per tenant / per corridor / per intent type)
- **Signals fused later** (without changing canonical truth)
- **Contract views generated** from the same canonical base

---

## 🎯 Final Answer

### "How many microservices are good initially?"

**6 backend services (deployables) + 1 frontend** is the best balance for you right now.

It is:
- ✅ **Small enough** to ship fast
- ✅ **Large enough** to isolate security + reliability boundaries
- ✅ **Modular enough** to support AI-heavy evolution later
- ✅ **Clean enough** that your developers won't freeze from complexity

And it's consistent with the **"start coarse-grained, split later"** approach.

---

## 📊 Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   zord-edge     │───▶│ zord-vault-     │───▶│ zord-intent-    │
│   (API Gateway) │    │ journal         │    │ engine          │
└─────────────────┘    │ (Raw Storage)   │    │ (Canonicalize)  │
         │              └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ zord-pii-       │    │ zord-relay      │    │ zord-contracts  │
│ enclave         │    │ (Event Pub)     │    │ (Evidence)      │
│ (Tokenization)  │    └─────────────────┘    └─────────────────┘
└─────────────────┘             │                       │
                                 ▼                       ▼
                        ┌─────────────────┐    ┌─────────────────┐
                        │     Kafka       │    │ Object Storage  │
                        │   (Events)      │    │ (Contracts)     │
                        └─────────────────┘    └─────────────────┘
```

This architecture provides a solid foundation for your Zord Vault platform with clear separation of concerns, security boundaries, and scalability for future AI integration.

---
# 📋 Key Sections Organized:

## 1. 🏗️ Service Architecture
- 6 backend + 1 frontend services

## 2. 🔒 Core Invariants
- The 3 critical rules that must never break

## 3. 📋 Service Specifications
Detailed breakdown of each microservice:
- zord-edge (API Gateway)
- zord-vault-journal (Raw Storage)
- zord-intent-engine (Canonicalization)
- zord-pii-enclave (Security Boundary)
- zord-relay (Event Publishing)
- zord-contracts (Evidence Packs)

## 4. 🤖 AI-Readiness
- How to add AI without breaking the hot path

## 5. ⚙️ Kafka Setup
- KRaft mode recommendations

## 6. 🔄 Evolution Strategy
- How to change services without breaking core

## 7. 📊 Architecture Diagram
- Visual representation


# 🎯 Key Insights from the Document:

- Start with 6 microservices — the sweet spot for speed and clarity
- 3 Core Invariants that ensure system integrity
- No AI in hot path — keep AI as async consumers
- Contracts + Evidence Packs are your revenue differentiator
- Event-driven architecture with Kafka for reliability
