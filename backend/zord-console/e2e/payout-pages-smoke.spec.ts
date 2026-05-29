import { test, expect, type BrowserContext, type Page } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const SESSION_TENANT = 'e2e-session-tenant-111'
const BATCH_ID = 'e2e-batch-222'

const EVIDENCE_BATCH = 'e2e-evidence-batch'
const INTENT_A = 'e2e-intent-aaa'
const INTENT_B = 'e2e-intent-bbb'
const PACK_BATCH = 'pack-batch-001'
const PACK_INTENT_A = 'pack-intent-a'
const PACK_INTENT_B = 'pack-intent-b'

/** Live payout console docks (excludes sandbox-only). */
const DOCK_CASES: { dock: string; title: string }[] = [
  { dock: 'home', title: 'Payment Command Center' },
  { dock: 'workspace', title: 'Payment Operations View' },
  { dock: 'leakage', title: 'Payment Gaps & Value at Risk' },
  { dock: 'ambiguity', title: 'Matching Confidence' },
  { dock: 'grid', title: 'Intent Journal' },
  { dock: 'settlement', title: 'Settlement Journal' },
  { dock: 'connectors', title: 'Routing & Network Intelligence' },
  { dock: 'sync', title: 'Connected Systems' },
  { dock: 'proof', title: 'Evidence & Dispute Resolution' },
  { dock: 'billing', title: 'Billing' },
]

const STANDALONE_ROUTES = [
  '/payout-command-view/batch-command-center',
  '/payout-command-view/connector-intelligence',
  `/payout-command-view/evidence-pack/${PACK_BATCH}?tab=graph&batch_id=${encodeURIComponent(EVIDENCE_BATCH)}`,
  '/payout-command-view/settings/account',
  '/payout-command-view/settings/api-keys',
]

type ProdCapture = { pathname: string; searchParams: URLSearchParams }

function captureProdGet(url: string): ProdCapture | null {
  try {
    const u = new URL(url)
    if (!u.pathname.startsWith('/api/prod/')) return null
    return { pathname: u.pathname, searchParams: u.searchParams }
  } catch {
    return null
  }
}

async function installPayoutSessionCookies(context: BrowserContext) {
  await context.addCookies([
    { name: 'zord_access_token', value: 'e2e-playwright-access', url: BASE_URL },
    { name: 'zord_role', value: 'CUSTOMER_USER', url: BASE_URL },
  ])
}

function packSummary(
  packId: string,
  opts: {
    intentId?: string
    batchId?: string
    mode: string
    ref?: string
    leafCount?: number
    requiredLeafCount?: number
  },
) {
  return {
    evidence_pack_id: packId,
    tenant_id: SESSION_TENANT,
    intent_id: opts.intentId,
    batch_id: opts.batchId,
    client_reference: opts.ref ?? packId,
    client_payout_ref: opts.ref ?? packId,
    mode: opts.mode,
    pack_status: 'READY',
    merkle_root: 'a'.repeat(64),
    ruleset_version: '1',
    created_at: '2026-05-01T12:00:00Z',
    leaf_count: opts.leafCount ?? 4,
    required_leaf_count: opts.requiredLeafCount,
    artifact_count: opts.leafCount ?? 4,
  }
}

function packFull(packId: string, intentId: string, mode: string) {
  return {
    evidence_pack_id: packId,
    tenant_id: SESSION_TENANT,
    intent_id: intentId,
    contract_id: 'contract-smoke',
    mode,
    pack_status: 'READY',
    items: [
      { type: 'CANONICAL_INTENT', ref: 'ref-1', schema_version: '1', hash: 'h1', leaf_hash: 'lh1' },
      { type: 'ATTACHMENT_DECISION', ref: 'ref-2', schema_version: '1', hash: 'h2', leaf_hash: 'lh2' },
    ],
    merkle_root: 'b'.repeat(64),
    ruleset_version: '1',
    created_at: '2026-05-01T12:00:00Z',
  }
}

