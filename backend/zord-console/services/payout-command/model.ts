export type GlyphName =
  | 'home'
  | 'document'
  | 'menu-dots'
  | 'search'
  | 'users'
  | 'bank'
  | 'folder'
  | 'shield'
  | 'grid'
  | 'eye'
  | 'zap'
  | 'refresh'
  | 'arrow-up-right'
  | 'chart'

export type DockId = 'home' | 'workspace' | 'recoveries' | 'grid' | 'sync' | 'proof'
export type WorkspaceTab = 'Today' | 'Routing' | 'Proof' | 'Banks'
export type HomeTimeframe = 'Week' | 'Month' | 'Quarter' | 'Year'

export type HomeSimulation = {
  prompt: string
  keywords: readonly string[]
  title: string
  summary: string
  tooltipNote: string
  metricBase: number
  tooltipValueBase: number
  tooltipDeltaBase: number
  range: readonly [number, number]
  salesBase: number
  expensesBase: number
  budgetBase: number
  insightText: string
  insightValueBase: number
}

export type WorkspaceSimulation = {
  prompt: string
  keywords: readonly string[]
  question: string
  supporting: string
  assistant: string
  heroLabel: string
  heroValue: string
  heroBars: readonly number[]
  listTitle: string
  listRows: readonly [string, string][]
  listFooter: string
  listAction: string
  statTitle: string
  statValue: string
  statNote: string
  compareLabels: readonly [string, string]
  bottomTitle: string
  bottomValue: string
  bottomMeta: string
  moduleBodies: readonly string[]
}

export type HomeOverviewSnapshot = {
  metricValue: string
  title: string
  summary: string
  tooltipValue: string
  tooltipDelta: string
  tooltipNote: string
  range: readonly [number, number]
  chartData: Array<{
    point: number
    barValue: number
    lineValue: number
    lowerLineValue: number
    selected: boolean
    isHoliday: boolean
  }>
  salesValue: string
  expensesValue: string
  budgetValue: string
  insightText: string
  insightValue: string
  insightGaugeProgress: number
  forecastBars: number[]
  budgetBars: number[]
  axisLabels: readonly string[]
  quarterName: 'Q1' | 'Q2' | 'Q3' | 'Q4'
  quarterMonths: readonly string[]
  selectedYear: 2026 | 2027 | 2028
  holidayLabels: readonly string[]
  salesBaseValue: number
  expensesBaseValue: number
  budgetBaseValue: number
  insightBaseValue: number
  timeframeLabel: string
}

export type HomeCommandResponse = {
  title: string
  body: string
}

export type HomeCommandStatus = 'idle' | 'loading' | 'typing' | 'complete'

export const DASHBOARD_FONT_STACK = '"DM Sans", "Geist", "Plus Jakarta Sans", "Inter", system-ui, sans-serif'

export const dockItems: Array<{ id: DockId; label: string; title: string; summary: string; icon: GlyphName }> = [
  {
    id: 'home',
    label: 'Home',
    title: 'Home overview',
    summary: 'The high-signal operating overview for payout value, provider posture, recovery lift, and next-action intelligence.',
    icon: 'home',
  },
  {
    id: 'workspace',
    label: 'Command',
    title: 'Payout command view',
    summary: 'The main operating workspace for routed value, live recovery, and finance-ready evidence.',
    icon: 'folder',
  },
  {
    id: 'recoveries',
    label: 'Finality',
    title: 'Reconciliation & Finality',
    summary: 'How much is fully reconciled, how much is pending, and where mismatches remain across payout books, PSP records, and bank confirmation.',
    icon: 'zap',
  },
  {
    id: 'grid',
    label: 'Trace',
    title: 'Trace & Evidence',
    summary: 'One screen to explain exactly what happened to a payout end-to-end, from request to final outcome.',
    icon: 'grid',
  },
  {
    id: 'sync',
    label: 'Intelligence',
    title: 'Payout Intelligence',
    summary: 'Trends, cohorts, and where money is at risk across clients, rails, and PSPs.',
    icon: 'refresh',
  },
  {
    id: 'proof',
    label: 'Failures',
    title: 'Failure Intelligence',
    summary: 'Error taxonomy and ops queue so issues are solved by the right team, fast, with clear owner routing and queue depth.',
    icon: 'document',
  },
] as const

export const workspaceTabs: WorkspaceTab[] = ['Today', 'Routing', 'Proof', 'Banks']

