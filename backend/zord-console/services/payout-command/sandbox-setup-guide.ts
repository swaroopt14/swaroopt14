import {
  PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH,
} from './batchCommandCenterHref'

/** Persisted when user dismisses the Intent Journal auto-open setup dialog. */
export const SANDBOX_JOURNAL_SETUP_DISMISSED_KEY = 'zord:sandbox-intent-journal-onboarding-dismissed'

export const SANDBOX_SETUP_PANEL_DISMISSED_KEY = 'zord:sandbox-setup-panel-dismissed'
export const SANDBOX_SETUP_PANEL_MINIMIZED_KEY = 'zord:sandbox-setup-panel-minimized'
export const SANDBOX_SETUP_PROGRESS_STORAGE_KEY = 'zord:sandbox-setup-progress'

export type SandboxSetupProgress = {
  credentials?: boolean
  'intent-ingest'?: boolean
  settlement?: boolean
  journal?: boolean
  'home-signals'?: boolean
}

export type SandboxSetupGuideSection = {
  id: string
  title: string
  defaultExpanded: boolean
  stepIds: readonly string[]
}

export type SandboxSetupGuideStep = {
  id: string
  title: string
  /** Short line shown in compact lists */
  summary: string
  /** What the console actually does today */
  detail: string
  /** Optional route or console path */
  href?: string
  /** API the step hits (console proxy → backend) */
  api?: string
}

export const SANDBOX_HOME_PATH = '/sandbox?dock=home'
export const SANDBOX_JOURNAL_PATH = '/sandbox?dock=grid'
export const SANDBOX_BATCH_CENTER_PATH = PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH

/**
 * End-to-end sandbox setup mapped to what is implemented in zord-console today.
 * Sandbox uses the same tenant-scoped prod proxies as live — no seeded demo rows.
 */
export const SANDBOX_SETUP_SECTIONS: SandboxSetupGuideSection[] = [
  {
    id: 'ingest',
    title: 'Ingest your first batch',
    defaultExpanded: true,
    stepIds: ['credentials', 'intent-ingest', 'settlement'],
  },
  {
    id: 'verify',
    title: 'Finish your setup',
    defaultExpanded: false,
    stepIds: ['journal', 'home-signals'],
  },
]

export const SANDBOX_SETUP_GUIDE = {
  panelTitle: 'Setup guide',
  title: 'Sandbox setup',
  subtitle:
    'Sandbox mirrors live: your signed-in tenant, real bulk ingest, settlement upload, and prod intelligence APIs. The journal starts empty until you ingest.',
  steps: [
    {
      id: 'sign-in',
      title: 'Sign in and open Sandbox',
      summary: 'Use your workspace session at /sandbox',
      detail:
        'Sign in so zord-edge can resolve tenant_id on your session. Home and the credentials card load from /api/sandbox/workspace-api-keys (no mock keys).',
      href: SANDBOX_HOME_PATH,
    },
    {
      id: 'credentials',
      title: 'Copy tenant id and API key',
      summary: 'Home → Workspace credentials sidebar',
      detail:
        'Tenant id comes from auth/me. The full API secret is only shown once at signup; this browser can restore it from localStorage if you copied it then. Optional for console uploads — session cookies are used by default.',
      href: SANDBOX_HOME_PATH,
      api: 'GET /api/sandbox/workspace-api-keys',
    },
    {
      id: 'intent-ingest',
      title: 'Upload intent batch (Step 1)',
      summary: 'Batch Command Center → Batch tab → Upload intent batch',
      detail:
        'CSV or XLS/XLSX from LMS/ERP. Choose tenant type; Batch-Id is optional. File posts to bulk ingest; the table below is a local preview of the parsed sheet.',
      href: SANDBOX_BATCH_CENTER_PATH,
      api: 'POST /api/bulk-ingest',
    },
    {
      id: 'settlement',
      title: 'Upload settlement file (Step 2)',
      summary: 'Unlocked after Step 1 — needs PSP + Batch-Id',
      detail:
        'Bank/PSP settlement file matched server-side to the intent batch. Tenant is taken from your session; set PSP (e.g. razorpay) before upload.',
      href: SANDBOX_BATCH_CENTER_PATH,
      api: 'POST /api/settlement/upload',
    },
    {
      id: 'journal',
      title: 'Verify in Intent Journal',
      summary: 'Batches and intents from backend feeds only',
      detail:
        'Sidebar batches: GET /api/prod/intents/batches first; if empty, falls back to GET /api/prod/intelligence/batches. Selecting a batch loads intents and optional DLQ for your tenant.',
      href: SANDBOX_JOURNAL_PATH,
      api: 'GET /api/prod/intents/batches · GET /api/prod/intelligence/batches',
    },
    {
      id: 'home-signals',
      title: 'Review command center signals (optional)',
      summary: 'Home KPIs and insights from intelligence',
      detail:
        'After ingest, Home surfaces patterns, leakage, recommendations, and ambiguity from /api/prod/intelligence/* for the same tenant.',
      href: SANDBOX_HOME_PATH,
      api: 'GET /api/prod/intelligence/*',
    },
  ] satisfies SandboxSetupGuideStep[],
  notes: [
    'No demo rows in sandbox — empty journal until ingest succeeds.',
    'Connectors in sandbox are UI-only test credentials; batch ingest does not require connecting a PSP in Connectors.',
    'Switch to live via Activate when KYC is complete; until then use /payout-command-view/today.',
  ],
} as const

export function sandboxSetupGuideStepHref(step: SandboxSetupGuideStep): string | undefined {
  return step.href
}

export function readSandboxSetupProgress(): SandboxSetupProgress {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(SANDBOX_SETUP_PROGRESS_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as SandboxSetupProgress
  } catch {
    return {}
  }
}

export function markSandboxSetupStep(stepId: keyof SandboxSetupProgress | string) {
  if (typeof window === 'undefined') return
  try {
    const prev = readSandboxSetupProgress()
    const next = { ...prev, [stepId]: true }
    window.localStorage.setItem(SANDBOX_SETUP_PROGRESS_STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('zord:sandbox-setup-progress'))
  } catch {
    /* ignore */
  }
}

export function openSandboxSetupPanel() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('zord:sandbox-setup-open'))
}