function emptyProdBody(path: string): unknown {
  if (path.endsWith('/intents/batch-ids')) {
    return { items: [{ batch_id: BATCH_ID, intent_count: 0 }] }
  }
  if (path.endsWith('/intelligence/batches')) {
    return { tenant_id: SESSION_TENANT, batches: [{ batch_id: BATCH_ID, finality_status: 'OPEN', total_count: 1 }] }
  }
  if (path.includes('/intelligence/batches/')) {
    return { batch_id: BATCH_ID, tenant_id: SESSION_TENANT, data_available: false }
  }
  if (path.endsWith('/intents/payment-intents') || path.endsWith('/intents/dlq-items')) {
    return { items: [] }
  }
  if (path.endsWith('/evidence/packs')) {
    return { packs: [], total: 0 }
  }
  if (/\/evidence\/batch\/[^/]+\/intents$/.test(path)) {
    return { packs: [], total: 0 }
  }
  if (path.endsWith('/ambiguity/velocity')) {
    return { data_available: false, points: [] }
  }
  if (path.endsWith('/intelligence/timeseries/leakage')) {
    return { data_available: false, points: [], granularity: 'day' }
  }
  if (path.endsWith('/settlement/observations/batches')) {
    return { items: [], client_batch_ids: [BATCH_ID] }
  }
  if (path.includes('/intelligence/')) {
    return { data_available: false, tenant_id: SESSION_TENANT }
  }
  if (path.endsWith('/ingest-status')) {
    return { status: 'unknown', sources: [] }
  }
  if (path.endsWith('/systems/sync-status')) {
    return { connectors: [], systems: [] }
  }
  return {}
}

function evidenceFixtureBody(path: string, search: URLSearchParams): unknown {
  if (/\/evidence\/batch\/[^/]+\/intents$/.test(path)) {
    const batchId = path.split('/').slice(-2, -1)[0] ?? EVIDENCE_BATCH
    if (batchId === EVIDENCE_BATCH) {
      return {
        packs: [
          packSummary(PACK_INTENT_A, {
            intentId: INTENT_A,
            batchId: EVIDENCE_BATCH,
            mode: 'INTELLIGENCE_ATTACH',
            ref: 'ZORD_PAY_A',
            leafCount: 9,
            requiredLeafCount: 5,
          }),
          packSummary(PACK_INTENT_B, {
            intentId: INTENT_B,
            batchId: EVIDENCE_BATCH,
            mode: 'INTELLIGENCE_ATTACH',
            ref: 'ZORD_PAY_B',
            leafCount: 9,
            requiredLeafCount: 9,
          }),
        ],
        total: 2,
      }
    }
    return { packs: [], total: 0 }
  }
  if (/\/evidence\/packs\/[^/]+$/.test(path) && !path.endsWith('/verify') && !path.endsWith('/timeline')) {
    const packId = path.split('/').pop() ?? PACK_BATCH
    const intent =
      packId === PACK_INTENT_A ? INTENT_A : packId === PACK_INTENT_B ? INTENT_B : INTENT_A
    const mode =
      packId === PACK_BATCH ? 'BATCH_PROOF' : 'INTELLIGENCE_INTENT'
    return packFull(packId, intent, mode)
  }
  if (!path.endsWith('/evidence/packs')) return emptyProdBody(path)

  const intentId = search.get('intent_id')
  const batchId = search.get('batch_id')
  if (intentId === INTENT_A) {
    return {
      packs: [
        packSummary(PACK_INTENT_A, {
          intentId: INTENT_A,
          mode: 'INTELLIGENCE_INTENT',
          ref: 'PAY-A',
          leafCount: 9,
          requiredLeafCount: 5,
        }),
      ],
      total: 1,
    }
  }
  if (intentId === INTENT_B) {
    return {
      packs: [
        packSummary(PACK_INTENT_B, {
          intentId: INTENT_B,
          mode: 'INTELLIGENCE_INTENT',
          ref: 'PAY-B',
          leafCount: 9,
          requiredLeafCount: 9,
        }),
      ],
      total: 1,
    }
  }
  if (batchId === EVIDENCE_BATCH) {
    return {
      packs: [
        packSummary(PACK_BATCH, {
          mode: 'BATCH_PROOF',
          ref: 'BATCH-REF',
          batchId: EVIDENCE_BATCH,
          leafCount: 6,
          requiredLeafCount: 6,
        }),
      ],
      total: 1,
    }
  }
  return { packs: [], total: 0 }
}

