'use client'

import { useParams, useRouter } from 'next/navigation'

export default function CustomerTestPlaceholderPage() {
  const params = useParams<{ slug: string[] }>()
  const router = useRouter()
  const title = (params.slug ?? [])
    .map((part) => part.replace(/-/g, ' '))
    .join(' / ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

  return (
    <div className="w-full p-6 lg:p-8">
      <main className="ct-main-panel mt-1 bg-gradient-to-b from-[#f9fbff] via-[#f7f8fa] to-[#f6f7fa] px-6 pb-7 pt-6">
        <div className="flex items-center justify-between border-b border-gray-200/80 pb-5">
          <h2 className="text-[30px] font-semibold tracking-tight text-gray-900">{title}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => router.back()} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700">
              Go Back
            </button>
            <button onClick={() => router.push('/customer-test')} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700">
              Go Dashboard
            </button>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white/85 p-5 text-sm text-gray-700">
          This page is active and clickable. You can use it as a working placeholder until the full module UI is built.
        </div>
      </main>
    </div>
  )
}
