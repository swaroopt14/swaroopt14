'use client'

import Link from 'next/link'
import { LiveDataHint } from '../shared'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'

/**
 * Live Sync — connector health graph is not backed by a GET status API yet.
 * Shows an explicit empty state; ingest/sync actions live in Batch Command Center.
 */
export function LiveSyncSurface() {
  return (
    <div className="space-y-5">
      <div>
        <p className={COMMAND_CENTER_LABEL_GREEN}>Live sync</p>
        <h2 className={`mt-2 text-[1.35rem] font-semibold tracking-tight ${HOME_TITLE_BLACK}`}>
          Connector status API pending
        </h2>
        <p className={`mt-2 max-w-2xl ${HOME_BODY_IMPERIAL_SM}`}>
          Real-time connector health and knowledge-graph telemetry are not exposed on the BFF yet. Use Batch Command
          Center to run external batch sync POST actions when your connectors are configured.
        </p>
        <div className="mt-3">
          <LiveDataHint isLive={false} source="intelligence" />
        </div>
      </div>

      <article className={COMMAND_CENTER_KPI_CARD}>
        <p className={`text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>What you can do now</p>
        <ul className={`mt-3 list-disc space-y-2 pl-5 ${HOME_BODY_IMPERIAL_SM}`}>
          <li>Ingest intents and settlement files from Batch Command Center.</li>
          <li>Review leakage, ambiguity, and evidence packs on their dedicated docks once data is in.</li>
          <li>When upstream adds GET /v1/connectors/sync-status, this surface will show live health instead of a placeholder.</li>
        </ul>
        <Link
          href="/payout-command-view/batch-command-center"
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-[13px] font-semibold text-white transition hover:bg-slate-800"
        >
          Open Batch Command Center
        </Link>
      </article>
    </div>
  )
}