function installAuthRoutes(page: Page) {
  return Promise.all([
    page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: { tenant_id: SESSION_TENANT },
          user: { tenant_id: SESSION_TENANT },
        }),
      })
    }),
    page.route('**/api/sandbox/workspace-api-keys', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tenant_id: SESSION_TENANT }),
      })
    }),
  ])
}

function installEmptyProdMocks(page: Page) {
  return page.route('**/api/prod/**', async (route) => {
    const method = route.request().method()
    if (method === 'POST' && /\/evidence\/packs\/[^/]+\/verify$/.test(new URL(route.request().url()).pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'VERIFIED',
          evidence_pack_id: PACK_BATCH,
          checked_at: new Date().toISOString(),
          stored_root: 'a'.repeat(64),
          computed_root: 'a'.repeat(64),
          explanation: 'Merkle root reproduced exactly from live database entries.',
        }),
      })
      return
    }
    if (method !== 'GET') {
      await route.continue()
      return
    }
    const url = new URL(route.request().url())
    const path = url.pathname
    let body: unknown = emptyProdBody(path)
    if (/\/evidence\/packs\/[^/]+\/timeline$/.test(path)) {
      body = {
        evidence_pack_id: path.split('/').slice(-2, -1)[0],
        intent_id: INTENT_A,
        timeline: [
          { timestamp: '2026-05-01T12:00:00Z', event: 'Payment instruction received', node_id: 'n1' },
        ],
      }
    }
    if (/\/evidence\/packs\/[^/]+$/.test(path) && !path.endsWith('/verify') && !path.endsWith('/timeline')) {
      const packId = path.split('/').pop() ?? PACK_BATCH
      body = packFull(packId, INTENT_A, 'BATCH_PROOF')
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}

function installEvidenceFixtureMocks(page: Page) {
  return page.route('**/api/prod/**', async (route) => {
    const method = route.request().method()
    const url = new URL(route.request().url())
    const path = url.pathname

    if (method === 'POST' && /\/evidence\/packs\/[^/]+\/verify$/.test(path)) {
      const packId = path.split('/').slice(-2, -1)[0] ?? PACK_BATCH
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'VERIFIED',
          evidence_pack_id: packId,
          checked_at: new Date().toISOString(),
          stored_root: 'c'.repeat(64),
          computed_root: 'c'.repeat(64),
          explanation: 'Merkle root reproduced exactly from live database entries.',
        }),
      })
      return
    }

    if (method !== 'GET') {
      await route.continue()
      return
    }

    if (path.endsWith('/intelligence/batches')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenant_id: SESSION_TENANT,
          batches: [{ batch_id: EVIDENCE_BATCH, finality_status: 'OPEN', total_count: 2 }],
        }),
      })
      return
    }
    if (path.endsWith('/intents/payment-intents')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { intent_id: INTENT_A, client_payout_ref: 'PAY-A', batch_id: EVIDENCE_BATCH },
            { intent_id: INTENT_B, client_payout_ref: 'PAY-B', batch_id: EVIDENCE_BATCH },
          ],
        }),
      })
      return
    }
    if (path.includes('/evidence/') || path.includes('/intelligence/')) {
      const body = path.includes('/evidence/')
        ? evidenceFixtureBody(path, url.searchParams)
        : { data_available: false, tenant_id: SESSION_TENANT }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(emptyProdBody(path)),
    })
  })
}

async function preparePage(page: Page, context: BrowserContext, prodMock: (page: Page) => Promise<void>) {
  await installPayoutSessionCookies(context)
  await installAuthRoutes(page)
  await prodMock(page)
  await page.addInitScript((tid) => {
    localStorage.setItem('zord_tenant_id', tid)
  }, SESSION_TENANT)
  await page.goto(`${BASE_URL}/payout-command-view/today?dock=home`)
  await expect(page.getByRole('heading', { name: 'Payment Command Center', level: 1 }).first()).toBeVisible({
    timeout: 20_000,
  })
}

