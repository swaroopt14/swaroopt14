'use client'

import Link from 'next/link'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { markSandboxSetupStep } from '@/services/payout-command/sandbox-setup-guide'
import {
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../today/_components/command-center/homeCommandCenterTokens'
import { parseUploadedSheet, type BatchRow, type ZordPipelineIntake } from '@/services/payout-command/batch-model'
import { postIntentBulkIngest } from '@/services/payout-command/batch-intake/postIntentBulkIngest'
import { parseBulkIngestAcceptedResponse, type ParsedBulkIngestAccepted } from '@/services/payout-command/batch-intake/intakeHttpShared'
import { postSettlementFileUpload } from '@/services/payout-command/batch-intake/postSettlementFileUpload'
import { CreatePaymentRequestForm } from '../../../customer/intents/create/page'

function bulkIngestSourceTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'FILE_UPLOAD'
  return 'CSV'
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className={COMMAND_CENTER_LABEL_GREEN}>{children}</div>
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[#E5E5E5] bg-white shadow-[0_2px_12px_rgba(15,23,42,0.04)] ${className}`}>
      {children}
    </div>
  )
}

export type BatchIntakeSnapshot = ZordPipelineIntake & {
  settlementBatchId: string | null
}

export type IntentIngestSuccessPayload = {
  batchId: string
  effectiveBatch: string | null
  parsedRows: BatchRow[]
  fileName: string
}

type BatchIntakePanelProps = {
  batchIdInput: string
  onBatchIdChange: (value: string) => void
  isSandboxRoute: boolean
  onIntentIngestSuccess: (payload: IntentIngestSuccessPayload) => void
  onSettlementIngestSuccess: () => void
  onSnapshotChange: (snapshot: BatchIntakeSnapshot) => void
}

