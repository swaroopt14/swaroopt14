export type TimeRangeKey = '15M' | '1H' | '24H'

export const TIME_RANGES: Record<TimeRangeKey, { label: string; minutes: number }> = {
  '15M': { label: 'Last 15m', minutes: 15 },
  '1H': { label: 'Last 1h', minutes: 60 },
  '24H': { label: 'Last 24h', minutes: 1440 },
}

export type ReasonCode =
  | 'SUCCESS'
  | 'PROVIDER_TIMEOUT'
  | 'INVALID_SIGNATURE'
  | 'RATE_LIMIT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'ADAPTER_DISCONNECTED'
  | 'AUTH_FAILURE'

export const REASON_CODE_EXPLANATIONS: Record<
  ReasonCode,
  { description: string; action: string }
> = {
  SUCCESS: {
    description: 'Request processed successfully.',
    action: 'No action required.',
  },
  PROVIDER_TIMEOUT: {
    description: 'External provider failed to respond within timeout window.',
    action: 'Retry request or verify adapter connectivity.',
  },
  INVALID_SIGNATURE: {
    description: 'Webhook signature verification failed.',
    action: 'Check secret rotation and payload canonicalization.',
  },
  RATE_LIMIT: {
    description: 'Tenant exceeded allowed request rate.',
    action: 'Apply backoff and review tenant quota policy.',
  },
  IDEMPOTENCY_CONFLICT: {
    description: 'Duplicate request detected for existing idempotency key.',
    action: 'Return existing result and fix client idempotency behavior.',
  },
  ADAPTER_DISCONNECTED: {
    description: 'Provider adapter heartbeat failed.',
    action: 'Fail over adapter and verify credentials/network reachability.',
  },
  AUTH_FAILURE: {
    description: 'Adapter authentication with provider failed.',
    action: 'Rotate credentials and verify auth grant scope.',
  },
}

export type ApiLogEntry = {
  id: string
  time: string
  minutesAgo: number
  method: 'GET' | 'POST' | 'PUT'
  endpoint: string
  tenant: string
  status: number
  latencyMs: number
  reasonCode: ReasonCode
  traceId: string
  intentId: string
  idempotencyKey: string
  requestPayload: Record<string, unknown>
  responsePayload: Record<string, unknown>
  timeline: string[]
}

