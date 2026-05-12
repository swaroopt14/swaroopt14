import { ZordLoginExperience } from '@/components/auth'

export default function AdminLoginPage() {
  return (
    <ZordLoginExperience
      audience="Admin Access"
      pageTitle="Open the governance console"
      pageDescription="Manage tenants, control access, and supervise platform policy with the same precision the rest of the system demands."
      heroEyebrow="Governance-first access for regulated platforms"
      heroTitle="Move from tenant oversight to platform control without losing the audit trail."
      heroDescription="Zord Admin keeps environment access, tenant governance, and platform-level decision making inside a secure flow that still feels fast for trusted operators."
      accessBadges={['Tenant governance', 'Access control', 'Platform-wide oversight']}
      trustBadges={['Role-locked access', 'MFA on production', 'Operator audit log']}
      stats={[
        { value: '100%', label: 'tenant visibility' },
        { value: '1 place', label: 'for access governance' },
        { value: 'Zero guesswork', label: 'on who changed what' },
      ]}
      highlights={[
        {
          title: 'Tenant lifecycle control',
          description: 'Review tenant posture, enable access, and track status changes without context switching across tools.',
        },
        {
          title: 'Safe privilege elevation',
          description: 'Protect sensitive actions with production MFA while keeping lower-risk review work quick.',
        },
        {
          title: 'Audit continuity',
          description: 'Every admin action stays anchored to a user, workspace, and time window for downstream review.',
        },
      ]}
      redirectTo="/admin/tenants"
      role="ADMIN"
    />
  )
}