export function BatchIntakePanel({
  batchIdInput,
  onBatchIdChange,
  isSandboxRoute,
  onIntentIngestSuccess,
  onSettlementIngestSuccess,
  onSnapshotChange,
}: BatchIntakePanelProps) {
  const { tenantId, tenantReady, refreshTenant } = useSessionTenant()
  const tenantType = 'BANK' as const
  const [apiKey, setApiKey] = useState('')
  const [psp, setPsp] = useState(() => process.env.NEXT_PUBLIC_ZORD_SETTLEMENT_PSP ?? 'razorpay')
  const [bulkForceReprocess, setBulkForceReprocess] = useState(false)
  const [intakeTab, setIntakeTab] = useState<'batch' | 'single'>('batch')

  const [selectedIntentFile, setSelectedIntentFile] = useState<File | null>(null)
  const [selectedSettlementFile, setSelectedSettlementFile] = useState<File | null>(null)
  const [intentFileName, setIntentFileName] = useState<string | null>(null)
  const [settlementFileName, setSettlementFileName] = useState<string | null>(null)
  const [settlementIngestOk, setSettlementIngestOk] = useState(false)
  const [intakeStep, setIntakeStep] = useState<'idle' | 'intent_uploading' | 'intent_ready' | 'settlement_uploading' | 'closed'>('idle')
  const [intentIngestOk, setIntentIngestOk] = useState(false)
  const [intentBulkIngestAck, setIntentBulkIngestAck] = useState<{
    httpStatus: number
    parsed: ParsedBulkIngestAccepted | null
    rawFallback: string
    at: Date
  } | null>(null)
  const [settlementBatchId, setSettlementBatchId] = useState<string | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'ready'>('idle')
  const [uploadRelayState, setUploadRelayState] = useState<'idle' | 'syncing' | 'synced' | 'failed'>('idle')
  const [uploadRelayMessage, setUploadRelayMessage] = useState<string | null>(null)
  const [filePreviewRows, setFilePreviewRows] = useState<BatchRow[] | null>(null)
  const [filePreviewOpen, setFilePreviewOpen] = useState(false)

  const intentFileInputRef = useRef<HTMLInputElement>(null)
  const settlementFileInputRef = useRef<HTMLInputElement>(null)

  const settlementBatchIdResolved = useMemo(
    () => (settlementBatchId ?? batchIdInput.trim()).trim(),
    [batchIdInput, settlementBatchId],
  )

  const settlementCredentialsReady = useMemo(
    () => tenantReady && psp.trim().length > 0 && settlementBatchIdResolved.length > 0,
    [psp, settlementBatchIdResolved, tenantReady],
  )
  const settlementBusy = intakeStep === 'settlement_uploading'
  const settlementFilePickerEnabled = settlementCredentialsReady && !settlementBusy
  const settlementUploadEnabled =
    settlementFilePickerEnabled && Boolean(selectedSettlementFile) && !settlementBusy

  useEffect(() => {
    onSnapshotChange({
      intakeStep,
      intentFileName,
      intentIngestOk,
      settlementFileName,
      settlementIngestOk,
      uploadedFileName,
      uploadState,
      settlementBatchId,
    })
  }, [
    intakeStep,
    intentFileName,
    intentIngestOk,
    settlementFileName,
    settlementIngestOk,
    uploadedFileName,
    uploadState,
    settlementBatchId,
    onSnapshotChange,
  ])

  const onIntentFileChosen = useCallback((file: File | null) => {
    if (!file) return
    setSelectedIntentFile(file)
    setIntentIngestOk(false)
    setIntentBulkIngestAck(null)
    setSettlementBatchId(null)
    setSelectedSettlementFile(null)
    setSettlementFileName(null)
    setSettlementIngestOk(false)
    setIntakeStep('idle')
    setUploadRelayState('idle')
    setUploadRelayMessage(null)
    setFilePreviewRows(null)
  }, [])

  const onIntentBatchUpload = useCallback(async () => {
    const file = selectedIntentFile
    if (!file) return
    setIntentFileName(file.name)
    setIntentIngestOk(false)
    setIntentBulkIngestAck(null)
    setSettlementBatchId(null)
    setSettlementFileName(null)
    setIntakeStep('intent_uploading')
    setUploadRelayState('syncing')
    setUploadRelayMessage('Uploading intent batch to bulk ingest…')
    setUploadState('uploading')
    try {
      const parsed = await parseUploadedSheet(file)
      const bid = batchIdInput.trim()
      if (bulkForceReprocess && !bid) {
        throw new Error('Force reprocess requires a Batch-Id in the field above.')
      }
      const result = await postIntentBulkIngest({
        file,
        apiKeyRaw: apiKey.trim() || undefined,
        sourceType: bulkIngestSourceTypeFromFilename(file.name),
        tenantType,
        optionalBatchId: bid || undefined,
        forceReprocess: bulkForceReprocess,
      })
      if (!result.ok) {
        throw new Error(result.errorMessage ?? `HTTP ${result.httpStatus}`)
      }
      const ingestAckParsed = parseBulkIngestAcceptedResponse(result.responseText)
      setIntentBulkIngestAck({
        httpStatus: result.httpStatus,
        parsed: ingestAckParsed,
        rawFallback: ingestAckParsed ? '' : result.responseText.trim().slice(0, 16_000),
        at: new Date(),
      })
      const effectiveBatch = result.batchIdFromBody || bid || null
      const journalBatchId = effectiveBatch ?? `LOCAL-${Date.now()}`
      setSettlementBatchId(journalBatchId)
      if (effectiveBatch) onBatchIdChange(effectiveBatch)
      else if (!batchIdInput.trim()) onBatchIdChange(journalBatchId)
      setIntentIngestOk(true)
      void refreshTenant()
      markSandboxSetupStep('intent-ingest')
      setUploadRelayState('synced')
      setUploadRelayMessage(
        effectiveBatch
          ? `Intent batch accepted. Batch-Id for settlement: ${effectiveBatch}.`
          : `Intent batch accepted. Settlement step uses id ${journalBatchId}.`,
      )
      setFilePreviewRows(parsed)
      setFilePreviewOpen(true)
      setUploadState('ready')
      setUploadedFileName(file.name)
      setIntakeStep('intent_ready')
      onIntentIngestSuccess({
        batchId: journalBatchId,
        effectiveBatch,
        parsedRows: parsed,
        fileName: file.name,
      })
    } catch (error) {
      setIntentIngestOk(false)
      setIntentBulkIngestAck(null)
      setSettlementBatchId(null)
      setUploadRelayState('failed')
      setUploadRelayMessage(
        `Intent ingest failed (${error instanceof Error ? error.message : 'unknown error'}). Step 2 stays locked until ingest succeeds.`,
      )
      setIntakeStep('idle')
      setUploadState('idle')
    }
  }, [
    apiKey,
    batchIdInput,
    bulkForceReprocess,
    onBatchIdChange,
    onIntentIngestSuccess,
    refreshTenant,
    selectedIntentFile,
    tenantType,
  ])

  const onSettlementFileChosen = useCallback(
    (file: File | null) => {
      if (!file) return
      setSelectedSettlementFile(file)
      setSettlementIngestOk(false)
      setUploadRelayState('idle')
      setUploadRelayMessage(null)
      if (intakeStep === 'closed') setIntakeStep('intent_ready')
    },
    [intakeStep],
  )

  const onSettlementBatchUpload = useCallback(async () => {
    const file = selectedSettlementFile
    if (!file) return
    const pspVal = psp.trim()
    const bid = (settlementBatchId ?? batchIdInput.trim()).trim()
    if (!tenantReady || !pspVal || !bid) {
      setUploadRelayState('failed')
      setUploadRelayMessage(
        'Settlement batch upload needs an active session, PSP, and Batch-Id (complete Step 1 or enter Batch-Id above).',
      )
      return
    }
    setSettlementFileName(file.name)
    setIntakeStep('settlement_uploading')
    setUploadRelayState('syncing')
    setUploadRelayMessage('Uploading settlement batch…')
    try {
      const result = await postSettlementFileUpload({
        file,
        apiKeyRaw: apiKey.trim() || undefined,
        psp: pspVal,
        batchId: bid,
      })
      if (!result.ok) {
        throw new Error(result.errorMessage ?? `HTTP ${result.httpStatus}`)
      }
      setSettlementIngestOk(true)
      setUploadRelayState('synced')
      setUploadRelayMessage(
        `Settlement batch accepted for ${bid}. Canonical observations appear in Settlement Journal after processing.`,
      )
      markSandboxSetupStep('settlement')
      setIntakeStep('closed')
      onSettlementIngestSuccess()
    } catch (error) {
      setUploadRelayState('failed')
      setUploadRelayMessage(
        `Settlement batch upload failed (${error instanceof Error ? error.message : 'unknown error'}).`,
      )
      setIntakeStep('intent_ready')
    } finally {
      const el = settlementFileInputRef.current
      if (el) el.value = ''
    }
  }, [apiKey, batchIdInput, onSettlementIngestSuccess, psp, selectedSettlementFile, settlementBatchId, tenantReady])

  return (
    <>
      <div className="inline-flex items-center gap-1 rounded-[10px] border border-[#E5E5E5] bg-white p-1">
        {(
          [
            { id: 'batch' as const, label: 'Batch upload' },
            { id: 'single' as const, label: 'Create payment request' },
          ] as const
        ).map((tab) => {
          const active = intakeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setIntakeTab(tab.id)}
              className={`rounded-[8px] px-3.5 py-1.5 text-[13px] font-semibold transition ${
                active
                  ? 'bg-[#000000] text-white shadow-[0_2px_6px_rgba(15,23,42,0.18)]'
                  : 'text-[#00239C] hover:bg-[#f5f5f5] hover:text-[#000000]'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {intakeTab === 'single' ? (
        <div className="-mx-6 -mb-6 mt-2 sm:-mx-8">
          <CreatePaymentRequestForm />
        </div>
      ) : null}

      {intakeTab === 'batch' ? (
        <>
          {uploadRelayMessage ? (
            <div
              role="status"
              className={`rounded-xl border px-4 py-2.5 text-[13px] font-medium ${
                uploadRelayState === 'failed'
                  ? 'border-red-200 bg-red-50 text-red-900'
                  : uploadRelayState === 'synced'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-slate-50 text-slate-800'
              }`}
            >
              {uploadRelayMessage}
            </div>
          ) : null}

          <Card className="p-5">
            <div className="flex items-baseline justify-between gap-2">
              <SectionLabel>Batch intake</SectionLabel>
              <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#888888]">Step 1 → Step 2</span>
            </div>
            <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
              Upload the intent batch first (Step 1). When the PSP / bank file arrives, upload the settlement batch (Step 2).
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">Tenant type</span>
                <div className="flex h-9 items-center rounded-lg border border-[#E5E5E5] bg-[#f8fafc] px-2.5 text-[13px] font-medium text-[#0A0A0A]">
                  Bank
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">Batch-Id (optional)</span>
                <input
                  value={batchIdInput}
                  onChange={(e) => onBatchIdChange(e.target.value)}
                  placeholder="Auto-assigned if empty"
                  className="h-9 rounded-lg border border-[#E5E5E5] bg-white px-2.5 text-[13px] text-[#0A0A0A] outline-none focus:border-[#6366f1]/50"
                />
              </label>
              <label className="flex flex-col justify-end gap-1 sm:col-span-2 lg:col-span-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">Reprocess</span>
                <span className="flex min-h-9 items-center gap-2 rounded-lg border border-[#E5E5E5] bg-white px-2.5 text-[13px] text-[#0A0A0A]">
                  <input
                    type="checkbox"
                    checked={bulkForceReprocess}
                    onChange={(e) => setBulkForceReprocess(e.target.checked)}
                    className="h-4 w-4 rounded border-[#cbd5e1]"
                  />
                  Force reprocess
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">PSP</span>
                <input
                  value={psp}
                  onChange={(e) => setPsp(e.target.value)}
                  placeholder="razorpay"
                  className="h-9 rounded-lg border border-[#E5E5E5] bg-white px-2.5 text-[13px] text-[#0A0A0A] outline-none focus:border-[#6366f1]/50"
                />
              </label>
            </div>
            {settlementBatchIdResolved ? (
              <p className="mt-2 text-[12px] text-[#1A1A1A]">
                <span className="font-semibold text-[#334155]">Active Batch-Id: </span>
                <span className="font-mono text-[#0A0A0A]">{settlementBatchIdResolved}</span>
              </p>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div
                className={`relative flex flex-col rounded-[14px] border bg-white p-4 transition ${
                  intentIngestOk && intentFileName
                    ? 'border-emerald-200 bg-emerald-50/30'
                    : selectedIntentFile
                      ? 'border-[#6366f1]/30 bg-indigo-50/20'
                      : 'border-[#E5E5E5]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0A0A0A] text-[12px] font-bold text-white">1</span>
                  <span className="text-[14px] font-semibold text-[#0A0A0A]">Upload intent batch</span>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[#888888]">
                  CSV or spreadsheet (XLS / XLSX) from LMS / ERP — one row per payout intent.
                </p>
                {selectedIntentFile ? (
                  <div className="mt-2 rounded-lg border border-[#E5E5E5] bg-[#fafafa] px-3 py-2">
                    <p className="truncate font-mono text-[12px] text-[#0A0A0A]" title={selectedIntentFile.name}>
                      {selectedIntentFile.name}
                    </p>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={intakeStep === 'intent_uploading'}
                    onClick={() => intentFileInputRef.current?.click()}
                    className="inline-flex h-8 items-center rounded-[8px] border border-[#E5E5E5] bg-white px-3 text-[12px] font-medium text-[#0A0A0A] transition hover:bg-slate-100 disabled:opacity-60"
                  >
                    {selectedIntentFile ? 'Replace file' : 'Choose file'}
                  </button>
                  <button
                    type="button"
                    disabled={!selectedIntentFile || intakeStep === 'intent_uploading'}
                    onClick={() => void onIntentBatchUpload()}
                    className="inline-flex h-8 items-center rounded-[8px] bg-[#0A0A0A] px-3 text-[12px] font-medium text-white transition hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:bg-[#94a3b8]"
                  >
                    {intakeStep === 'intent_uploading' ? 'Uploading…' : 'Upload'}
                  </button>
                </div>
                <input
                  ref={intentFileInputRef}
                  type="file"
                  accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  aria-label="Intent batch file"
                  onChange={(e) => {
                    onIntentFileChosen(e.target.files?.[0] ?? null)
                    e.target.value = ''
                  }}
                />
              </div>

              <div
                className={`relative flex flex-col rounded-[14px] border bg-white p-4 transition ${
                  !settlementCredentialsReady
                    ? 'border-dashed border-[#E5E5E5] opacity-60'
                    : settlementIngestOk && settlementFileName
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : selectedSettlementFile
                        ? 'border-[#6366f1]/30 bg-indigo-50/20'
                        : 'border-[#E5E5E5]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold text-white ${
                      settlementCredentialsReady ? 'bg-[#0A0A0A]' : 'bg-[#94a3b8]'
                    }`}
                  >
                    2
                  </span>
                  <span className="text-[14px] font-semibold text-[#0A0A0A]">Upload settlement batch</span>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[#888888]">
                  Bank / PSP settlement file — matched to Batch-Id{' '}
                  {settlementBatchIdResolved ? (
                    <span className="font-mono text-[#334155]">{settlementBatchIdResolved}</span>
                  ) : (
                    'from Step 1'
                  )}
                  .
                </p>
                {settlementIngestOk && settlementBatchIdResolved && !settlementBatchIdResolved.startsWith('LOCAL-') && isSandboxRoute ? (
                  <Link
                    href={`/sandbox?dock=settlement&client_batch_id=${encodeURIComponent(settlementBatchIdResolved)}`}
                    className="mt-2 inline-flex w-fit text-[12px] font-semibold text-indigo-800 underline"
                  >
                    Open in Settlement Journal
                  </Link>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!settlementFilePickerEnabled}
                    onClick={() => settlementFileInputRef.current?.click()}
                    className="inline-flex h-8 items-center rounded-[8px] border border-[#E5E5E5] bg-white px-3 text-[12px] font-medium text-[#0A0A0A] transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {selectedSettlementFile ? 'Replace file' : 'Choose file'}
                  </button>
                  <button
                    type="button"
                    disabled={!settlementUploadEnabled}
                    onClick={() => void onSettlementBatchUpload()}
                    className="inline-flex h-8 items-center rounded-[8px] bg-[#0A0A0A] px-3 text-[12px] font-medium text-white transition hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:bg-[#94a3b8]"
                  >
                    {intakeStep === 'settlement_uploading' ? 'Uploading…' : 'Upload'}
                  </button>
                </div>
                <input
                  ref={settlementFileInputRef}
                  type="file"
                  accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  aria-label="Settlement batch file"
                  onChange={(e) => {
                    onSettlementFileChosen(e.target.files?.[0] ?? null)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>
          </Card>

          {filePreviewRows && filePreviewRows.length > 0 ? (
            <Card className="p-4">
              <button
                type="button"
                onClick={() => setFilePreviewOpen((o) => !o)}
                className={`text-[13px] font-semibold ${HOME_TITLE_BLACK}`}
              >
                {filePreviewOpen ? 'Hide' : 'Show'} file preview ({filePreviewRows.length} rows from last upload)
              </button>
              {filePreviewOpen ? (
                <p className={`mt-2 ${HOME_BODY_IMPERIAL_SM}`}>
                  Preview only — live counts refresh from intent-engine after processing.
                </p>
              ) : null}
            </Card>
          ) : null}

          {intentBulkIngestAck ? (
            <Card className="border-emerald-100/80 bg-gradient-to-b from-emerald-50/40 to-white p-5">
              <SectionLabel>Bulk ingest response</SectionLabel>
              <p className="mt-2 text-[13px]">
                HTTP {intentBulkIngestAck.httpStatus}
                {intentBulkIngestAck.parsed ? ` · ${intentBulkIngestAck.parsed.total} rows` : ''}
              </p>
              {settlementBatchId && !settlementBatchId.startsWith('LOCAL-') ? (
                <div className="mt-3 flex flex-wrap gap-3 text-[13px]">
                  <Link
                    href={
                      isSandboxRoute
                        ? `/sandbox?dock=grid&batch_id=${encodeURIComponent(settlementBatchId)}`
                        : `/payout-command-view/today?dock=grid&batch_id=${encodeURIComponent(settlementBatchId)}`
                    }
                    className="font-semibold text-emerald-800 underline"
                  >
                    Open in Intent Journal
                  </Link>
                  {isSandboxRoute ? (
                    <Link
                      href={`/sandbox?dock=settlement&client_batch_id=${encodeURIComponent(settlementBatchId)}`}
                      className="font-semibold text-indigo-800 underline"
                    >
                      Open in Settlement Journal
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}
    </>
  )
}
