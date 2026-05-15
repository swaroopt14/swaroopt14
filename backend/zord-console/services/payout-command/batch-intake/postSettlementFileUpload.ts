/**
 * Step 2 — Settlement file → Next proxy → upstream POST /v1/settlement/upload
 * Breakpoint-friendly: all request/response handling lives here.
 */
import { errorMessageFromProxyResponse, normalizeAuthorizationHeader } from './intakeHttpShared'

export const SETTLEMENT_UPLOAD_PROXY_PATH = '/api/settlement/upload'

export type PostSettlementFileUploadParams = {
  file: File
  /** Optional; server uses `ZORD_SETTLEMENT_API_KEY` or `ZORD_BULK_INGEST_API_KEY` when unset. */
  apiKeyRaw?: string
  /** Ignored by BFF: tenant is injected from the signed-in session. */
  tenantId?: string
  psp: string
  batchId: string
  /** Override for tests */
  endpointPath?: string
}

export type PostSettlementFileUploadResult = {
  ok: boolean
  httpStatus: number
  responseText: string
  errorMessage: string | null
  requestUrl: string
}

export async function postSettlementFileUpload(params: PostSettlementFileUploadParams): Promise<PostSettlementFileUploadResult> {
  const base = params.endpointPath ?? SETTLEMENT_UPLOAD_PROXY_PATH
  const auth = normalizeAuthorizationHeader(params.apiKeyRaw ?? '')

  const psp = params.psp.trim()
  const q = new URLSearchParams({ psp })
  const requestUrl = `${base}?${q.toString()}`

  const formData = new FormData()
  formData.append('file', params.file, params.file.name)

  const uploadHeaders: Record<string, string> = {
    'Batch-Id': params.batchId.trim(),
    'X-Zord-Force-Reprocess': 'true',
    'X-Zord-Force-Reprocess-Reason': 'CLIENT_CORRECTED_FILE',
  }
  if (auth) uploadHeaders.authorization = auth

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: uploadHeaders,
    body: formData,
  })

  const responseText = await response.text()

  if (!response.ok) {
    return {
      ok: false,
      httpStatus: response.status,
      responseText,
      errorMessage: errorMessageFromProxyResponse(response.status, responseText),
      requestUrl,
    }
  }

  return {
    ok: true,
    httpStatus: response.status,
    responseText,
    errorMessage: null,
    requestUrl,
  }
}
