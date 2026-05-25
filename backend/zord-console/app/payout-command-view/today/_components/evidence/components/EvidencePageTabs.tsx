'use client'

import type { EvidencePageTab } from '../types/evidenceViewModels'

type EvidencePageTabsProps = {
  active: EvidencePageTab
  onChange: (tab: EvidencePageTab) => void
}

export function EvidencePageTabs({ active, onChange }: EvidencePageTabsProps) {
  return (
    <div className="flex gap-1 rounded-[0.85rem] border border-[#E5E5E5] bg-[#f8f8f6] p-1">
      <button
        type="button"
        onClick={() => onChange('workspace')}
        className={`rounded-[0.65rem] px-4 py-2 text-[14px] font-semibold transition ${
          active === 'workspace' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#6f716d] hover:text-[#111111]'
        }`}
      >
        Proof Workspace
      </button>
      <button
        type="button"
        onClick={() => onChange('export')}
        className={`rounded-[0.65rem] px-4 py-2 text-[14px] font-semibold transition ${
          active === 'export' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#6f716d] hover:text-[#111111]'
        }`}
      >
        Export Center
      </button>
    </div>
  )
}
