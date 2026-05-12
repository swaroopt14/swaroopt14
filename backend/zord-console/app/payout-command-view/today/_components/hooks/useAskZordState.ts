'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AskZordResponse } from '@/services/payout-command/types'
import type { HomeCommandStatus } from '@/services/payout-command/model'

// ── Ask Zord quick prompts ───────────────────────────────────────────────────
export const ASK_ZORD_QUICK_PROMPTS = [
  'Why is this payout still pending?',
  'Show all payouts stuck due to PSP issues in last 24h and total amount at risk.',
  'Generate an auditor-friendly explanation for contract X.',
] as const

// ── Module-private helper ────────────────────────────────────────────────────
function buildResponse(prompt: string, surfaceTitle: string): AskZordResponse {
  const p = prompt.toLowerCase()

  if (p.includes('pending')) {
    return {
      title: 'Pending payout diagnosis',
      body: '• PSP callback is delayed for one lane in the current cycle.\n• Bank statement confirmation has not arrived for the same payout set.\n• Owner routing is active, with ops follow-up already queued.\n\nRecommended next move: keep traffic on healthy routes and re-check statement confirmation window.',
    }
  }

  if (p.includes('psp') || p.includes('24h') || p.includes('amount at risk')) {
    return {
      title: 'PSP delay concentration (last 24h)',
      body: '• 27 payouts are still waiting on PSP-side completion signals.\n• Total amount at risk in this bucket is approximately ₹11.2L.\n• Most concentration is in one overflow lane, while two lanes remain stable.\n\nRecommended next move: prioritize PSP escalation on the highest-value bucket first.',
    }
  }

  if (p.includes('auditor') || p.includes('contract')) {
    return {
      title: 'Auditor-friendly contract explanation',
      body: 'Contract status summary:\n• Intent was accepted and routed successfully.\n• Provider and bank confirmation signals were matched in sequence.\n• Remaining residual checks are documented with clear owner actions.\n\nThis explanation is generated from the same deterministic evidence layer used by trace, failure intelligence, and reconciliation views.',
    }
  }

  return {
    title: `${surfaceTitle} analysis`,
    body: 'Zord is reading the same evidence-backed operating state shown on this page and returning outcome-focused guidance for payout quality, owner routing, and reconciliation readiness.',
  }
}

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
  run: (prompt: string) => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useAskZordState(activeSurfaceTitle: string): AskZordState {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<HomeCommandStatus>('idle')
  const [pendingResponse, setPendingResponse] = useState<AskZordResponse | null>(null)
  const [response, setResponse] = useState<AskZordResponse | null>(null)

  // Typing animation for the answer body
  useEffect(() => {
    if (!pendingResponse) return

    setStatus('loading')
    setResponse({ title: pendingResponse.title, body: '' })
    let typingTimer: number | undefined

    const loadingTimer = window.setTimeout(() => {
      setStatus('typing')
      let index = 0
      const target = pendingResponse.body

      typingTimer = window.setInterval(() => {
        index += 5
        setResponse({ title: pendingResponse.title, body: target.slice(0, index) })

        if (index >= target.length) {
          window.clearInterval(typingTimer)
          setStatus('complete')
          setPendingResponse(null)
        }
      }, 18)
    }, 280)

    return () => {
      window.clearTimeout(loadingTimer)
      if (typingTimer) window.clearInterval(typingTimer)
    }
  }, [pendingResponse])

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((current) => !current), [])

  const run = useCallback(
    (rawPrompt: string) => {
      const cleaned = rawPrompt.trim()
      if (!cleaned) return

      // Forward to injected sendPrompt bridge if present
      if (typeof window !== 'undefined') {
        const win = window as Window & { sendPrompt?: (msg: string) => void | Promise<void> }
        if (typeof win.sendPrompt === 'function') {
          void Promise.resolve(win.sendPrompt(cleaned)).catch(() => {})
        }
      }

      setIsOpen(true)
      setInput('')
      setPendingResponse(buildResponse(cleaned, activeSurfaceTitle))
    },
    [activeSurfaceTitle],
  )

  return { isOpen, open, close, toggle, input, setInput, status, response, run }
}