export const API_LOGS: ApiLogEntry[] = [
  {
    id: 'api_001',
    time: '17:30',
    minutesAgo: 6,
    method: 'POST',
    endpoint: '/v1/ingress',
    tenant: 'Zomato',
    status: 202,
    latencyMs: 98,
    reasonCode: 'SUCCESS',
    traceId: 'a4fc6945-4383-42ee-aa35-f224ed2082f5',
    intentId: 'N/A',
    idempotencyKey: 'asdf',
    requestPayload: {
      envelope_id: 'ce28601c-3bdc-4254-9ea8-3548ef05caf9',
      tenant_id: '920d6a21-8e2d-4f18-9c23-7b9e2ea56107',
      source: 'REST',
      source_system: 'RAzerpay',
      content_type: 'application/json',
      payload_size: 2128,
      payload_hash: '8a32431beeb2f31d...b4314e44',
      envelope_hash: '9352d0ec1f03d50b...ccab3875',
      idempotency_key: 'asdf',
    },
    responsePayload: {
      status: 'RECEIVED',
      http_status: 202,
      vault_object_ref: 's3://arealis-zord-vault/raw/.../ce28601c-3bdc-4254-9ea8-3548ef05caf9',
    },
    timeline: ['Ingress Received', 'Envelope Stored (Immutable)', 'Signature Recorded', '202 ACK Returned'],
  },
  {
    id: 'api_002',
    time: '17:34',
    minutesAgo: 9,
    method: 'POST',
    endpoint: '/v1/ingress',
    tenant: 'Swiggy',
    status: 202,
    latencyMs: 103,
    reasonCode: 'SUCCESS',
    traceId: 'a9351e66-ddf3-4fcb-a533-a6aa5a17d18e',
    intentId: 'N/A',
    idempotencyKey: 'asdf',
    requestPayload: {
      envelope_id: '8cc0cbbd-0518-4be6-8601-997ab600ce6c',
      tenant_id: '20c14c08-8ceb-442d-8980-9b42bd3ac258',
      source: 'REST',
      source_system: 'RAzerpay',
      content_type: 'application/json',
      payload_size: 2128,
      payload_hash: '8a32431beeb2f31d...b4314e44',
      envelope_hash: '1e17c0db917eba6b...19e5d2e0',
      idempotency_key: 'asdf',
    },
    responsePayload: {
      status: 'RECEIVED',
      http_status: 202,
      vault_object_ref: 's3://arealis-zord-vault/raw/.../8cc0cbbd-0518-4be6-8601-997ab600ce6c',
    },
    timeline: ['Ingress Received', 'Envelope Stored (Immutable)', 'Signature Recorded', '202 ACK Returned'],
  },
  {
    id: 'api_003',
    time: '17:54',
    minutesAgo: 12,
    method: 'POST',
    endpoint: '/v1/intents',
    tenant: 'Flipkart',
    status: 201,
    latencyMs: 132,
    reasonCode: 'SUCCESS',
    traceId: '0a1e035f-33c8-4d2f-a7c7-34d02b378d6f',
    intentId: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
    idempotencyKey: 'asdf',
    requestPayload: {
      envelope_id: '1ee6177c-a000-45b6-94ca-91b152894a84',
      intent_id: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
      tenant_id: '7533ca05-ca0c-49f3-8e99-72d1d667e68d',
      intent_type: 'PAYOUT',
      schema_version: 'intent.request.v1',
      canonical_version: 'v1',
      amount: '9100999.9',
      currency: 'INR',
      constraints: { execution_window: 'T+1' },
      beneficiary_type: 'BANK',
      idempotency_key: 'asdf',
    },
    responsePayload: {
      status: 'CREATED',
      canonical_hash: 'bb9da523791eba214b18820c6aaba08eeed8253f4ef0c5ec0fe1bcb713ca3933',
      canonical_ref: 's3://canonical-worm-storage/canonical/.../v0001.json',
    },
    timeline: ['Intent Request Received', 'Canonicalization', 'WORM Canonical Stored', 'Intent Created'],
  },
  {
    id: 'api_004',
    time: '17:56',
    minutesAgo: 15,
    method: 'POST',
    endpoint: '/v1/outbox/dispatch',
    tenant: 'Flipkart',
    status: 200,
    latencyMs: 121,
    reasonCode: 'SUCCESS',
    traceId: '0a1e035f-33c8-4d2f-a7c7-34d02b378d6f',
    intentId: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
    idempotencyKey: 'asdf',
    requestPayload: {
      event_id: '0dffdf61-9696-4f0f-aa6f-7fb5be097bd6',
      aggregate_type: 'intent',
      aggregate_id: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
      event_type: 'eventTypePlaceholder',
      envelope_id: '1ee6177c-a000-45b6-94ca-91b152894a84',
      tenant_id: '7533ca05-ca0c-49f3-8e99-72d1d667e68d',
      retry_count: 1,
      status: 'SENT',
    },
    responsePayload: {
      status: 'SENT',
      sent_at: '2026-03-04T17:56:20.894662Z',
      broker_ack: 'OK',
    },
    timeline: ['Outbox Polled', 'Payload Published', 'Delivery ACK', 'Marked SENT'],
  },
  {
    id: 'api_005',
    time: '17:57',
    minutesAgo: 16,
    method: 'GET',
    endpoint: '/v1/intents/6339e5ff-1267-4135-bfe3-07b0f4518ef5',
    tenant: 'Flipkart',
    status: 200,
    latencyMs: 46,
    reasonCode: 'SUCCESS',
    traceId: '0a1e035f-33c8-4d2f-a7c7-34d02b378d6f',
    intentId: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
    idempotencyKey: 'asdf',
    requestPayload: {
      intent_id: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
      include: 'canonical_hash,canonical_ref,status',
    },
    responsePayload: {
      status: 'CREATED',
      amount: '9100999.9',
      currency: 'INR',
      canonical_version: 'v1',
    },
    timeline: ['Read Model Query', 'Intent Projection Loaded', '200 Returned'],
  },
  {
    id: 'api_006',
    time: '17:58',
    minutesAgo: 18,
    method: 'POST',
    endpoint: '/v1/ingress',
    tenant: 'Flipkart',
    status: 409,
    latencyMs: 72,
    reasonCode: 'IDEMPOTENCY_CONFLICT',
    traceId: '0a1e035f-33c8-4d2f-a7c7-34d02b378d6f',
    intentId: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
    idempotencyKey: 'asdf',
    requestPayload: {
      envelope_id: '1ee6177c-a000-45b6-94ca-91b152894a84',
      idempotency_key: 'asdf',
      source_system: 'RAzerpay',
    },
    responsePayload: {
      conflict_with_trace_id: '0a1e035f-33c8-4d2f-a7c7-34d02b378d6f',
      final_state: 'RECEIVED',
    },
    timeline: ['Ingress Received', 'Idempotency Lookup', 'Conflict Detected', '409 Returned'],
  },
  {
    id: 'api_007',
    time: '17:59',
    minutesAgo: 21,
    method: 'POST',
    endpoint: '/v1/outbox/dispatch',
    tenant: 'Flipkart',
    status: 500,
    latencyMs: 208,
    reasonCode: 'PROVIDER_TIMEOUT',
    traceId: '0a1e035f-33c8-4d2f-a7c7-34d02b378d6f',
    intentId: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
    idempotencyKey: 'asdf',
    requestPayload: {
      event_id: '0dffdf61-9696-4f0f-aa6f-7fb5be097bd6',
      retry_count: 1,
      next_attempt_at: null,
    },
    responsePayload: {
      error: 'provider timeout',
      provider_status: 504,
    },
    timeline: ['Outbox Polled', 'Dispatch Attempt', 'Provider Timeout', 'Retry Scheduled'],
  },
  {
    id: 'api_008',
    time: '18:00',
    minutesAgo: 24,
    method: 'POST',
    endpoint: '/v1/outbox/dispatch',
    tenant: 'Flipkart',
    status: 200,
    latencyMs: 101,
    reasonCode: 'SUCCESS',
    traceId: '0a1e035f-33c8-4d2f-a7c7-34d02b378d6f',
    intentId: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
    idempotencyKey: 'asdf',
    requestPayload: {
      event_id: '0dffdf61-9696-4f0f-aa6f-7fb5be097bd6',
      retry_count: 1,
    },
    responsePayload: {
      status: 'SENT',
      sent_at: '2026-03-04T17:56:20.894662Z',
    },
    timeline: ['Retry Dispatch', 'Broker ACK', 'Marked SENT', 'Pipeline Healthy'],
  },
  {
    id: 'api_009',
    time: '18:01',
    minutesAgo: 27,
    method: 'GET',
    endpoint: '/v1/ingress/ce28601c-3bdc-4254-9ea8-3548ef05caf9',
    tenant: 'Zomato',
    status: 200,
    latencyMs: 39,
    reasonCode: 'SUCCESS',
    traceId: 'a4fc6945-4383-42ee-aa35-f224ed2082f5',
    intentId: 'N/A',
    idempotencyKey: 'asdf',
    requestPayload: {
      envelope_id: 'ce28601c-3bdc-4254-9ea8-3548ef05caf9',
    },
    responsePayload: {
      status: 'RECEIVED',
      source_system: 'RAzerpay',
      content_type: 'application/json',
    },
    timeline: ['Read Envelope', 'Vault Pointer Resolved', '200 Returned'],
  },
  {
    id: 'api_010',
    time: '18:02',
    minutesAgo: 31,
    method: 'GET',
    endpoint: '/v1/ingress/8cc0cbbd-0518-4be6-8601-997ab600ce6c',
    tenant: 'Swiggy',
    status: 200,
    latencyMs: 41,
    reasonCode: 'SUCCESS',
    traceId: 'a9351e66-ddf3-4fcb-a533-a6aa5a17d18e',
    intentId: 'N/A',
    idempotencyKey: 'asdf',
    requestPayload: {
      envelope_id: '8cc0cbbd-0518-4be6-8601-997ab600ce6c',
    },
    responsePayload: {
      status: 'RECEIVED',
      source_system: 'RAzerpay',
      content_type: 'application/json',
    },
    timeline: ['Read Envelope', 'Vault Pointer Resolved', '200 Returned'],
  },
  {
    id: 'api_011',
    time: '18:03',
    minutesAgo: 35,
    method: 'POST',
    endpoint: '/v1/ingress',
    tenant: 'Zomato',
    status: 401,
    latencyMs: 84,
    reasonCode: 'AUTH_FAILURE',
    traceId: 'a4fc6945-4383-42ee-aa35-f224ed2082f5',
    intentId: 'N/A',
    idempotencyKey: 'asdf',
    requestPayload: {
      envelope_id: 'ce28601c-3bdc-4254-9ea8-3548ef05caf9',
      source_system: 'RAzerpay',
    },
    responsePayload: {
      error: 'adapter auth failure',
      provider_status: 401,
    },
    timeline: ['Ingress Received', 'Auth Token Validation Failed', '401 Returned'],
  },
  {
    id: 'api_012',
    time: '18:04',
    minutesAgo: 39,
    method: 'POST',
    endpoint: '/v1/intents',
    tenant: 'Flipkart',
    status: 429,
    latencyMs: 67,
    reasonCode: 'RATE_LIMIT',
    traceId: '0a1e035f-33c8-4d2f-a7c7-34d02b378d6f',
    intentId: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
    idempotencyKey: 'asdf',
    requestPayload: {
      intent_id: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
      idempotency_key: 'asdf',
    },
    responsePayload: {
      provider_status: 429,
      retry_after_seconds: 30,
    },
    timeline: ['Intent Request Received', 'Rate Limit Check', 'Throttle Applied', '429 Returned'],
  },
  {
    id: 'api_013',
    time: '18:05',
    minutesAgo: 44,
    method: 'GET',
    endpoint: '/v1/outbox/0dffdf61-9696-4f0f-aa6f-7fb5be097bd6',
    tenant: 'Flipkart',
    status: 200,
    latencyMs: 43,
    reasonCode: 'SUCCESS',
    traceId: '0a1e035f-33c8-4d2f-a7c7-34d02b378d6f',
    intentId: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
    idempotencyKey: 'asdf',
    requestPayload: {
      event_id: '0dffdf61-9696-4f0f-aa6f-7fb5be097bd6',
      include: 'payload,status,retry_count',
    },
    responsePayload: {
      status: 'SENT',
      retry_count: 1,
      sent_at: '2026-03-04T17:56:20.894662Z',
    },
    timeline: ['Read Outbox Event', 'State Loaded', '200 Returned'],
  },
  {
    id: 'api_014',
    time: '18:06',
    minutesAgo: 49,
    method: 'POST',
    endpoint: '/v1/ingress',
    tenant: 'Swiggy',
    status: 500,
    latencyMs: 219,
    reasonCode: 'ADAPTER_DISCONNECTED',
    traceId: 'a9351e66-ddf3-4fcb-a533-a6aa5a17d18e',
    intentId: 'N/A',
    idempotencyKey: 'asdf',
    requestPayload: {
      envelope_id: '8cc0cbbd-0518-4be6-8601-997ab600ce6c',
      source_system: 'RAzerpay',
    },
    responsePayload: {
      error: 'adapter disconnected',
      provider_status: 'unreachable',
    },
    timeline: ['Ingress Received', 'Adapter Health Check Failed', '500 Returned'],
  },
  {
    id: 'api_015',
    time: '18:07',
    minutesAgo: 55,
    method: 'PUT',
    endpoint: '/v1/intents/6339e5ff-1267-4135-bfe3-07b0f4518ef5/replay',
    tenant: 'Flipkart',
    status: 200,
    latencyMs: 117,
    reasonCode: 'SUCCESS',
    traceId: '0a1e035f-33c8-4d2f-a7c7-34d02b378d6f',
    intentId: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
    idempotencyKey: 'asdf',
    requestPayload: {
      intent_id: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
      replay_mode: 'deterministic',
      idempotency_key: 'asdf',
    },
    responsePayload: {
      status: 'REPLAYED',
      outbox_event_id: '0dffdf61-9696-4f0f-aa6f-7fb5be097bd6',
    },
    timeline: ['Replay Request Received', 'Canonical Re-validation', 'Outbox Re-dispatch', '200 Returned'],
  },
]

