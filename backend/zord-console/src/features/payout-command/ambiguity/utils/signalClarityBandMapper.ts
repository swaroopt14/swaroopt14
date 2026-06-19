import type {
  AmbiguityKpiResolved,
  MinorAmountField,
  SignalClarityBand,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import {
  SIGNAL_CLARITY_BAND_ORDER,
  SIGNAL_CLARITY_COPY,
  normalizeSignalClarityBandKey,
  signalClarityBandSpec,
  signalClarityHelperLabel,
  type SignalClarityBandKey,
} from '../copy/signalClarityCopy'
import { displayApiField, formatKpiMoneyMinor } from '../../shared/formatApiKpiFields'

function readAmbField(amb: AmbiguityKpiResolved | null, field: string): MinorAmountField | number | undefined {
  if (!amb) return undefined
  const value = amb[field as keyof AmbiguityKpiResolved]
  if (value == null || String(value).trim() === '') return undefined
  return value as MinorAmountField
}

function readAmbCount(amb: AmbiguityKpiResolved | null, field: string | undefined): number | undefined {
  if (!amb || !field) return undefined
  const value = amb[field as keyof AmbiguityKpiResolved]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function resolveBandAmountMinor(
  amb: AmbiguityKpiResolved | null,
  band: SignalClarityBand,
): MinorAmountField | undefined {
  if (band.amount_minor != null && String(band.amount_minor).trim() !== '') {
    return band.amount_minor
  }
  const spec = signalClarityBandSpec(band.band)
  if (!spec) return undefined
  return readAmbField(amb, spec.amountField)
}

export function resolveBandItemCount(
  amb: AmbiguityKpiResolved | null,
  band: SignalClarityBand,
): number | undefined {
  if (band.item_count != null && Number.isFinite(band.item_count)) {
    return band.item_count
  }
  const spec = signalClarityBandSpec(band.band)
  return spec && 'countField' in spec ? readAmbCount(amb, spec.countField) : undefined
}

export function displayBandLabel(band: SignalClarityBand): string {
  return signalClarityBandSpec(band.band)?.displayLabel ?? band.band
}

export function displayBandHelper(band: SignalClarityBand): string | null {
  return signalClarityHelperLabel(band.band, band.range_label)
}

export function displayBandRollLabel(band: SignalClarityBand): string | null {
  const spec = signalClarityBandSpec(band.band)
  return spec?.rollLabel ?? null
}

export function mergeSignalClarityBands(
  amb: AmbiguityKpiResolved | null,
): SignalClarityBand[] {
  const fromApi = amb?.signal_clarity_bands ?? []
  const byKey = new Map<SignalClarityBandKey, SignalClarityBand>()

  for (const band of fromApi) {
    const key = normalizeSignalClarityBandKey(band.band)
    if (key) byKey.set(key, band)
  }

  const merged: SignalClarityBand[] = []

  for (const key of SIGNAL_CLARITY_BAND_ORDER) {
    const spec = SIGNAL_CLARITY_COPY.bands[key]
    const existing = byKey.get(key)
    const amountFromRoot = readAmbField(amb, spec.amountField)

    if (existing) {
      merged.push(existing)
      continue
    }

    if (amountFromRoot == null) continue

    merged.push({
      band: spec.band,
      amount_minor: amountFromRoot,
      item_count: 'countField' in spec ? readAmbCount(amb, spec.countField) : undefined,
    })
  }

  return merged.length > 0 ? merged : fromApi
}

export function formatBandAmount(amb: AmbiguityKpiResolved | null, band: SignalClarityBand): string {
  const amount = resolveBandAmountMinor(amb, band)
  return formatKpiMoneyMinor(amount)
}

export function formatBandLegendLine(amb: AmbiguityKpiResolved | null, band: SignalClarityBand): string {
  const amount = formatBandAmount(amb, band)
  const count = resolveBandItemCount(amb, band)

  const parts = [amount]
  if (count != null) parts.push(`${displayApiField(count)} items`)
  return parts.join(' · ')
}
