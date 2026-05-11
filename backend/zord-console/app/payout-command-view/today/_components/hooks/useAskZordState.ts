'use client'

import { useCallback, useState } from 'react'
import type { AskZordResponse } from '@/services/payout-command/types'
import type { HomeCommandStatus } from '@/services/payout-command/model'
import {
  postPromptLayerQuery,
  PROMPT_LAYER_DEMO_TENANT_ID,
} from '@/services/payout-command/prompt-layer/postPromptLayerQuery'
import { parsePromptLayerAnswer } from '@/services/payout-command/prompt-layer/parsePromptLayerResponse'

// ── Ask Zord quick prompts ───────────────────────────────────────────────────
export const ASK_ZORD_QUICK_PROMPTS = [
  'Why is this payout still pending?',
  'Show all payouts stuck due to PSP issues in last 24h and total amount at risk.',
  'Generate an auditor-friendly explanation for contract X.',
] as const

// ── Public types ─────────────────────────────────────────────────────────────
export type AskZordState = {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  input: string
  setInput: (value: string) => void
  status: HomeCommandStatus
  response: AskZordResponse | null
  run: (prompt: string) => Promise<void>
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useAskZordState(activeSurfaceTitle: string): AskZordState {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<HomeCommandStatus>('idle')
  const [response, setResponse] = useState<AskZordResponse | null>(null)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((current) => !current), [])

  const run = useCallback(
    async (rawPrompt: string) => {
      const cleaned = rawPrompt.trim()
      if (!cleaned) return

      setIsOpen(true)
      setInput('')
      setStatus('loading')

      try {
        const { ok, payload } = await postPromptLayerQuery({
          query: cleaned,
          tenant_id: PROMPT_LAYER_DEMO_TENANT_ID,
          top_k: 6,
        })

        if (!ok) {
          const details =
            payload && typeof payload === 'object' && 'details' in payload && typeof (payload as { details?: unknown }).details === 'string'
              ? (payload as { details: string }).details
              : 'Prompt-layer request failed'
          throw new Error(details)
        }

        const parsed = parsePromptLayerAnswer(payload)
        if (!parsed) throw new Error('Prompt-layer returned an empty or invalid answer')

        setResponse({
          title: parsed.title,
          body: parsed.body,
          confidence: parsed.confidence,
          citationSnippet: parsed.citations[0]?.snippet ?? null,
          visualization: parsed.visualization,
        })
        setStatus('complete')
      } catch {
        setResponse({
          title: `${activeSurfaceTitle} analysis`,
          body: 'Prompt-layer is unavailable right now. Ask workspace can still provide simulated guidance, but this panel needs a live prompt-layer connection.',
          confidence: null,
          citationSnippet: null,
          visualization: null,
        })
        setStatus('complete')
      }
    },
    [activeSurfaceTitle],
  )

  return { isOpen, open, close, toggle, input, setInput, status, response, run }
}
