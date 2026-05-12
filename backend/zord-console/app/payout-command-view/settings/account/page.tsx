import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Account | Zord',
  description: 'Manage your name, email, password, and team.',
}

/**
 * Minimal Account page — name/email read-only display + change-password CTA.
 * Wired to existing auth surfaces in phase 2.
 */
export default function AccountSettingsPage() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#0f172a]">Account</h1>
        <p className="mt-1 text-[16px] text-[#64748b]">Your profile and security settings.</p>
      </div>

      <div className="space-y-4">
        <article className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          <header className="border-b border-[#E5E5E5] px-5 py-3">
            <p className="text-[17px] font-semibold text-[#0f172a]">Profile</p>
          </header>
          <div className="space-y-3 px-5 py-4">
            <Field label="Name" value="Alice Dev" />
            <Field label="Email" value="alice@example.com" />
            <Field label="Workspace" value="Arealis (workspace_zord_alice)" />
            <Field label="Role" value="Owner" />
          </div>
        </article>

        <article className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          <header className="border-b border-[#E5E5E5] px-5 py-3">
            <p className="text-[17px] font-semibold text-[#0f172a]">Security</p>
          </header>
          <div className="space-y-3 px-5 py-4">
            <Field label="Password" value="•••••••••" action="Change password" />
            <Field label="2FA" value="Not configured" action="Set up 2FA" />
            <Field label="Active sessions" value="1 (this browser)" action="View all" />
          </div>
        </article>

        <article className="overflow-hidden rounded-[16px] border border-rose-200 bg-rose-50/40 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          <header className="border-b border-rose-200 px-5 py-3">
            <p className="text-[17px] font-semibold text-rose-700">Danger zone</p>
          </header>
          <div className="space-y-3 px-5 py-4">
            <Field label="Delete account" value="Removes all sandbox data and revokes keys." action="Delete" destructive />
          </div>
        </article>
      </div>
    </>
  )
}

function Field({
  label,
  value,
  action,
  destructive,
}: {
  label: string
  value: string
  action?: string
  destructive?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">{label}</p>
        <p className="mt-0.5 text-[16px] text-[#0f172a]">{value}</p>
      </div>
      {action ? (
        <button
          type="button"
          className={`rounded-[6px] border px-2.5 py-1 text-[15px] font-medium transition ${
            destructive
              ? 'border-rose-300 bg-white text-rose-700 hover:bg-rose-100'
              : 'border-[#E5E5E5] bg-white text-[#475569] hover:bg-[#fafafa]'
          }`}
        >
          {action}
        </button>
      ) : null}
    </div>
  )
}