export const workspacePromptCopy = {
  Today: {
    question: 'What should the intelligence layer analyze inside the payout command view?',
    supporting: 'Grounded on routed value, callback timing, bank-side movement, and export readiness already visible in the workspace.',
    suggestions: [
      'Show where routed value is concentrating right now',
      'Clarify which issue belongs to bank-side operations',
      'What is delaying proof export today?',
    ],
  },
  Routing: {
    question: 'Which provider lane needs the next routing decision?',
    supporting: 'Grounded on provider posture, overflow pressure, and confirmation drift already visible in the workspace.',
    suggestions: [
      'Which route should take overflow next?',
      'What is still degraded after the reroute?',
      'Show the lane with the highest callback risk',
    ],
  },
  Proof: {
    question: 'Which payout packets are closest to close-ready proof right now?',
    supporting: 'Grounded on callbacks, statement cues, export queue state, and finance readiness already visible in the workspace.',
    suggestions: [
      'Which proof pack can finance close now?',
      'What evidence is still missing today?',
      'Show the delayed export queue',
    ],
  },
  Banks: {
    question: 'Where is bank-side behavior still slowing clean confirmation?',
    supporting: 'Grounded on bank callbacks, statement lag, pending finality, and active escalation cues already visible in the workspace.',
    suggestions: [
      'Which bank hotspot needs escalation first?',
      'Show callback lag by bank cluster',
      'What is blocking clean finality now?',
    ],
  },
} as const

