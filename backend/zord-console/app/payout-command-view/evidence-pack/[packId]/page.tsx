import { DASHBOARD_FONT_STACK } from '@/services/payout-command/model'
import { MerkleGraphSurface } from '../../today/_components/surfaces/MerkleGraphSurface'

export default function EvidencePackPage() {
  return (
    <main
      className="min-h-screen bg-[#f5f5f5] text-[15px] leading-[1.55] antialiased"
      style={{ fontFamily: DASHBOARD_FONT_STACK }}
    >
      <div className="mx-auto max-w-[1400px] px-3 py-5 sm:px-4 lg:px-5">
        <MerkleGraphSurface />
      </div>
    </main>
  )
}
