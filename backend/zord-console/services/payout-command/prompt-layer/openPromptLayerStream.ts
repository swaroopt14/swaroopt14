export const PROMPT_LAYER_QUERY_STREAM_PATH = '/api/prompt-layer/query/stream'

export type OpenPromptLayerStreamParams = {
  query: string
  tenant_id: string
  top_k: number
}

export function openPromptLayerStream(
  params: OpenPromptLayerStreamParams,
  handlers: {
    onMessage: (data: string) => void
    onError?: (error: Event) => void
  },
) {
  const url = new URL(PROMPT_LAYER_QUERY_STREAM_PATH, window.location.origin)
  url.searchParams.set('query', params.query)
  url.searchParams.set('tenant_id', params.tenant_id)
  url.searchParams.set('top_k', String(params.top_k))

  const source = new EventSource(url.toString())
  source.onmessage = (event) => handlers.onMessage(event.data)
  source.onerror = (event) => {
    handlers.onError?.(event)
    source.close()
  }
  return source
}