export const workspaceTiles = [
  { icon: 'folder' as GlyphName, title: 'Intelligence workspace', body: 'Read routed value, live exceptions, and finance evidence from one operating surface.' },
  { icon: 'users' as GlyphName, title: 'Ownership routing', body: 'Clarify whether the next move belongs to ops, finance, engineering, or bank-side follow-up.' },
  { icon: 'bank' as GlyphName, title: 'Bank coordination', body: 'Surface callback lag and bank-side drift before they begin blocking clean confirmation.' },
  { icon: 'shield' as GlyphName, title: 'Provider guardrail', body: 'Keep route posture visible while traffic shifts around degraded providers and overflow lanes.' },
] as const

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function formatUsdWhole(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

export function formatUsdCompactK(value: number) {
  return `$${(value / 1000).toFixed(1).replace('.', ',')}k`
}

export function formatPercentBadge(value: number) {
  const rounded = Math.round(value)
  return `${rounded >= 0 ? '+' : ''}${rounded}%`
}

export function resolveHomeTimeframeFromPrompt(prompt: string, currentTimeframe: HomeTimeframe) {
  const lowerPrompt = prompt.toLowerCase()
  if (lowerPrompt.includes('week') || lowerPrompt.includes('today') || lowerPrompt.includes('now')) return 'Week'
  if (lowerPrompt.includes('month')) return 'Month'
  if (lowerPrompt.includes('quarter') || lowerPrompt.includes('qtd')) return 'Quarter'
  if (lowerPrompt.includes('year') || lowerPrompt.includes('ytd')) return 'Year'
  return currentTimeframe
}

export function resolveHomeYearFromPrompt(prompt: string, currentYear: 2026 | 2027 | 2028) {
  const matched = prompt.match(/20(26|27|28)/)
  if (!matched) return currentYear
  const parsed = Number(matched[0]) as 2026 | 2027 | 2028
  return HOME_YEAR_OPTIONS.includes(parsed) ? parsed : currentYear
}

export function resolveHomeQuarterFromPrompt(prompt: string, currentQuarterIndex: number) {
  const lowerPrompt = prompt.toLowerCase()
  if (lowerPrompt.includes('q1') || lowerPrompt.includes('first quarter')) return 0
  if (lowerPrompt.includes('q2') || lowerPrompt.includes('second quarter')) return 1
  if (lowerPrompt.includes('q3') || lowerPrompt.includes('third quarter')) return 2
  if (lowerPrompt.includes('q4') || lowerPrompt.includes('fourth quarter')) return 3
  return currentQuarterIndex
}

function buildTimeframeConfig(timeframe: HomeTimeframe, quarterIndex: number, selectedYear: 2026 | 2027 | 2028) {
  if (timeframe === 'Week') {
    return {
      totalBars: 84,
      labels: [...HOME_WEEKDAY_LABELS],
      holidayLabels: ['Thursday (Bank Holiday)', 'Sunday (Weekend Holiday)'],
      timeframeLabel: `Week view • Mon-Sun • ${selectedYear}`,
      rangeLength: 42,
    }
  }

  if (timeframe === 'Quarter') {
    const quarter = HOME_QUARTERS[clamp(quarterIndex, 0, HOME_QUARTERS.length - 1)]
    return {
      totalBars: 90,
      labels: quarter.months.map((month) => month.slice(0, 3)),
      holidayLabels: [],
      timeframeLabel: `${quarter.name} • ${quarter.months.join(', ')} • ${selectedYear}`,
      rangeLength: 54,
    }
  }

  if (timeframe === 'Year') {
    return {
      totalBars: 144,
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      holidayLabels: [],
      timeframeLabel: `Year view • ${selectedYear}`,
      rangeLength: 102,
    }
  }

  return {
    totalBars: 112,
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
    holidayLabels: [],
    timeframeLabel: `Month view • ${selectedYear}`,
    rangeLength: 30,
  }
}

function resolveHomeRange(
  baseRange: readonly [number, number],
  tick: number,
  totalBars: number,
  targetLength: number,
) {
  const [baseStart, baseEnd] = baseRange
  const baseMidpoint = (baseStart + baseEnd) / 2
  const midpointScale = totalBars / 112
  const midpoint = Math.round(baseMidpoint * midpointScale + Math.sin(tick * 0.42) * 1.8)
  const safeLength = clamp(targetLength, 10, totalBars - 6)
  const start = clamp(Math.round(midpoint - safeLength / 2), 0, totalBars - safeLength - 1)
  return [start, start + safeLength] as const
}

export function buildSimulatedHomeOverviewSnapshot(
  scenario: HomeSimulation,
  timeframe: HomeTimeframe,
  tick: number,
  selectedYear: 2026 | 2027 | 2028,
  quarterIndex: number,
): HomeOverviewSnapshot {
  const timeframeScale = timeframe === 'Week' ? 0.42 : timeframe === 'Month' ? 1 : timeframe === 'Quarter' ? 1.42 : 1.95
  const volatilityScale = timeframe === 'Week' ? 1.38 : timeframe === 'Month' ? 1 : timeframe === 'Quarter' ? 0.88 : 0.7
  const rangeLift = timeframe === 'Week' ? 0.92 : timeframe === 'Month' ? 1 : timeframe === 'Quarter' ? 1.08 : 1.16
  const yearScale = selectedYear === 2026 ? 1 : selectedYear === 2027 ? 1.07 : 1.14
  const timeframeConfig = buildTimeframeConfig(timeframe, quarterIndex, selectedYear)
  const phase = tick * 0.26
  const range = resolveHomeRange(scenario.range, tick, timeframeConfig.totalBars, timeframeConfig.rangeLength)
  const [selectedRangeStart, selectedRangeEnd] = range

  const chartData = Array.from({ length: timeframeConfig.totalBars }, (_, index) => {
    const selected = index >= selectedRangeStart && index <= selectedRangeEnd
    const primaryPeak = Math.exp(-Math.pow(index - 34, 2) / (2 * 10.5 * 10.5)) * 34000
    const secondaryPeak = Math.exp(-Math.pow(index - 80, 2) / (2 * 7.4 * 7.4)) * 11000
    const lateLift = index > 94 ? (index - 94) * 1200 : 0
    const livePulse = Math.sin(index * 0.24 + phase) * 1600 + Math.cos(index * 0.11 - phase * 0.6) * 900
    const barBase =
      46000 +
      Math.sin(index * 0.24 - 0.2 + phase * 0.18) * 6800 * volatilityScale +
      Math.cos(index * 0.07 + 0.2 - phase * 0.12) * 4200 * volatilityScale +
      Math.sin(index * 0.57 + phase * 0.34) * 2100 * volatilityScale +
      livePulse
    const lineBase =
      47000 +
      Math.sin(index * 0.19 - 0.5 + phase * 0.12) * 2200 * volatilityScale +
      Math.cos(index * 0.44 + 0.15 - phase * 0.08) * 1500 * volatilityScale +
      Math.sin(index * 0.73 + phase * 0.17) * 780 * volatilityScale
    const lowerLineBase =
      26000 +
      Math.sin(index * 0.17 + 0.8 + phase * 0.09) * 1800 * volatilityScale +
      Math.cos(index * 0.31 - 0.4 - phase * 0.07) * 1100 * volatilityScale +
      Math.sin(index * 0.58 + phase * 0.16) * 560 * volatilityScale
    const dayIndex = timeframe === 'Week' ? Math.floor(index / 12) : -1
    const isHoliday = timeframe === 'Week' && (dayIndex === 3 || dayIndex === 6)

    return {
      point: index,
      barValue: Math.max(18000, Math.min(122000, barBase + primaryPeak * rangeLift + secondaryPeak * rangeLift + lateLift * rangeLift + (isHoliday ? -1800 : 0))),
      lineValue: Math.max(34000, Math.min(71000, lineBase + primaryPeak * 0.12 * rangeLift + secondaryPeak * 0.1 * rangeLift + lateLift * 0.12)),
      lowerLineValue: Math.max(12000, Math.min(46000, lowerLineBase + primaryPeak * 0.06 * rangeLift + secondaryPeak * 0.05 * rangeLift)),
      selected,
      isHoliday,
    }
  })

  const forecastBars = chartData.slice(selectedRangeStart, selectedRangeStart + 6).map((entry) => entry.barValue / HOME_CHART_DOMAIN_MAX)
  const budgetBars = chartData.slice(selectedRangeStart + 6, selectedRangeStart + 14).map((entry) => entry.lineValue / HOME_CHART_DOMAIN_MAX)
  const phaseLift = Math.sin(phase * 0.72) + Math.cos(phase * 0.31)
  const activeQuarter = HOME_QUARTERS[clamp(quarterIndex, 0, HOME_QUARTERS.length - 1)]
  const metricBaseScaled = scenario.metricBase * yearScale
  const salesBaseScaled = scenario.salesBase * yearScale
  const expensesBaseScaled = scenario.expensesBase * (0.96 + (yearScale - 1) * 0.5)
  const budgetBaseScaled = scenario.budgetBase * yearScale
  const insightBaseScaled = scenario.insightValueBase * yearScale

  return {
    metricValue: formatUsdWhole(metricBaseScaled + phaseLift * 2_400_000 * timeframeScale),
    title: scenario.title,
    summary: scenario.summary,
    tooltipValue: formatUsdCompactK(scenario.tooltipValueBase * yearScale + phaseLift * 4200 * timeframeScale),
    tooltipDelta: formatPercentBadge(scenario.tooltipDeltaBase + Math.sin(phase * 0.62) * 2.4),
    tooltipNote: scenario.tooltipNote,
    range,
    chartData,
    salesValue: formatUsdCompactK(salesBaseScaled + phaseLift * 1700 * timeframeScale),
    expensesValue: formatUsdCompactK(expensesBaseScaled + Math.cos(phase * 0.48) * 780 * timeframeScale),
    budgetValue: formatUsdCompactK(budgetBaseScaled + Math.sin(phase * 0.4) * 1200 * timeframeScale),
    insightText: scenario.insightText,
    insightValue: formatUsdCompactK(insightBaseScaled + Math.sin(phase * 0.58) * 1600 * timeframeScale),
    insightGaugeProgress: clamp(0.54 + Math.sin(phase * 0.46) * 0.12 + timeframeScale * 0.03, 0.4, 0.92),
    forecastBars,
    budgetBars,
    axisLabels: timeframeConfig.labels,
    quarterName: activeQuarter.name,
    quarterMonths: activeQuarter.months,
    selectedYear,
    holidayLabels: timeframeConfig.holidayLabels,
    salesBaseValue: salesBaseScaled,
    expensesBaseValue: expensesBaseScaled,
    budgetBaseValue: budgetBaseScaled,
    insightBaseValue: insightBaseScaled,
    timeframeLabel: timeframeConfig.timeframeLabel,
  }
}

export const homeTimeframes: readonly HomeTimeframe[] = ['Week', 'Month', 'Quarter', 'Year']
export const HOME_SIMULATION_INTERVAL_MS = 2600
export const HOME_CHART_DOMAIN_MAX = 150000
export const HOME_YEAR_OPTIONS = [2026, 2027, 2028] as const
export const HOME_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const HOME_QUARTERS = [
  { name: 'Q1' as const, months: ['January', 'February', 'March'] },
  { name: 'Q2' as const, months: ['April', 'May', 'June'] },
  { name: 'Q3' as const, months: ['July', 'August', 'September'] },
  { name: 'Q4' as const, months: ['October', 'November', 'December'] },
] as const

export const homeSimulationScenarios: readonly HomeSimulation[] = [
  {
    prompt: 'What changed across routed payout quality this cycle?',
    keywords: ['quality', 'routed', 'reroute', 'income', 'payout', 'cycle'],
    title: 'Payout income',
    summary: 'Payout income accelerated after overflow moved away from degraded PSP lanes and into healthier routes.',
    tooltipNote: 'Income growth to end the half-year.',
    metricBase: 1651045139,
    tooltipValueBase: 115000,
    tooltipDeltaBase: 32,
    range: [20, 50],
    salesBase: 142900,
    expensesBase: 16400,
    budgetBase: 92500,
    insightText:
      'Overnight reroute discipline lifted cleared quality while reducing exception drag. First action: monitor one bank-side cohort where confirmation lag is still above desk threshold.',
    insightValueBase: 57900,
  },
  {
    prompt: 'Why did proof readiness shift for this issuer set?',
    keywords: ['proof', 'readiness', 'export', 'evidence', 'finance', 'issuer'],
    title: 'Finance-ready value',
    summary: 'Proof coverage improved after callback packets and bank references were stitched into export-ready bundles.',
    tooltipNote: 'Proof-ready growth through the close window.',
    metricBase: 1598204711,
    tooltipValueBase: 92000,
    tooltipDeltaBase: 18,
    range: [24, 54],
    salesBase: 142900,
    expensesBase: 16400,
    budgetBase: 92500,
    insightText:
      'Proof readiness improved with fewer manual joins and faster confirmation alignment. First action: prioritize export for issuers with the largest unsettled value.',
    insightValueBase: 57900,
  },
  {
    prompt: 'Where is bank-side confirmation still lagging after reroute?',
    keywords: ['bank', 'confirmation', 'lag', 'callback', 'statement', 'reroute'],
    title: 'Confirmed payout value',
    summary: 'Confirmed value recovered as callback lag eased across the highest-volume bank corridors and manual trails dropped.',
    tooltipNote: 'Confirmation lift after callback lag normalized.',
    metricBase: 1622408553,
    tooltipValueBase: 104000,
    tooltipDeltaBase: 21,
    range: [18, 46],
    salesBase: 142900,
    expensesBase: 16400,
    budgetBase: 92500,
    insightText:
      'Bank-side lag narrowed in high-volume corridors, but one branch cluster remains a morning risk for close timing and proof completion.',
    insightValueBase: 57900,
  },
] as const

export const workspaceSimulationScenarios: Record<WorkspaceTab, readonly WorkspaceSimulation[]> = {
  Today: [
    {
      prompt: 'Show where routed value is concentrating right now',
      keywords: ['routed', 'value', 'concentrating', 'where', 'today'],
      question: 'What should the intelligence layer analyze inside the payout command view?',
      supporting: 'Grounded on routed value, callback timing, bank-side movement, and export readiness already visible in the workspace.',
      assistant: 'Recovered routed value is concentrating in the Razorpay and Stripe overflow lanes after traffic shifted away from degraded PSP routes. Bank-side delay is low there, so ops can keep the current distribution while finance uses those intents for proof-first close.',
      heroLabel: 'Command scope clean payouts',
      heroValue: '1,231',
      heroBars: [3, 3, 11, 18, 9, 6, 2, 4, 3, 3, 3],
      listTitle: 'Provider posture',
      listRows: [['Razorpay', '99.1%'], ['Cashfree', '98.4%'], ['PayU', '91.6%']],
      listFooter: '+19 more routes',
      listAction: 'View all providers',
      statTitle: 'Recovery intelligence',
      statValue: '+65.5%',
      statNote: 'Routed value recovered this cycle',
      compareLabels: ['Previous cycle', 'Current cycle'],
      bottomTitle: 'Escalations ready',
      bottomValue: '459',
      bottomMeta: 'Provider and bank-side issues packaged for operator review.',
      moduleBodies: [
        'Read routed value, live exceptions, and finance evidence from one operating surface.',
        'Clarify whether the next move belongs to ops, finance, engineering, or bank-side follow-up.',
        'Surface callback lag and bank-side drift before they begin blocking clean confirmation.',
        'Keep route posture visible while traffic shifts around degraded providers and overflow lanes.',
      ],
    },
    {
      prompt: 'Clarify which issue belongs to bank-side operations',
      keywords: ['bank-side', 'bank', 'operations', 'ownership', 'issue'],
      question: 'Which payout issues should move into bank-side operations first?',
      supporting: 'Grounded on callback lag, finality status, and bank-side drift already visible in the workspace.',
      assistant: 'Bank-side operations should take the intents still waiting on statement-side confirmation and callback recovery, especially where provider posture is already healthy. Ops can leave route configuration unchanged and move the next action to bank follow-up.',
      heroLabel: 'Bank-side ownership queue',
      heroValue: '84',
      heroBars: [2, 4, 7, 10, 12, 9, 8, 6, 5, 4, 3],
      listTitle: 'Bank clusters',
      listRows: [['ICICI', '27'], ['HDFC', '18'], ['Axis', '12']],
      listFooter: '+6 more hotspots',
      listAction: 'View bank queues',
      statTitle: 'Confirmation drift',
      statValue: '+12.4%',
      statNote: 'Bank-side review pressure',
      compareLabels: ['Callback', 'Statement'],
      bottomTitle: 'Escalations ready',
      bottomValue: '31',
      bottomMeta: 'Intents packaged for bank-side confirmation review.',
      moduleBodies: [
        'Read bank-side lag, pending callbacks, and operator notes from one ownership lane.',
        'Clarify whether the next move belongs to ops or statement-side follow-up.',
        'Surface the banks where callback lag is already slowing clean confirmation.',
        'Keep provider posture visible while bank-side work clears the remaining finality gap.',
      ],
    },
    {
      prompt: 'What is delaying proof export today?',
      keywords: ['proof', 'export', 'delaying', 'delay', 'today'],
      question: 'What is delaying proof export today?',
      supporting: 'Grounded on export queues, callback completion, and finance bundle readiness already visible in the workspace.',
      assistant: 'Proof export is still gated by missing callback attachments and late bank references on a narrow set of intents. The queue is small enough to clear today, but finance should prioritize packets where provider logs and callback proofs are already paired.',
      heroLabel: 'Proof packs ready',
      heroValue: '142',
      heroBars: [2, 3, 8, 13, 10, 7, 4, 6, 3, 2, 2],
      listTitle: 'Evidence sources',
      listRows: [['Statements', '41'], ['Callbacks', '62'], ['Exports', '39']],
      listFooter: '+8 pending bundles',
      listAction: 'Review proof queue',
      statTitle: 'Close confidence',
      statValue: '84.2%',
      statNote: 'Finance-ready proof confidence',
      compareLabels: ['Audit', 'Close'],
      bottomTitle: 'Export queue',
      bottomValue: '27',
      bottomMeta: 'Proof packets waiting on final callback or statement cues.',
      moduleBodies: [
        'Read export coverage, callback completion, and finance evidence from one proof lane.',
        'Clarify whether the next move belongs to finance, ops, or engineering trace review.',
        'Surface bank-side gaps before they begin blocking proof close.',
        'Keep provider posture visible while teams clear the delayed export queue.',
      ],
    },
  ],
  Routing: [
    {
      prompt: 'Which route should take overflow next?',
      keywords: ['route', 'overflow', 'next', 'routing'],
      question: 'Which provider lane needs the next routing decision?',
      supporting: 'Grounded on provider posture, overflow pressure, and confirmation drift already visible in the workspace.',
      assistant: 'Overflow should move into Razorpay and Stripe first because both lanes are clearing with lower callback lag than the degraded partners. Keep Cashfree live for resilience, but do not route the next burst there until confirmation volatility settles.',
      heroLabel: 'Overflow recovery lanes',
      heroValue: '62',
      heroBars: [2, 5, 9, 14, 13, 10, 8, 6, 4, 3, 2],
      listTitle: 'Route candidates',
      listRows: [['Razorpay', 'Primary'], ['Stripe', 'Overflow'], ['Cashfree', 'Fallback']],
      listFooter: '+4 more lanes',
      listAction: 'Open routing map',
      statTitle: 'Recovery rate',
      statValue: '+24.7%',
      statNote: 'Recovered after reroute',
      compareLabels: ['Primary', 'Overflow'],
      bottomTitle: 'Action queue',
      bottomValue: '18',
      bottomMeta: 'Routing decisions ready for the next operator pass.',
      moduleBodies: [
        'Read route health, overflow allocation, and fallback depth from one routing surface.',
        'Clarify whether the next move is a reroute, throttle, or bank-side watch.',
        'Surface the banks still constraining the highest-performing routes.',
        'Keep degraded providers visible while traffic shifts around overflow lanes.',
      ],
    },
  ],
  Proof: [
    {
      prompt: 'Which proof pack can finance close now?',
      keywords: ['proof', 'finance', 'close', 'pack'],
      question: 'Which payout packets are closest to close-ready proof right now?',
      supporting: 'Grounded on callbacks, statement cues, export queue state, and finance readiness already visible in the workspace.',
      assistant: 'Finance can close the packets where callback proofs and statement references are already paired. The remaining risk sits in a smaller band of intents still waiting on statement-side confirmation or export assembly.',
      heroLabel: 'Proof packs ready',
      heroValue: '142',
      heroBars: [2, 3, 8, 13, 10, 7, 4, 6, 3, 2, 2],
      listTitle: 'Proof sources',
      listRows: [['Callbacks', '62'], ['Statements', '41'], ['Provider logs', '39']],
      listFooter: '+11 missing packets',
      listAction: 'Open proof desk',
      statTitle: 'Close confidence',
      statValue: '84.2%',
      statNote: 'Finance-ready proof confidence',
      compareLabels: ['Queued', 'Ready'],
      bottomTitle: 'Export queue',
      bottomValue: '27',
      bottomMeta: 'Packets still waiting on final assembly before close.',
      moduleBodies: [
        'Read proof coverage, source parity, and export readiness from one finance surface.',
        'Clarify whether the next move belongs to finance close or evidence assembly.',
        'Surface bank-side gaps before they begin blocking packet completion.',
        'Keep route posture visible while the export queue is being cleared.',
      ],
    },
  ],
  Banks: [
    {
      prompt: 'Which bank hotspot needs escalation first?',
      keywords: ['bank', 'hotspot', 'escalation', 'first'],
      question: 'Where is bank-side behavior still slowing clean confirmation?',
      supporting: 'Grounded on bank callbacks, statement lag, pending finality, and active escalation cues already visible in the workspace.',
      assistant: 'The first escalation should go to the bank clusters where callback lag remains high even after reroute pressure eased. Those hotspots are now the primary blocker to clean finality, not provider posture.',
      heroLabel: 'Bank-side exposure',
      heroValue: '27',
      heroBars: [2, 4, 5, 7, 9, 11, 10, 8, 6, 4, 3],
      listTitle: 'Bank hotspots',
      listRows: [['ICICI', 'High'], ['Axis', 'Medium'], ['SBI', 'Watch']],
      listFooter: '+5 more banks',
      listAction: 'View bank queues',
      statTitle: 'Callback drift',
      statValue: '+9.8%',
      statNote: 'Pending finality pressure',
      compareLabels: ['Callback', 'Statement'],
      bottomTitle: 'Bank escalations',
      bottomValue: '12',
      bottomMeta: 'High-priority bank follow-ups ready for review.',
      moduleBodies: [
        'Read bank-side drift, callback lag, and finality pressure from one oversight lane.',
        'Clarify whether the next move belongs to bank ops or routing rebalancing.',
        'Surface which bank hotspots still block clean confirmation despite healthy provider posture.',
        'Keep provider and proof posture visible while bank-side work clears the remaining gap.',
      ],
    },
  ],
}

export function resolvePromptScenario<T extends { keywords: readonly string[]; prompt: string }>(
  prompt: string,
  scenarios: readonly T[],
  fallback: T,
) {
  const lowerPrompt = prompt.toLowerCase()
  let bestMatch = fallback
  let bestScore = 0

  for (const scenario of scenarios) {
    const keywordScore = scenario.keywords.reduce((score, keyword) => score + (lowerPrompt.includes(keyword) ? 1 : 0), 0)
    const exactPromptBoost = lowerPrompt.includes(scenario.prompt.toLowerCase()) ? 2 : 0
    const score = keywordScore + exactPromptBoost
    if (score > bestScore) {
      bestMatch = scenario
      bestScore = score
    }
  }

  return bestMatch
}

export const recoveryTrendData = [
  { month: 'Jan', value: 41, baseline: 34 },
  { month: 'Feb', value: 46, baseline: 37 },
  { month: 'Mar', value: 52, baseline: 39 },
  { month: 'Apr', value: 58, baseline: 42 },
  { month: 'May', value: 63, baseline: 46 },
  { month: 'Jun', value: 72, baseline: 49 },
  { month: 'Jul', value: 69, baseline: 50 },
  { month: 'Aug', value: 76, baseline: 53 },
  { month: 'Sep', value: 81, baseline: 56 },
] as const

export const recoveryMix = [
  { name: 'Primary', value: 45 },
  { name: 'Overflow', value: 85 },
  { name: 'Fallback', value: 48 },
  { name: 'Manual', value: 22 },
] as const

export const recoveryWatchlist = [
  { name: 'Razorpay', value: '₹18.4L', delta: '-0.92%' },
  { name: 'Stripe', value: '₹11.2L', delta: '+1.87%' },
  { name: 'Cashfree', value: '₹9.8L', delta: '-0.45%' },
  { name: 'Fallbacks', value: '₹15.4L', delta: '+0.64%' },
] as const

export const intentRows = [
  { intent: 'PAYOUT_24118', owner: 'Ops', risk: 'High', proof: 'Pending', next: 'Bank follow-up' },
  { intent: 'PAYOUT_24109', owner: 'Finance', risk: 'Medium', proof: 'Ready', next: 'Close packet' },
  { intent: 'PAYOUT_24097', owner: 'Engineering', risk: 'High', proof: 'Missing', next: 'Webhook trace' },
  { intent: 'PAYOUT_24084', owner: 'Ops', risk: 'Low', proof: 'Ready', next: 'Reroute check' },
  { intent: 'PAYOUT_24071', owner: 'Bank Ops', risk: 'High', proof: 'Pending', next: 'Escalation' },
  { intent: 'PAYOUT_24063', owner: 'Finance', risk: 'Medium', proof: 'Ready', next: 'Export now' },
] as const

export const spiderData = [
  { subject: 'Routing', value: 86 },
  { subject: 'Callback', value: 72 },
  { subject: 'Proof', value: 81 },
  { subject: 'Banking', value: 68 },
  { subject: 'Recovery', value: 76 },
  { subject: 'Handoff', value: 71 },
] as const

export const gridBarData = [
  { label: 'Ops', open: 44, cleared: 29 },
  { label: 'Finance', open: 31, cleared: 26 },
  { label: 'Engineering', open: 18, cleared: 11 },
  { label: 'Bank Ops', open: 27, cleared: 16 },
] as const

export const heatMap = [
  [3, 5, 4, 2, 1, 0],
  [5, 7, 6, 4, 2, 1],
  [7, 9, 8, 5, 4, 2],
  [6, 8, 9, 7, 5, 3],
] as const

export const syncTrendData = [
  { point: '08:00', payments: 62, webhooks: 54, statements: 44 },
  { point: '10:00', payments: 75, webhooks: 61, statements: 49 },
  { point: '12:00', payments: 84, webhooks: 72, statements: 55 },
  { point: '14:00', payments: 93, webhooks: 76, statements: 63 },
  { point: '16:00', payments: 88, webhooks: 73, statements: 60 },
  { point: '18:00', payments: 95, webhooks: 82, statements: 68 },
  { point: '20:00', payments: 90, webhooks: 79, statements: 64 },
] as const

export const syncPieData = [
  { name: 'Payments', value: 46 },
  { name: 'Webhooks', value: 31 },
  { name: 'Statements', value: 23 },
] as const

export const syncBarData = [
  { name: 'Razorpay', lag: 118, retries: 12 },
  { name: 'Stripe', lag: 92, retries: 8 },
  { name: 'Cashfree', lag: 141, retries: 18 },
  { name: 'ICICI', lag: 167, retries: 22 },
] as const

export const proofRows = [
  { name: 'Export queue', value: '27', note: 'Still waiting on final assembly' },
  { name: 'Ready packets', value: '142', note: 'Finance-ready this cycle' },
  { name: 'Audit confidence', value: '84.2%', note: 'Valid evidence chain present' },
  { name: 'Missing sources', value: '11', note: 'Need callback or statement cues' },
] as const

export const proofSourceData = [
  { name: 'Callbacks', value: 41 },
  { name: 'Statements', value: 28 },
  { name: 'Provider logs', value: 19 },
  { name: 'Manual notes', value: 12 },
] as const

export const chartTooltipStyle = {
  border: '0.5px solid #E5E5E5',
  borderRadius: '8px',
  background: '#ffffff',
  boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
}