export type WebhookEntry = {
  id: string
  time: string
  minutesAgo: number
  event: string
  provider: 'Stripe' | 'Razorpay' | 'Cashfree'
  tenant: string
  status: 'Delivered' | 'Failed' | 'Rejected'
  attempts: number
  response: string
  signatureVerification: 'Valid' | 'Invalid'
  endpoint: string
  traceId: string
  payload: Record<string, unknown>
}

export const WEBHOOK_EVENTS: WebhookEntry[] = [
  {
    id: 'wh_001',
    time: '17:56',
    minutesAgo: 7,
    event: 'outbox.intent.sent',
    provider: 'Razorpay',
    tenant: 'Flipkart',
    status: 'Delivered',
    attempts: 1,
    response: '200 OK',
    signatureVerification: 'Valid',
    endpoint: 'https://ops.internal/events/intents',
    traceId: '0a1e035f-33c8-4d2f-a7c7-34d02b378d6f',
    payload: {
      event_id: '0dffdf61-9696-4f0f-aa6f-7fb5be097bd6',
      event_type: 'eventTypePlaceholder',
      intent_id: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
      envelope_id: '1ee6177c-a000-45b6-94ca-91b152894a84',
      status: 'SENT',
    },
  },
  {
    id: 'wh_002',
    time: '17:57',
    minutesAgo: 10,
    event: 'outbox.intent.retry',
    provider: 'Razorpay',
    tenant: 'Flipkart',
    status: 'Failed',
    attempts: 2,
    response: '500 Error',
    signatureVerification: 'Valid',
    endpoint: 'https://ops.internal/events/intents',
    traceId: '0a1e035f-33c8-4d2f-a7c7-34d02b378d6f',
    payload: {
      event_id: '0dffdf61-9696-4f0f-aa6f-7fb5be097bd6',
      intent_id: '6339e5ff-1267-4135-bfe3-07b0f4518ef5',
      retry_count: 1,
      reason: 'provider timeout',
    },
  },
  {
    id: 'wh_003',
    time: '17:58',
    minutesAgo: 13,
    event: 'ingress.envelope.received',
    provider: 'Razorpay',
    tenant: 'Zomato',
    status: 'Delivered',
    attempts: 1,
    response: '200 OK',
    signatureVerification: 'Valid',
    endpoint: 'https://ops.internal/events/ingress',
    traceId: 'a4fc6945-4383-42ee-aa35-f224ed2082f5',
    payload: {
      envelope_id: 'ce28601c-3bdc-4254-9ea8-3548ef05caf9',
      tenant_id: '920d6a21-8e2d-4f18-9c23-7b9e2ea56107',
      source_system: 'RAzerpay',
      status: 'RECEIVED',
    },
  },
  {
    id: 'wh_004',
    time: '17:59',
    minutesAgo: 17,
    event: 'ingress.envelope.rejected',
    provider: 'Razorpay',
    tenant: 'Swiggy',
    status: 'Rejected',
    attempts: 1,
    response: '401 Invalid Signature',
    signatureVerification: 'Invalid',
    endpoint: 'https://ops.internal/events/ingress',
    traceId: 'a9351e66-ddf3-4fcb-a533-a6aa5a17d18e',
    payload: {
      envelope_id: '8cc0cbbd-0518-4be6-8601-997ab600ce6c',
      tenant_id: '20c14c08-8ceb-442d-8980-9b42bd3ac258',
      source_system: 'RAzerpay',
      reason: 'invalid signature',
    },
  },
]