async function expectNoRuntimeOverlay(page: Page) {
  await expect(page.getByText('Application error')).toHaveCount(0)
  await expect(page.getByText('Unhandled Runtime Error')).toHaveCount(0)
}

test.describe('payout console pages smoke (empty prod → strict no-data states)', () => {
  test.beforeEach(async ({ page, context }) => {
    await preparePage(page, context, installEmptyProdMocks)
  })

  for (const { dock, title } of DOCK_CASES) {
    test(`dock=${dock} renders ${title}`, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (err) => pageErrors.push(err.message))

      await page.goto(`/payout-command-view/today?dock=${dock}`)
      await expect(page.getByRole('heading', { name: title, level: 1 }).first()).toBeVisible({ timeout: 25_000 })
      await expectNoRuntimeOverlay(page)
      expect(pageErrors, `page errors on dock=${dock}`).toEqual([])
    })
  }

  test('navy KPI heroes render all expected bucket counts', async ({ page }) => {
    await page.goto('/payout-command-view/today?dock=grid')
    await expect(page.getByTestId('intent-kpi-hero')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-testid^="intent-kpi-hero-bucket-"]')).toHaveCount(5)

    await page.goto('/payout-command-view/today?dock=settlement')
    await expect(page.getByTestId('settlement-kpi-hero')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-testid^="settlement-kpi-hero-bucket-"]')).toHaveCount(5)

    await page.goto('/payout-command-view/today?dock=ambiguity')
    await expect(page.getByTestId('ambiguity-kpi-hero')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-testid^="ambiguity-kpi-hero-bucket-"]')).toHaveCount(4)

    await page.goto('/payout-command-view/today?dock=proof')
    await expect(page.getByTestId('evidence-kpi-hero')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-testid^="evidence-kpi-hero-bucket-"]')).toHaveCount(6)
  })

  test('leakage keeps 2x2 KPI structure with dark hero styling', async ({ page }) => {
    await page.goto('/payout-command-view/today?dock=leakage')
    await expect(page.getByTestId('leakage-kpi-strip')).toBeVisible({ timeout: 20_000 })
    const hero = page.getByTestId('leakage-kpi-hero')
    await expect(hero).toBeVisible({ timeout: 20_000 })
    await expect(hero).toHaveAttribute('style', /0f172a/i)
    await expect(page.locator('[data-testid^="leakage-kpi-secondary-"]')).toHaveCount(4)
  })

  test('leakage shows no-data state on comparison chart when API series is unavailable', async ({ page }) => {
    await page.goto('/payout-command-view/today?dock=leakage')
    await expect(page.getByText('No data available for selected period.')).toBeVisible({ timeout: 20_000 })
  })

  test('ambiguity shows no-data state on velocity scatter when API points are unavailable', async ({ page }) => {
    await page.goto('/payout-command-view/today?dock=ambiguity')
    await expect(page.getByText('Ambiguity Velocity')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('No points to display.')).toBeVisible({ timeout: 20_000 })
  })

  test('kpi surfaces do not render known fixed fallback amount patterns', async ({ page }) => {
    const disallowed = /26129543|26,129,543/
    for (const dock of ['home', 'leakage', 'workspace', 'proof']) {
      await page.goto(`/payout-command-view/today?dock=${dock}`)
      await expect(page.locator('body')).not.toContainText(disallowed)
    }
  })

  test('connectors renders routing wireframe sections and drawer drill-down', async ({ page }) => {
    await page.goto('/payout-command-view/today?dock=connectors')
    await expect(page.getByRole('heading', { name: 'Routing & Network Intelligence', level: 1 })).toBeVisible({
      timeout: 25_000,
    })
    await expect(page.getByTestId('routing-kpi-bar')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('network-health-chart')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('leakage-composition-chart')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('recommended-routes')).toContainText('Razorpay → UPI → HDFC')
    await expect(page.getByTestId('connector-grid')).toContainText('Recommended Action')
    await page.getByText('ICICI Bank').first().click()
    await expect(page.getByTestId('connector-drawer')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('connector-drawer')).toContainText('Top failures')
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByTestId('connector-drawer')).toHaveCount(0)
  })

  test('evidence charts show Preview when packs empty', async ({ page }) => {
    await page.goto(`/payout-command-view/today?dock=proof&batch_id=${encodeURIComponent(BATCH_ID)}`)
    await expect(page.getByRole('heading', { name: 'Evidence & Dispute Resolution', level: 1 })).toBeVisible({
      timeout: 25_000,
    })
    await expect(page.getByText('Preview', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  })

  for (const path of STANDALONE_ROUTES) {
    test(`standalone ${path.split('?')[0]} loads`, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (err) => pageErrors.push(err.message))
      await page.goto(path)
      await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
      await expectNoRuntimeOverlay(page)
      expect(pageErrors, `errors on ${path}`).toEqual([])
    })
  }

  test('batch command center shows Payment Batch Review heading', async ({ page }) => {
    await page.goto('/payout-command-view/batch-command-center')
    await expect(page.getByTestId('batch-review-page')).toBeVisible({ timeout: 25_000 })
    await expect(page.getByRole('heading', { name: 'Payment Batch Review', level: 1 })).toBeVisible({
      timeout: 25_000,
    })
    await expect(page.getByText('File processing status')).toHaveCount(0)
    await expect(page.getByText('Batch Progress')).toHaveCount(0)
    await expectNoRuntimeOverlay(page)
  })
})

