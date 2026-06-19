'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { LeakageWidgetId } from '../leakageWidgetLayout'
import { LEAKAGE_WIDGET_LABELS } from '../leakageWidgetLayout'

type LeakageWidgetChromeProps = {
  widgetId: LeakageWidgetId
  children: React.ReactNode
  onHide: (id: LeakageWidgetId) => void
  onMove: (id: LeakageWidgetId, direction: 'up' | 'down') => void
  batchId?: string
}

export function LeakageWidgetChrome({ widgetId, children, onHide, onMove, batchId }: LeakageWidgetChromeProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="relative" data-widget-id={widgetId}>
      <div className="absolute right-3 top-3 z-10">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm"
          aria-label={`${LEAKAGE_WIDGET_LABELS[widgetId]} menu`}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ⋮
        </button>
        {menuOpen ? (
          <div className="absolute right-0 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <Link
              href={`/payout-command-view/today?dock=workspace${batchId ? `&batch_id=${encodeURIComponent(batchId)}` : ''}`}
              className="block px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50"
            >
              Ask about this data
            </Link>
            <Link
              href="/payout-command-view/batch-command-center"
              className="block px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50"
            >
              View Batches
            </Link>
            <Link
              href="/payout-command-view/today?dock=connectors"
              className="block px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50"
            >
              Integrations
            </Link>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-[12px] text-slate-700 hover:bg-slate-50"
              onClick={() => onMove(widgetId, 'up')}
            >
              Move up
            </button>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-[12px] text-slate-700 hover:bg-slate-50"
              onClick={() => onMove(widgetId, 'down')}
            >
              Move down
            </button>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-[12px] text-red-600 hover:bg-red-50"
              onClick={() => {
                onHide(widgetId)
                setMenuOpen(false)
              }}
            >
              Hide widget
            </button>
          </div>
        ) : null}
      </div>
      {children}
    </div>
  )
}
