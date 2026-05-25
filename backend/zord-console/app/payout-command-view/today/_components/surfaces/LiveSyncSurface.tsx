'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LiveDataHint } from '../shared'
import { fetchProdJsonGet } from '@/services/payout-command/prod-api/fetchProdJsonGet'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'

type SyncConnector = {
  id?: string
  name?: string
  status?: string
  last_sync_at?: string
}

export function LiveSyncSurface() {
  const { tenantReady } = useSessionTenant()
  const [connectors, setConnectors] = useState<SyncConnector[]>([])
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (!tenantReady) {
      setConnectors([])
      setLive(false)
      return
    }
    void fetchProdJsonGet<{ data_available?: boolean; connectors?: SyncConnector[] }>(
      '/api/prod/systems/sync-status',
    ).then((body) => {
      const list = body?.connectors ?? []
      setConnectors(list)
      setLive(body?.data_available === true && list.length > 0)
    })
  }, [tenantReady])

  return (
    <div className="space-y-5">
      <div>
        <p className={COMMAND_CENTER_LABEL_GREEN}>Live sync</p>
        <h2 className={`mt-2 text-[1.35rem] font-semibold tracking-tight ${HOME_TITLE_BLACK}`}>
          Connector sync status
        </h2>
        <p className={`mt-2 max-w-2xl ${HOME_BODY_IMPERIAL_SM}`}>
          Probes GET /api/prod/systems/sync-status (proxies connectors service when available).
        </p>
        <div className="mt-3">
          <LiveDataHint isLive={live} source="connectors" />
        </div>
      </div>

      {connectors.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {connectors.map((c) => (
            <article key={c.id || c.name} className={COMMAND_CENTER_KPI_CARD}>
              <p className={`text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>{c.name || c.id}</p>
              <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>Status: {c.status || 'unknown'}</p>
              {c.last_sync_at ? (
                <p className={`mt-1 text-[12px] text-slate-500`}>Last sync: {c.last_sync_at}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <article className={COMMAND_CENTER_KPI_CARD}>
          <p className={`text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>No connector telemetry yet</p>
          <ul className={`mt-3 list-disc space-y-2 pl-5 ${HOME_BODY_IMPERIAL_SM}`}>
            <li>Ingest intents and settlement files from Batch Command Center.</li>
            <li>When upstream exposes GET /v1/connectors/sync-status, pills populate here automatically.</li>
          </ul>
          <Link
            href="/payout-command-view/batch-command-center"
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-[13px] font-semibold text-white transition hover:bg-slate-800"
          >
            Open Batch Command Center
          </Link>
        </article>
      )}
    </div>
  )
}
