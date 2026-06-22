'use client'

import { evidenceCopy } from '../copy/evidenceCopy'
import type { EvidenceKpiCard } from '../types/evidenceViewModels'
import { JournalIntelligenceKpiHero } from '../../command-center/JournalIntelligenceKpiHero'

type EvidenceKpiStripProps = {
  cards: EvidenceKpiCard[]
  loading?: boolean
  defensibilityTier?: string
}

export function EvidenceKpiStrip({ cards, loading, defensibilityTier }: EvidenceKpiStripProps) {
  if (loading) {
    return <div className="h-[286px] animate-pulse rounded-[20px] bg-slate-200/60" />
  }

  const packs = cards.find((c) => c.id === 'packs')
  const primaryValue = packs?.value ?? '—'
  const primarySubcopy = packs?.sub ?? evidenceCopy.proofReadinessHelper
  const tierPill = defensibilityTier ? `Tier ${defensibilityTier}` : evidenceCopy.proofTierLabel

  const buckets = cards.map((card) => ({
    label: card.label,
    value: card.value,
    sub: card.sub,
  }))

  return (
    <JournalIntelligenceKpiHero
      eyebrow={evidenceCopy.kpi.evidencePacksGenerated}
      value={primaryValue}
      deltaPill={tierPill}
      subcopy={primarySubcopy}
      buckets={buckets}
      testId="evidence-kpi-hero"
    />
  )
}
