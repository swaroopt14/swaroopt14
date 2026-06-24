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
} from '../copy/signalClarityCopy'
import { displayApiField, formatKpiMoneyMinor } from '../../shared/formatApiKpiFields'

function coerceAmountMinor(value: MinorAmountField | undefined): number {
  if (value == null || String(value).trim() === '') return 0
  const n = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function coerceSharePct(value: SignalClarityBand['share_pct']): number | null {
  if (value == null || String(value).trim() === '') return null
  const n = Number(String(value).trim())
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Equal segments when no amounts; otherwise width ∝ band amount (or normalized share_pct). */
export function computeBandWidthPercents(bands: SignalClarityBand[]): number[] {
  const equal = 100 / Math.max(bands.length, 1)
  const amounts = bands.map((band) => coerceAmountMinor(band.amount_minor))
  const amountTotal = amounts.reduce((sum, amount) => sum + amount, 0)

  if (amountTotal > 0) {
    return amounts.map((amount) => (amount / amountTotal) * 100)
  }

  const shares = bands.map((band) => coerceSharePct(band.share_pct))
  const shareTotal = shares.reduce<number>((sum, share) => sum + (share ?? 0), 0)
  if (shareTotal > 0 && shares.every((share) => share != null)) {
    return shares.map((share) => ((share ?? 0) / shareTotal) * 100)
  }

  return bands.map(() => equal)
}

export function resolveBandAmountMinor(band: SignalClarityBand): MinorAmountField | undefined {
  if (band.amount_minor == null || String(band.amount_minor).trim() === '') return undefined
  return band.amount_minor
}

export function resolveBandItemCount(band: SignalClarityBand): number | undefined {
  if (band.item_count == null || !Number.isFinite(band.item_count)) return undefined
  return band.item_count
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

/** Always returns five bands — API `signal_clarity_bands` only, no root-field synthesis. */
export function mergeSignalClarityBands(
  amb: AmbiguityKpiResolved | null,
): SignalClarityBand[] {
  const fromApi = amb?.signal_clarity_bands ?? []
  const byKey = new Map<string, SignalClarityBand>()

  for (const band of fromApi) {
    const key = normalizeSignalClarityBandKey(band.band)
    if (key) byKey.set(key, band)
  }

  return SIGNAL_CLARITY_BAND_ORDER.map((key) => {
    const spec = SIGNAL_CLARITY_COPY.bands[key]
    return byKey.get(key) ?? { band: spec.band, amount_minor: '' }
  })
}

export function formatBandAmount(band: SignalClarityBand): string {
  return formatKpiMoneyMinor(resolveBandAmountMinor(band))
}

export function formatBandLegendLine(band: SignalClarityBand): string {
  const amount = formatBandAmount(band)
  const count = resolveBandItemCount(band)

  const parts = [amount]
  if (count != null) parts.push(`${displayApiField(count)} items`)
  return parts.join(' · ')
}
