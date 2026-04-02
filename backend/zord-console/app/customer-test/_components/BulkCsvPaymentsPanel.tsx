'use client'

import { useMemo, useRef, useState } from 'react'

export type CsvLineItemDraft = {
  itemRef: string
  description: string
  qty: number
  unitPrice: number
  taxRate: number
}

export type CsvPaymentDraft = {
  paymentRef: string
  documentType: string
  currency: string
  documentDate: string
  dueDate: string
  walletAmount: string
  walletCurrency: string
  walletAccountType: string
  walletAccountToken: string
  recipientAmount: string
  recipientCurrency: string
  recipientAccountType: string
  recipientAccountToken: string
  lineItems: CsvLineItemDraft[]
  rowNumbers: number[]
  totalAmount: number
  errors: string[]
  warnings: string[]
}

type PreviewRow = {
  rowNumber: number
  paymentRef: string
  itemRef: string
  amount: number
  status: 'VALID' | 'WARNING' | 'ERROR'
  message: string
}

type BatchQueueItem = {
  queueId: string
  paymentRef: string
  status: 'QUEUED' | 'PENDING_REVIEW' | 'VALIDATION_FAILED'
  lineCount: number
  totalAmount: number
  reason: string
  createdAt: string
}

type ParseResult = {
  fileName: string
  rowsParsed: number
  headers: string[]
  payments: CsvPaymentDraft[]
  previewRows: PreviewRow[]
  fileErrors: string[]
}

type BulkCsvPaymentsPanelProps = {
  onApplyPayment?: (payment: CsvPaymentDraft) => void
  heading?: string
  description?: string
}

const requiredColumns = [
  'payment_ref',
  'document_type',
  'currency',
  'document_date',
  'due_date',
  'wallet_amount',
  'wallet_currency',
  'wallet_account_type',
  'wallet_account_token',
  'recipient_amount',
  'recipient_currency',
  'recipient_account_type',
  'recipient_account_token',
  'item_ref',
  'description',
  'qty',
  'unit_price',
  'tax_rate',
]

const headerAliases: Record<string, string> = {
  payment_reference: 'payment_ref',
  payment_id: 'payment_ref',
  paymentid: 'payment_ref',
  doc_type: 'document_type',
  doc_date: 'document_date',
  wallet_acct_type: 'wallet_account_type',
  wallet_acct_token: 'wallet_account_token',
  recipient_acct_type: 'recipient_account_type',
  recipient_acct_token: 'recipient_account_token',
  account_type_wallet: 'wallet_account_type',
  account_token_wallet: 'wallet_account_token',
  account_type_recipient: 'recipient_account_type',
  account_token_recipient: 'recipient_account_token',
  unitprice: 'unit_price',
  tax: 'tax_rate',
}

const csvTemplate = `payment_ref,document_type,currency,document_date,due_date,wallet_amount,wallet_currency,wallet_account_type,wallet_account_token,recipient_amount,recipient_currency,recipient_account_type,recipient_account_token,item_ref,description,qty,unit_price,tax_rate
PMT-2026-1001,Invoice,INR,2026-03-04,2026-03-08,124500,INR,Debit Expenses,acct_tok_wallet_4587,124500,INR,Debit Purchase,acct_tok_rcpt_9933,HGT-2635745,Electronics for home and garden,12,452,8
PMT-2026-1001,Invoice,INR,2026-03-04,2026-03-08,124500,INR,Debit Expenses,acct_tok_wallet_4587,124500,INR,Debit Purchase,acct_tok_rcpt_9933,FTT-4445114,Home appliances,4,1152,12
PMT-2026-1002,Vendor Payout,INR,2026-03-05,2026-03-09,18920,INR,Debit Expenses,acct_tok_wallet_4587,18920,INR,Debit Cash,acct_tok_rcpt_1188,ITM-7781,Support retainer,1,18920,0`

function canonicalizeHeader(header: string) {
  const normalized = header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return headerAliases[normalized] || normalized
}

function parseCsvContent(content: string) {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]
    const nextCharacter = content[index + 1]

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentField += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === ',' && !inQuotes) {
      currentRow.push(currentField)
      currentField = ''
      continue
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1
      }
      currentRow.push(currentField)
      const hasAnyValue = currentRow.some((value) => value.trim() !== '')
      if (hasAnyValue) rows.push(currentRow)
      currentRow = []
      currentField = ''
      continue
    }

    currentField += character
  }

  currentRow.push(currentField)
  if (currentRow.some((value) => value.trim() !== '')) {
    rows.push(currentRow)
  }

  return rows
}

