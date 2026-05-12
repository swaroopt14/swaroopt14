interface ProgressBarProps {
  label: string
  valueLabel: string
  widthClass: string
  barClass: string
}

export function ProgressBar({ label, valueLabel, widthClass, barClass }: ProgressBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#64748B]">{label}</span>
        <span className="font-medium text-[#0F172A]">{valueLabel}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${widthClass} ${barClass}`} />
      </div>
    </div>
  )
}
