import type { AlertStripProps, OpsInsightAlert } from '../command-center/types'

/** Primary RED strip on Command center (home) — matches Service 5C copy. */
export const homeCommandCenterAlertStrip: AlertStripProps = {
  status: 'RED',
  message: '₹12.4L ambiguity exposure detected in IMPS corridor (+2.1× baseline) — review attachment queue (5C).',
  timestamp: '2026-05-02T14:22:33.000Z',
}

/** Inbox list opened from the bell on Command center. */
export const homeCommandCenterInboxAlerts: OpsInsightAlert[] = [
  {
    id: 'home-in-1',
    title: 'Ambiguity (5C)',
    body: '₹12.4L ambiguity exposure detected in IMPS corridor (+2.1× baseline) — review attachment queue (5C).',
    createdAt: '2026-05-02T14:22:33.000Z',
    tone: 'critical',
  },
  {
    id: 'home-in-2',
    title: 'Bank confirmation drift',
    body: 'SBI + two partner lanes slower than baseline; disbursement window still open — watch ACK timestamps.',
    createdAt: '2026-05-02T14:05:12.000Z',
    tone: 'warning',
  },
  {
    id: 'home-in-3',
    title: 'Settlement partial page',
    body: 'Payment partner returned a truncated settlement page; retry #2 succeeded — 180 events ingested.',
    createdAt: '2026-05-02T13:48:00.000Z',
    tone: 'caution',
  },
  {
    id: 'home-in-4',
    title: 'Mandate batch accepted',
    body: 'Afternoon NACH presentation ACK file ingested — 94 mandates; no bounce file.',
    createdAt: '2026-05-02T12:10:45.000Z',
    tone: 'ok',
  },
]
