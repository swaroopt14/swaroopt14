'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { getCustomerTestSearchEntries, rankCustomerTestSearchEntries } from '../search-catalog'

function CustomerTestSearchContent() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const entries = rankCustomerTestSearchEntries(query, getCustomerTestSearchEntries(), 50)

  return (
    <div className="w-full p-6 lg:p-8">
      <main className="ct-main-panel mt-1 bg-gradient-to-b from-[#f9fbff] via-[#f7f8fa] to-[#f6f7fa] px-6 pb-7 pt-6">
        <div className="border-b border-gray-200/80 pb-5">
          <h2 className="text-[30px] font-semibold tracking-tight text-gray-900">Global Search Results</h2>
          <p className="mt-1 text-sm text-gray-600">
            Query: <span className="font-medium text-gray-800">{query || '—'}</span>
          </p>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {entries.length ? (
            <div className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <Link key={entry.id} href={entry.href} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">{entry.title}</span>
                    <span className="block truncate text-xs text-gray-500">{entry.subtitle}</span>
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase text-gray-600">{entry.type}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-sm text-gray-500">No results found for this query.</div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function CustomerTestSearchPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full p-6 lg:p-8">
          <main className="ct-main-panel mt-1 bg-gradient-to-b from-[#f9fbff] via-[#f7f8fa] to-[#f6f7fa] px-6 pb-7 pt-6">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-sm text-gray-600">Loading search...</div>
          </main>
        </div>
      }
    >
      <CustomerTestSearchContent />
    </Suspense>
  )
}
