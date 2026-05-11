import { ZordLoginExperience } from '@/components/auth'
import { sanitizePostLoginNext } from '@/services/auth'

export default function ConsoleLoginPage({ searchParams }: { searchParams: { next?: string | string[] } }) {
  const raw = searchParams?.next
  const nextParam = Array.isArray(raw) ? raw[0] : raw
  const postLoginRedirect = nextParam ? sanitizePostLoginNext(nextParam, '/console') : undefined

  return (
    <ZordLoginExperience
      audience="Console Access"
      pageTitle="Sign in to Zord"
      pageDescription="Resume evidence tracing and payout visibility in the workspace your team already uses."
      heroEyebrow="Evidence-grade orchestration for modern payouts"
      heroTitle={`Trace every payout, every ack,\nand every proof artifact.`}
      heroDescription=""
      accessBadges={['Tenant-scoped sessions', 'Production MFA', 'Evidence export ready']}
      trustBadges={['SOC 2 workflow', 'Hash-linked audit trail', 'Sandbox safe']}
      stats={[
        { value: '99.97%', label: 'ingestion uptime' },
        { value: '<200ms', label: 'ack latency target' },
        { value: '24/7', label: 'evidence availability' },
      ]}
      highlights={[
        {
          title: 'Intent timeline',
          description: 'Follow payloads from receipt through canonicalization without losing tenant context or replay history.',
        },
        {
          title: 'Tamper-evident exports',
          description: 'Package timestamps, hashes, and supporting documents into audit-ready evidence without leaving the workspace.',
        },
        {
          title: 'Controlled promotion',
          description: 'Practice flows in sandbox, then switch to production access with mandatory MFA for higher-trust actions.',
        },
      ]}
      redirectTo="/console"
      postLoginRedirect={postLoginRedirect}
      role="CUSTOMER_USER"
    />
  )
}