export type AdapterStatusEntry = {
  id: string
  adapter: string
  sourceLogo: string
  rail: 'Gateway' | 'Card Network' | 'Bank'
  status: 'Healthy' | 'Degraded'
  errorRate: string
  lastEvent: string
  latency: string
  recentErrors: ReasonCode[]
  connectorVersion: string
  errorTrend24h: number[]
}

export const ADAPTER_STATUS: AdapterStatusEntry[] = [
  {
    id: 'adp_001',
    adapter: 'Razorpay',
    sourceLogo: '/sources/razorpay-clean-clean.png',
    rail: 'Gateway',
    status: 'Healthy',
    errorRate: '0.5%',
    lastEvent: '17:58',
    latency: '112ms',
    recentErrors: ['SUCCESS'],
    connectorVersion: 'v1.6.1',
    errorTrend24h: [1, 1, 2, 1, 1, 1],
  },
  {
    id: 'adp_002',
    adapter: 'Cashfree',
    sourceLogo: '/sources/cashfree-clean.png',
    rail: 'Gateway',
    status: 'Healthy',
    errorRate: '0.6%',
    lastEvent: '17:56',
    latency: '124ms',
    recentErrors: ['SUCCESS'],
    connectorVersion: 'v1.5.3',
    errorTrend24h: [1, 1, 1, 2, 1, 1],
  },
  {
    id: 'adp_003',
    adapter: 'Stripe',
    sourceLogo: '/sources/stripe-clean.png',
    rail: 'Gateway',
    status: 'Healthy',
    errorRate: '0.4%',
    lastEvent: '17:52',
    latency: '106ms',
    recentErrors: ['SUCCESS'],
    connectorVersion: 'v1.4.2',
    errorTrend24h: [0, 1, 0, 1, 0, 0],
  },
  {
    id: 'adp_004',
    adapter: 'PayPal',
    sourceLogo: '/sources/paypal-clean.png',
    rail: 'Gateway',
    status: 'Healthy',
    errorRate: '0.7%',
    lastEvent: '17:51',
    latency: '138ms',
    recentErrors: ['SUCCESS'],
    connectorVersion: 'v2.1.0',
    errorTrend24h: [1, 1, 1, 1, 2, 1],
  },
  {
    id: 'adp_005',
    adapter: 'Visa',
    sourceLogo: '/sources/visa-clean.png',
    rail: 'Card Network',
    status: 'Healthy',
    errorRate: '0.3%',
    lastEvent: '17:59',
    latency: '98ms',
    recentErrors: ['SUCCESS'],
    connectorVersion: 'v3.4.8',
    errorTrend24h: [0, 1, 0, 1, 0, 1],
  },
  {
    id: 'adp_006',
    adapter: 'Mastercard',
    sourceLogo: '/sources/mastercard-clean.png',
    rail: 'Card Network',
    status: 'Healthy',
    errorRate: '0.4%',
    lastEvent: '17:57',
    latency: '102ms',
    recentErrors: ['SUCCESS'],
    connectorVersion: 'v3.2.6',
    errorTrend24h: [1, 1, 0, 1, 1, 1],
  },
  {
    id: 'adp_007',
    adapter: 'SBI',
    sourceLogo: '/sources/sbi-clean.png',
    rail: 'Bank',
    status: 'Degraded',
    errorRate: '1.8%',
    lastEvent: '17:55',
    latency: '172ms',
    recentErrors: ['PROVIDER_TIMEOUT', 'AUTH_FAILURE'],
    connectorVersion: 'v1.2.9',
    errorTrend24h: [1, 2, 2, 3, 4, 3],
  },
  {
    id: 'adp_008',
    adapter: 'HDFC Bank',
    sourceLogo: '/sources/hdfc-bank-clean.png',
    rail: 'Bank',
    status: 'Degraded',
    errorRate: '1.5%',
    lastEvent: '17:48',
    latency: '161ms',
    recentErrors: ['PROVIDER_TIMEOUT'],
    connectorVersion: 'v1.1.7',
    errorTrend24h: [1, 2, 2, 2, 3, 2],
  },
]

const SENSITIVE_FIELD_MARKERS = [
  'authorization',
  'token',
  'secret',
  'signature',
  'private',
  'api_key',
  'apikey',
  'email',
  'phone',
  'account',
]

function isSensitiveField(fieldName: string) {
  const normalized = fieldName.toLowerCase()
  return SENSITIVE_FIELD_MARKERS.some((marker) => normalized.includes(marker))
}

function maskText(value: string) {
  if (value.length <= 6) return '***'
  return `${value.slice(0, 3)}***${value.slice(-3)}`
}

export function maskSensitiveData(value: unknown, fieldHint = ''): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveData(item, fieldHint))
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => {
      if (isSensitiveField(key)) {
        return [key, '[REDACTED]']
      }
      return [key, maskSensitiveData(nestedValue, key)]
    })
    return Object.fromEntries(entries)
  }

  if (typeof value === 'string') {
    if (isSensitiveField(fieldHint) || value.includes('@') || /^bearer\s+/i.test(value)) {
      return maskText(value)
    }
    return value
  }

  return value
}

export function stringifyMasked(value: unknown) {
  return JSON.stringify(maskSensitiveData(value), null, 2)
}
