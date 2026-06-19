'use client'

import type {
  AmbiguityKpiResolved,
  LeakageKpiResolved,
  PatternsKpiResolved,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { buildLeakagePageInsightItems } from '../../insights/buildPageZordInsightItems'
import { ZordInsightsPanel } from '../../shared/ZordInsightsPanel'

type LeakageZordInsightsCardProps = {
  leakage: LeakageKpiResolved | null
  ambiguity: AmbiguityKpiResolved | null
  patterns: PatternsKpiResolved | null
}

export function LeakageZordInsightsCard({ leakage, ambiguity, patterns }: LeakageZordInsightsCardProps) {
  const insights = buildLeakagePageInsightItems({ leakage, ambiguity, patterns })
  return <ZordInsightsPanel insights={insights} className="h-full" />
}