function parseNumberish(value: string) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function formatINR(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDateTime(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  const hours = String(value.getHours()).padStart(2, '0')
  const minutes = String(value.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function parseDate(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export default function BulkCsvPaymentsPanel({
  onApplyPayment,
  heading = 'Bulk CSV Upload',
  description = 'Upload payouts in one file with template validation, row-level checks, and simulation queueing.',
}: BulkCsvPaymentsPanelProps) {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [selectedPaymentRef, setSelectedPaymentRef] = useState<string>('')
  const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>([])
  const [lastMessage, setLastMessage] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedPayment = useMemo(
    () => parseResult?.payments.find((payment) => payment.paymentRef === selectedPaymentRef) ?? null,
    [parseResult, selectedPaymentRef]
  )

  const selectedEnvelopePreview = useMemo(() => {
    if (!selectedPayment) return ''
    const totalLineAmount = selectedPayment.lineItems.reduce(
      (sum, line) => sum + line.qty * line.unitPrice * (1 + line.taxRate / 100),
      0
    )
    return JSON.stringify(
      {
        envelope_id: `env_sim_${selectedPayment.paymentRef.toLowerCase().replace(/[^\w]/g, '')}`,
        schema_version: 'payment.bulk.v1',
        payment_ref: selectedPayment.paymentRef,
        document_type: selectedPayment.documentType,
        document_date: selectedPayment.documentDate,
        due_date: selectedPayment.dueDate,
        wallet: {
          amount: Number(selectedPayment.walletAmount),
          currency: selectedPayment.walletCurrency,
          account_type: selectedPayment.walletAccountType,
          account_token: selectedPayment.walletAccountToken,
        },
        recipient: {
          amount: Number(selectedPayment.recipientAmount),
          currency: selectedPayment.recipientCurrency,
          account_type: selectedPayment.recipientAccountType,
          account_token: selectedPayment.recipientAccountToken,
        },
        line_items: selectedPayment.lineItems,
        totals: {
          line_total: Number(totalLineAmount.toFixed(2)),
          declared_total: Number(selectedPayment.totalAmount.toFixed(2)),
        },
        tags: ['sandbox', 'bulk_csv', 'tokenized'],
      },
      null,
      2
    )
  }, [selectedPayment])

  const summary = useMemo(() => {
    if (!parseResult) {
      return { validPayments: 0, invalidPayments: 0, warnings: 0, rows: 0 }
    }
    const invalidPayments = parseResult.payments.filter((payment) => payment.errors.length > 0).length
    const warnings = parseResult.payments.reduce((sum, payment) => sum + payment.warnings.length, 0)
    return {
      validPayments: parseResult.payments.length - invalidPayments,
      invalidPayments,
      warnings,
      rows: parseResult.rowsParsed,
    }
  }, [parseResult])

  const downloadTemplate = () => {
    const blob = new Blob([csvTemplate], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'zord_bulk_payment_template.csv'
    anchor.click()
    URL.revokeObjectURL(url)
    setLastMessage('Template downloaded.')
  }

  const clearUpload = () => {
    setParseResult(null)
    setSelectedPaymentRef('')
    setLastMessage('Bulk upload cleared.')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const applySelectedPayment = () => {
    if (!selectedPayment || !onApplyPayment) return
    if (selectedPayment.errors.length > 0) {
      setLastMessage('Resolve errors before applying this payment.')
      return
    }
    onApplyPayment(selectedPayment)
    setLastMessage(`Applied ${selectedPayment.paymentRef} to manual form.`)
  }

  const queueBulkSimulation = () => {
    if (!parseResult) return
    const now = new Date()
    const queueItems = parseResult.payments.map<BatchQueueItem>((payment, index) => {
      let status: BatchQueueItem['status'] = 'QUEUED'
      let reason = 'Validated'
      if (payment.errors.length > 0) {
        status = 'VALIDATION_FAILED'
        reason = payment.errors[0]
      } else if (payment.warnings.length > 0 || index % 3 === 2) {
        status = 'PENDING_REVIEW'
        reason = payment.warnings[0] || 'Manual review suggested'
      }
      return {
        queueId: `bulkq_${now.getTime()}_${index + 1}`,
        paymentRef: payment.paymentRef,
        status,
        lineCount: payment.lineItems.length,
        totalAmount: payment.totalAmount,
        reason,
        createdAt: formatDateTime(now),
      }
    })
    setBatchQueue((prev) => [...queueItems, ...prev].slice(0, 30))
    setLastMessage(`Queued ${queueItems.length} payment batches for simulation.`)
  }

  const handleFileUpload = async (file: File | null) => {
    if (!file) return
    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.csv')) {
      setLastMessage('Only .csv files are supported.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setLastMessage('File too large. Keep CSV ≤ 5MB.')
      return
    }

    const content = await file.text()
    const rows = parseCsvContent(content)
    if (rows.length < 2) {
      setParseResult({
        fileName: file.name,
        rowsParsed: 0,
        headers: [],
        payments: [],
        previewRows: [],
        fileErrors: ['CSV requires a header row and at least one data row.'],
      })
      setSelectedPaymentRef('')
      return
    }

    const headerRow = rows[0]
    const normalizedHeaders = headerRow.map(canonicalizeHeader)
    const columnIndex = new Map<string, number>()
    normalizedHeaders.forEach((header, index) => {
      if (!columnIndex.has(header)) columnIndex.set(header, index)
    })

    const missingColumns = requiredColumns.filter((column) => !columnIndex.has(column))
    if (missingColumns.length > 0) {
      setParseResult({
        fileName: file.name,
        rowsParsed: rows.length - 1,
        headers: normalizedHeaders,
        payments: [],
        previewRows: [],
        fileErrors: [`Missing required columns: ${missingColumns.join(', ')}`],
      })
      setSelectedPaymentRef('')
      return
    }

    type PaymentAccumulator = Omit<CsvPaymentDraft, 'errors' | 'warnings'> & {
      errorSet: Set<string>
      warningSet: Set<string>
    }

    const payments = new Map<string, PaymentAccumulator>()
    const previewRows: PreviewRow[] = []

    const getCell = (row: string[], columnName: string) => {
      const index = columnIndex.get(columnName)
      if (index === undefined) return ''
      return (row[index] ?? '').trim()
    }

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]
      const rowNumber = rowIndex + 1
      const rowErrors: string[] = []
      const rowWarnings: string[] = []

      const paymentRef = getCell(row, 'payment_ref') || `PMT-AUTO-${rowNumber}`
      const documentType = getCell(row, 'document_type') || 'Invoice'
      const currency = getCell(row, 'currency') || 'INR'
      const documentDate = getCell(row, 'document_date')
      const dueDate = getCell(row, 'due_date')
      const walletAmount = getCell(row, 'wallet_amount')
      const walletCurrency = getCell(row, 'wallet_currency') || currency
      const walletAccountType = getCell(row, 'wallet_account_type') || 'Debit Expenses'
      const walletAccountToken = getCell(row, 'wallet_account_token')
      const recipientAmount = getCell(row, 'recipient_amount')
      const recipientCurrency = getCell(row, 'recipient_currency') || currency
      const recipientAccountType = getCell(row, 'recipient_account_type') || 'Debit Purchase'
      const recipientAccountToken = getCell(row, 'recipient_account_token')
      const itemRef = getCell(row, 'item_ref') || `ITM-${rowNumber}`
      const descriptionValue = getCell(row, 'description') || 'Line item'
      const qtyValue = getCell(row, 'qty')
      const unitPriceValue = getCell(row, 'unit_price')
      const taxRateValue = getCell(row, 'tax_rate')

      const qty = parseNumberish(qtyValue)
      const unitPrice = parseNumberish(unitPriceValue)
      const taxRate = parseNumberish(taxRateValue)
      const rowAmount = (qty ?? 0) * (unitPrice ?? 0) * (1 + (taxRate ?? 0) / 100)

      if (!walletAccountToken.startsWith('acct_tok_')) {
        rowWarnings.push('wallet_account_token should start with acct_tok_')
      }
      if (!recipientAccountToken.startsWith('acct_tok_')) {
        rowWarnings.push('recipient_account_token should start with acct_tok_')
      }
      if (qty === null || qty <= 0) rowErrors.push('qty must be > 0')
      if (unitPrice === null || unitPrice < 0) rowErrors.push('unit_price must be ≥ 0')
      if (taxRate === null || taxRate < 0 || taxRate > 100) rowErrors.push('tax_rate must be between 0 and 100')

      const documentDateParsed = parseDate(documentDate)
      const dueDateParsed = parseDate(dueDate)
      if (!documentDateParsed) rowErrors.push('document_date is invalid')
      if (!dueDateParsed) rowErrors.push('due_date is invalid')
      if (documentDateParsed && dueDateParsed && dueDateParsed < documentDateParsed) {
        rowErrors.push('due_date cannot be earlier than document_date')
      }

      if (parseNumberish(walletAmount) === null) rowErrors.push('wallet_amount must be numeric')
      if (parseNumberish(recipientAmount) === null) rowErrors.push('recipient_amount must be numeric')

      const validationStatus: PreviewRow['status'] =
        rowErrors.length > 0 ? 'ERROR' : rowWarnings.length > 0 ? 'WARNING' : 'VALID'

      previewRows.push({
        rowNumber,
        paymentRef,
        itemRef,
        amount: rowAmount,
        status: validationStatus,
        message:
          rowErrors[0] || rowWarnings[0] || 'Validated',
      })

      const existingPayment = payments.get(paymentRef)
      if (!existingPayment) {
        payments.set(paymentRef, {
          paymentRef,
          documentType,
          currency,
          documentDate,
          dueDate,
          walletAmount,
          walletCurrency,
          walletAccountType,
          walletAccountToken,
          recipientAmount,
          recipientCurrency,
          recipientAccountType,
          recipientAccountToken,
          lineItems: [
            {
              itemRef,
              description: descriptionValue,
              qty: qty ?? 0,
              unitPrice: unitPrice ?? 0,
              taxRate: taxRate ?? 0,
            },
          ],
          rowNumbers: [rowNumber],
          totalAmount: rowAmount,
          errorSet: new Set(rowErrors),
          warningSet: new Set(rowWarnings),
        })
      } else {
        existingPayment.rowNumbers.push(rowNumber)
        existingPayment.lineItems.push({
          itemRef,
          description: descriptionValue,
          qty: qty ?? 0,
          unitPrice: unitPrice ?? 0,
          taxRate: taxRate ?? 0,
        })
        existingPayment.totalAmount += rowAmount
        rowErrors.forEach((error) => existingPayment.errorSet.add(error))
        rowWarnings.forEach((warning) => existingPayment.warningSet.add(warning))

        const invariantFields: Array<[keyof PaymentAccumulator, string]> = [
          ['documentType', 'document_type'],
          ['currency', 'currency'],
          ['documentDate', 'document_date'],
          ['dueDate', 'due_date'],
          ['walletAccountToken', 'wallet_account_token'],
          ['recipientAccountToken', 'recipient_account_token'],
        ]
        invariantFields.forEach(([field, label]) => {
          if (existingPayment[field] !== ({ documentType, currency, documentDate, dueDate, walletAccountToken, recipientAccountToken } as Record<string, string>)[field]) {
            existingPayment.warningSet.add(`${label} differs across rows for ${paymentRef}`)
          }
        })
      }
    }

    const parsedPayments: CsvPaymentDraft[] = Array.from(payments.values()).map((payment) => ({
      paymentRef: payment.paymentRef,
      documentType: payment.documentType,
      currency: payment.currency,
      documentDate: payment.documentDate,
      dueDate: payment.dueDate,
      walletAmount: payment.walletAmount,
      walletCurrency: payment.walletCurrency,
      walletAccountType: payment.walletAccountType,
      walletAccountToken: payment.walletAccountToken,
      recipientAmount: payment.recipientAmount,
      recipientCurrency: payment.recipientCurrency,
      recipientAccountType: payment.recipientAccountType,
      recipientAccountToken: payment.recipientAccountToken,
      lineItems: payment.lineItems,
      rowNumbers: payment.rowNumbers,
      totalAmount: payment.totalAmount,
      errors: Array.from(payment.errorSet),
      warnings: Array.from(payment.warningSet),
    }))

    setParseResult({
      fileName: file.name,
      rowsParsed: rows.length - 1,
      headers: normalizedHeaders,
      payments: parsedPayments,
      previewRows,
      fileErrors: [],
    })
    setSelectedPaymentRef(parsedPayments[0]?.paymentRef ?? '')
    setLastMessage(`Parsed ${rows.length - 1} rows from ${file.name}.`)
  }

  return (
    <section className="ct-frost-card rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{heading}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
          <p className="mt-2 text-xs text-slate-500">
            Template-driven flow: upload → validate → preview → queue simulation (inspired by RazorpayX/Revolut/Airwallex bulk flows).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={downloadTemplate}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Download Template
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Upload CSV
          </button>
          <button
            onClick={clearUpload}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => handleFileUpload(event.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      {lastMessage ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-600">{lastMessage}</p>
      ) : null}

      {parseResult ? (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white/90 p-3">
              <p className="text-xs text-slate-500">Rows Parsed</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{summary.rows}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
              <p className="text-xs text-emerald-700">Valid Payments</p>
              <p className="mt-1 text-lg font-semibold text-emerald-800">{summary.validPayments}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3">
              <p className="text-xs text-rose-700">Invalid Payments</p>
              <p className="mt-1 text-lg font-semibold text-rose-800">{summary.invalidPayments}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
              <p className="text-xs text-amber-700">Warnings</p>
              <p className="mt-1 text-lg font-semibold text-amber-800">{summary.warnings}</p>
            </div>
          </div>

          {parseResult.fileErrors.length > 0 ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {parseResult.fileErrors.join(' · ')}
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-white/90">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Row Validation Preview ({parseResult.fileName})
              </p>
              <p className="text-xs text-slate-500">Showing first 10 rows</p>
            </div>
            <div className="ct-sidebar-scroll overflow-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Row</th>
                    <th className="px-3 py-2 text-left">Payment Ref</th>
                    <th className="px-3 py-2 text-left">Item Ref</th>
                    <th className="px-3 py-2 text-left">Amount</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.previewRows.slice(0, 10).map((row) => (
                    <tr key={`${row.paymentRef}_${row.rowNumber}`} className="border-t border-slate-100 text-slate-700">
                      <td className="px-3 py-2">{row.rowNumber}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.paymentRef}</td>
                      <td className="px-3 py-2">{row.itemRef}</td>
                      <td className="px-3 py-2">{formatINR(row.amount)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            row.status === 'VALID'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : row.status === 'WARNING'
                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                : 'border-rose-200 bg-rose-50 text-rose-700'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto]">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-600">Parsed Payments</span>
              <select
                value={selectedPaymentRef}
                onChange={(event) => setSelectedPaymentRef(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none"
              >
                {parseResult.payments.map((payment) => (
                  <option key={payment.paymentRef} value={payment.paymentRef}>
                    {payment.paymentRef} · {payment.lineItems.length} lines · {formatINR(payment.totalAmount)}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={applySelectedPayment}
              disabled={!onApplyPayment || !selectedPayment}
              className="h-11 self-end rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply To Form
            </button>
            <button
              onClick={queueBulkSimulation}
              disabled={parseResult.payments.length === 0}
              className="h-11 self-end rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Queue Simulation
            </button>
          </div>

          {selectedPayment ? (
            <div className="rounded-xl border border-slate-200 bg-white/90 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {selectedPayment.paymentRef} · {selectedPayment.lineItems.length} line items · {formatINR(selectedPayment.totalAmount)}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-700">
                    wallet: {selectedPayment.walletAccountToken}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-700">
                    recipient: {selectedPayment.recipientAccountToken}
                  </span>
                </div>
              </div>
              {selectedPayment.errors.length > 0 ? (
                <p className="mt-2 text-xs text-rose-700">Errors: {selectedPayment.errors.join(' · ')}</p>
              ) : null}
              {selectedPayment.warnings.length > 0 ? (
                <p className="mt-1 text-xs text-amber-700">Warnings: {selectedPayment.warnings.join(' · ')}</p>
              ) : null}
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-900 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  Mock translation → envelope payload
                </p>
                <pre className="ct-sidebar-scroll max-h-[200px] overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-100">
                  {selectedEnvelopePreview}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {batchQueue.length > 0 ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white/90">
          <div className="border-b border-slate-200 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Bulk Simulation Queue</p>
          </div>
          <div className="ct-sidebar-scroll max-h-[220px] overflow-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Queue ID</th>
                  <th className="px-3 py-2 text-left">Payment Ref</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Lines</th>
                  <th className="px-3 py-2 text-left">Total</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Created At</th>
                </tr>
              </thead>
              <tbody>
                {batchQueue.map((row) => (
                  <tr key={row.queueId} className="border-t border-slate-100 text-slate-700">
                    <td className="px-3 py-2 font-mono text-xs">{row.queueId}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.paymentRef}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          row.status === 'QUEUED'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : row.status === 'PENDING_REVIEW'
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-rose-200 bg-rose-50 text-rose-700'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{row.lineCount}</td>
                    <td className="px-3 py-2">{formatINR(row.totalAmount)}</td>
                    <td className="px-3 py-2 text-xs">{row.reason}</td>
                    <td className="px-3 py-2 text-xs">{row.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  )
}
