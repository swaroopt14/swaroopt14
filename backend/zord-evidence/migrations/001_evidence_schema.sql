CREATE TABLE IF NOT EXISTS evidence_packs (
    evidence_pack_id UUID PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    intent_id TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    merkle_root TEXT NOT NULL,
    ruleset_version TEXT NOT NULL,
    signature_alg TEXT NOT NULL,
    signature_value TEXT NOT NULL,
    object_ref TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evidence_packs_tenant_contract_idx ON evidence_packs(tenant_id, contract_id);
CREATE INDEX IF NOT EXISTS evidence_packs_tenant_intent_idx ON evidence_packs(tenant_id, intent_id);

CREATE TABLE IF NOT EXISTS evidence_items (
    evidence_pack_id UUID NOT NULL,
    position_index INT NOT NULL,
    item_type TEXT NOT NULL,
    item_ref TEXT NOT NULL,
    item_hash TEXT,
    leaf_hash TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    PRIMARY KEY(evidence_pack_id, position_index)
);

CREATE INDEX IF NOT EXISTS evidence_items_pack_idx ON evidence_items(evidence_pack_id);

CREATE TABLE IF NOT EXISTS evidence_signatures (
    evidence_pack_id UUID NOT NULL,
    signer TEXT NOT NULL,
    alg TEXT NOT NULL,
    signature TEXT NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(evidence_pack_id, signer, alg)
);
