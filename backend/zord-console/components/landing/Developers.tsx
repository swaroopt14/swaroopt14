'use client'

const CODE_SNIPPET = `// 1. Initialize Zord Client
const zord = new ZordClient(process.env.ZORD_SECRET_KEY);

// 2. Create a payout intent
const payout = await zord.payouts.create({
  amount: 450000, // in smallest currency unit
  currency: 'INR',
  destination: {
    account_number: '000000000000',
    ifsc: 'HDFC0000001',
  },
  metadata: { order_id: 'ord_123' },
  routing_strategy: 'fastest_available',
});

// 3. Status handled via robust webhooks
console.log(payout.id); // pyt_89fca12b`

export function Developers() {
  return (
    <section className="relative py-32 px-6 md:px-12 mx-auto max-w-[1200px]">
      <div className="bg-[#05050A] rounded-[36px] border border-white/10 overflow-hidden relative shadow-[0_20px_80px_rgba(102,51,238,0.1)]">
        
        {/* Glow behind code block */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-zord-accent-500/10 blur-[100px] pointer-events-none rounded-full" />
        
        <div className="grid md:grid-cols-2 items-center">
          
          <div className="p-10 md:p-16 relative z-10">
            <div className="inline-flex items-center rounded-full bg-white/5 border border-white/10 px-4 py-2 text-[12px] uppercase tracking-[0.25em] text-white/50 mb-6 font-medium">
              Developer Experience
            </div>
            <h2 className="text-[36px] md:text-[46px] font-semibold tracking-[-0.04em] text-white leading-[1.1] mb-6">
              A single, <span className="text-transparent bg-clip-text bg-gradient-to-r from-zord-accent-300 to-zord-accent-500">beautiful API.</span>
            </h2>
            <p className="text-[17px] text-white/60 leading-relaxed mb-8">
              Integrate in an afternoon. No more juggling fragmented banking APIs, SOAP XML, or undocumented bank portals. Provide one payload, and we handle the complexity underneath.
            </p>
            
            <div className="flex gap-4">
              <a href="#" className="inline-flex items-center text-[14px] font-medium text-white hover:text-zord-accent-300 transition-colors">
                Read the Docs
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </a>
              <a href="#" className="inline-flex items-center text-[14px] font-medium text-white/50 hover:text-white transition-colors">
                API Reference
              </a>
            </div>
          </div>

          <div className="h-full relative border-l border-white/5 bg-[#030305]/50 backdrop-blur-md">
            <div className="flex items-center px-4 py-3 border-b border-white/5 bg-white/5">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-white/20" />
                <div className="w-3 h-3 rounded-full bg-white/20" />
                <div className="w-3 h-3 rounded-full bg-white/20" />
              </div>
              <div className="mx-auto text-[11px] font-[family:var(--font-zord-mono)] text-white/40 tracking-widest uppercase">
                create_payout.ts
              </div>
            </div>
            <div className="p-6 md:p-8 overflow-x-auto">
              <pre className="font-[family:var(--font-zord-mono)] text-[13px] md:text-[14px] leading-[1.7] text-white/70">
                <code>{CODE_SNIPPET}</code>
              </pre>
            </div>
          </div>
          
        </div>
      </div>
    </section>
  )
}
