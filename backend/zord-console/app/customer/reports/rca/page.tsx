'use client'

const incidents = [
  {
    id: 'rca_20260302_011',
    title: 'UPI success rate dip (09:10-09:35)',
    impact: 'Auth success dropped from 94.8% to 89.9%',
    rootCause: 'Issuer timeout burst on provider route `upi_hdfc_primary`',
    fix: 'Auto-routed to backup rail and tightened timeout policy',
    status: 'Mitigated',
  },
  {
    id: 'rca_20260301_023',
    title: 'Settlement mismatch in provider fee component',
    impact: '38 intents had net amount variance > ₹5',
    rootCause: 'Fee slab version mismatch in recon parser',
    fix: 'Pinned parser version and replayed affected records',
    status: 'Resolved',
  },
  {
    id: 'rca_20260301_019',
    title: 'Webhook retry storm',
    impact: '2,412 delayed callbacks over 18 minutes',
    rootCause: 'Partner endpoint TLS handshake failures',
    fix: 'Backoff profile raised and endpoint health gating added',
    status: 'Monitoring',
  },
]

export default function CustomerRcaReportsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-cx-text">RCA & Incident Reports</h1>
        <p className="text-sm text-cx-neutral mt-0.5">Root-cause analysis with impact, trace links, and corrective actions.</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Open Incidents', value: '3' },
          { label: 'MTTR (7d)', value: '21m' },
          { label: 'Repeat Root Causes', value: '2' },
          { label: 'RCA Coverage', value: '100%' },
        ].map((summary) => (
          <div key={summary.label} className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">{summary.label}</p>
            <p className="mt-1.5 text-xl font-bold text-cx-text">{summary.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {incidents.map((item) => (
          <article key={item.id} className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-mono text-cx-purple-700">{item.id}</p>
                <h2 className="mt-1 text-sm font-semibold text-cx-text">{item.title}</h2>
              </div>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-cx-text">{item.status}</span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Impact</p>
                <p className="mt-1 text-xs text-cx-text">{item.impact}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Root Cause</p>
                <p className="mt-1 text-xs text-cx-text">{item.rootCause}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Corrective Action</p>
                <p className="mt-1 text-xs text-cx-text">{item.fix}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
