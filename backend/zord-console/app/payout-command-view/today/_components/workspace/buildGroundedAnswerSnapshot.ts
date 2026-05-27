import type { PaymentCommandLifecycleState } from '../command-center/paymentCommandDataState'
import { fmtInrFull } from '../command-center/commandCenterFormat'
import { PAYMENT_OPERATIONS } from './paymentOperationsCopy'

export type GroundedAnswerInput = {
  lifecycle: PaymentCommandLifecycleState
  hasLiveData: boolean
  matchConfidencePct: number | null
  refCompletenessPct: number | null
  reviewMinor: number
  ambiguousCount: number
  intentMissing: boolean
  ingestIncomplete: boolean
}

export function buildGroundedAnswerSnapshot(input: GroundedAnswerInput): string {
  const {
    lifecycle,
    hasLiveData,
    matchConfidencePct,
    refCompletenessPct,
    reviewMinor,
    ambiguousCount,
    intentMissing,
    ingestIncomplete,
  } = input

  if (!hasLiveData || ingestIncomplete) {
    return (
      'Zord does not have enough payment data for this period yet. ' +
      'Upload payment instructions (intent file/API) and bank or settlement confirmation files so Zord can calculate gaps, match confidence, and proof readiness.'
    )
  }

  if (intentMissing || lifecycle === 'settlement_only') {
    return (
      'Zord has received settlement data but not the original payment instruction file for this period. ' +
      'Upload the intent file or connect your Tally/SAP/API source to complete payment proof and gap analysis.'
    )
  }

  const reviewValue = fmtInrFull(reviewMinor, { decimals: 0 })
  const hasReview = reviewMinor > 0 || ambiguousCount > 0

  if (!hasReview && matchConfidencePct != null && matchConfidencePct >= 85) {
    const refPart =
      refCompletenessPct != null ? ` Reference completeness is ${Math.round(refCompletenessPct)}%.` : ''
    return (
      `Zord found no ambiguous payment matches in this period. Average match confidence is ${Math.round(matchConfidencePct)}%.${refPart} ` +
      'No value is currently marked for review. Next step: confirm proof readiness and export if finance needs audit packets.'
    )
  }

  if (hasReview) {
    const confPart =
      matchConfidencePct != null ? ` Average match confidence is ${Math.round(matchConfidencePct)}%.` : ''
    return (
      `${ambiguousCount > 0 ? `${ambiguousCount} payment(s)` : 'Some payments'} need review because Zord found weak references or possible duplicate matches.${confPart} ` +
      `Total value requiring review is ${reviewValue}. Next step: open Payment Review and upload any missing bank references.`
    )
  }

  return (
    'Zord is analyzing payment instructions against bank and settlement outcomes for your tenant. ' +
    'Ask a specific question about review items, missing files, or proof readiness.'
  )
}

export function groundedAnswerPanelTitle(): string {
  return 'Latest answer'
}

export function groundedAnswerDisclaimer(): string {
  return PAYMENT_OPERATIONS.askPanelSubtitle
}
