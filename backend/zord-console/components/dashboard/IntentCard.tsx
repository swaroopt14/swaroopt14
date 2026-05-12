'use client'

const pipelineStages = [
  { label: 'Envelope', completion: 100 },
  { label: 'NIR', completion: 96 },
  { label: 'Canonical', completion: 94 },
  { label: 'Tokenized', completion: 91 },
]

const stats = [
  { label: 'Validated', value: '17,845' },
  { label: 'Avg Confidence', value: '0.96' },
  { label: 'DLQ Intents', value: '432' },
  { label: 'Ready for Relay', value: '18,102' },
]

export function IntentCard() {
  return (
    <article className="rounded-[20px] border border-gray-200 bg-white p-6 shadow-[0_16px_30px_rgba(15,23,42,0.06)]">
      <h3 className="text-base font-semibold text-slate-900">Intent Processing</h3>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">18,923</p>
      <p className="text-sm text-slate-600">Canonical Intents</p>

      <div className="mt-5 space-y-3">
        {pipelineStages.map((stage) => (
          <div key={stage.label}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">{stage.label}</span>
              <span className="text-xs text-slate-500">{stage.completion}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-[#6366F1] to-[#8B5CF6]" style={{ width: `${stage.completion}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {stats.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] text-slate-500">{item.label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-3.5">
        <p className="text-sm font-semibold text-green-700">Great system health.</p>
        <p className="mt-1 text-xs text-green-700">
          Intent engine processing normally with high confidence mappings.
        </p>
      </div>
    </article>
  )
}
