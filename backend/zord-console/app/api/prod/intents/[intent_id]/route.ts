import { NextRequest, NextResponse } from 'next/server'
import { fetchIntentById } from '@/services/backend/intents'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ intent_id: string }> }
) {
  try {
    const { intent_id } = await params

    if (!intent_id) {
      return NextResponse.json({ error: 'Intent ID is required' }, { status: 400 })
    }

    // Fetch from real backend (zord-intent-engine)
    const intent = await fetchIntentById(intent_id)

    if (!intent) {
      return NextResponse.json(
        { error: 'Intent not found' },
        { status: 404 }
      )
    }

    // Transform backend response to match frontend IntentDetail type
    const intentDetail = {
      intent_id: intent.intent_id,
      status: intent.status,
      source: intent.intent_type || 'API',
      canonical: {
        intent_type: intent.intent_type || 'PAYOUT',
        amount: {
          value: intent.amount,
          currency: intent.currency,
        },
        instrument: {
          kind: intent.beneficiary_type || 'BANK',
          account_token: '', // PII tokenized
        },
        purpose_code: '',
        constraints: intent.constraints || {},
      },
      lifecycle: [], // TODO: Add lifecycle events when available in backend
      evidence: {
        raw_envelope_id: intent.envelope_id,
        canonical_snapshot: '',
        outbox_event_id: '',
      },
      beneficiary: intent.beneficiary,
      pii_tokens: intent.pii_tokens,
      deadline_at: intent.deadline_at,
      confidence_score: intent.confidence_score,
      created_at: intent.created_at,
    }

    return NextResponse.json(intentDetail)
  } catch (error) {
    console.error('Error fetching intent detail from backend:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch intent' },
      { status: 500 }
    )
  }
}
