/**
 * Parallel load for Trace & evidence tables (Operations grid).
 * Breakpoint here for “full refresh”; use individual getters for a single route.
 */
import { getProdDlqPage } from './getProdDlqPage'
import { getProdIntentsPage } from './getProdIntentsPage'
import { getProdOverview } from './getProdOverview'
import { getProdPayoutContracts } from './getProdPayoutContracts'
import { getProdRawEnvelopesPage } from './getProdRawEnvelopesPage'
import { getProdTenantsPage } from './getProdTenantsPage'
import type {
  ApiDlqRow,
  ApiEnvelopeRow,
  ApiIntentRow,
  ApiListResponse,
  ApiOverviewResponse,
  ApiPayoutContract,
  ApiTenant,
} from './prodApiTypes'

export type ProdTraceTableDataset = {
  overview: ApiOverviewResponse | null
  intents: ApiListResponse<ApiIntentRow> | null
  envelopes: ApiListResponse<ApiEnvelopeRow> | null
  dlq: ApiListResponse<ApiDlqRow> | null
  contracts: ApiListResponse<ApiPayoutContract> | null
  tenants: ApiListResponse<ApiTenant> | null
}

export async function loadProdTraceTableDataset(): Promise<ProdTraceTableDataset> {
  const [overview, intents, envelopes, dlq, contracts, tenants] = await Promise.all([
    getProdOverview(),
    getProdIntentsPage(),
    getProdRawEnvelopesPage(),
    getProdDlqPage(),
    getProdPayoutContracts(),
    getProdTenantsPage(),
  ])
  return { overview, intents, envelopes, dlq, contracts, tenants }
}
