'use client'

import Link from 'next/link'
import BulkCsvPaymentsPanel from '../_components/BulkCsvPaymentsPanel'

export default function CustomerTestBulkCsvUploadPage() {
  return (
    <div className="w-full p-6 lg:p-8">
      <main className="ct-main-panel mt-1 overflow-hidden p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Bulk CSV Upload</h1>
            <p className="mt-1 text-sm text-slate-600">
              Upload and validate payment batches before simulation or applying them in create payment.
            </p>
          </div>
          <Link
            href="/customer-test/create-payment-request"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Open Create Payment Request
          </Link>
        </div>

        <BulkCsvPaymentsPanel
          heading="Bulk CSV Upload"
          description="Template-driven ingestion with field checks, preview rows, and simulation queue for sandbox runs."
        />
      </main>
    </div>
  )
}
