import { ZordLoginExperience } from '@/components/auth'

export default function OpsLoginPage() {
  return (
    <ZordLoginExperience
      audience="Ops Access"
      pageTitle="Enter the operations cockpit"
      pageDescription="Monitor cross-tenant activity, replay failed flows, and keep ingress health under control from one place."
      heroEyebrow="Platform-wide command for high-signal operations"
      heroTitle="Keep every queue, tenant, and recovery lane visible when the platform gets noisy."
      heroDescription="Zord Ops condenses event monitoring, DLQ recovery, and platform health into a single access point so operators can move fast without sacrificing control."
      accessBadges={['Cross-tenant visibility', 'Replay controls', 'DLQ triage ready']}
      trustBadges={['Production MFA', 'Session logging', 'Recovery guardrails']}
      stats={[
        { value: '3x', label: 'faster replay triage' },
        { value: '1 view', label: 'for queues and intent flow' },
        { value: '24/7', label: 'operator visibility' },
      ]}
      highlights={[
        {
          title: 'Replay confidence',
          description: 'Recover failed workflows with the same trace context that created the issue in the first place.',
        },
        {
          title: 'Ingress intelligence',
          description: 'Spot unhealthy envelopes and queue buildup before they cascade into tenant-facing incidents.',
        },
        {
          title: 'Audit-friendly response',
          description: 'Keep operational intervention visible for postmortems, compliance reviews, and customer follow-up.',
        },
      ]}
      redirectTo="/ops/intents"
      role="OPS"
    />
  )
}