test.describe('evidence batch → intent → pack wiring', () => {
  test.beforeEach(async ({ page, context }) => {
    await preparePage(page, context, installEvidenceFixtureMocks)
  })

  test('evidence proof dock shows reshaped browser columns and merged packs', async ({ page }) => {
    await page.goto(`/payout-command-view/today?dock=proof&batch_id=${encodeURIComponent(EVIDENCE_BATCH)}`)
    await expect(page.getByRole('heading', { name: 'Evidence & Dispute Resolution', level: 1 })).toBeVisible({
      timeout: 25_000,
    })
    await expect(page.getByRole('columnheader', { name: 'Evidence Pack' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('columnheader', { name: 'Intent' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Proof Root' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Score' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Leaves' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Generated' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Batch' })).toHaveCount(0)
    await expect(page.getByText(EVIDENCE_BATCH).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(PACK_INTENT_A).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('9/9').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('1100%')).toHaveCount(0)
  })

  test('fan-out API calls and table on Evidence dock', async ({ page }) => {
    const captures: ProdCapture[] = []
    page.on('request', (req) => {
      if (req.method() !== 'GET') return
      const cap = captureProdGet(req.url())
      if (cap) captures.push(cap)
    })

    await page.goto(
      `/payout-command-view/today?dock=proof&batch_id=${encodeURIComponent(EVIDENCE_BATCH)}`,
    )
    await expect(page.getByRole('heading', { name: 'Evidence & Dispute Resolution', level: 1 })).toBeVisible({
      timeout: 25_000,
    })
    await expect(page.getByRole('link', { name: 'View graph' }).first()).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(PACK_BATCH).first()).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(PACK_INTENT_A).first()).toBeVisible({ timeout: 25_000 })

    const packs = captures.filter((c) => c.pathname.endsWith('/evidence/packs'))
    expect(packs.some((c) => c.searchParams.get('batch_id') === EVIDENCE_BATCH)).toBe(true)
    expect(packs.some((c) => c.searchParams.get('intent_id') === INTENT_A)).toBe(true)
    expect(packs.some((c) => c.searchParams.get('intent_id') === INTENT_B)).toBe(true)

    await expect(page.getByText('Batch pack').first()).toBeVisible({ timeout: 10_000 })

    await page.getByRole('link', { name: 'View graph' }).first().click()
    await expect(page.getByText('Operational proof timeline')).toHaveCount(0)
  })
})
