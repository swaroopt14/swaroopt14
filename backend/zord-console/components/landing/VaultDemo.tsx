'use client'

import { useState, useEffect } from 'react'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()'

interface VaultDemoProps {
  originalText: string
  label: string
}

export function VaultDemo({ originalText, label }: VaultDemoProps) {
  const [isRevealed, setIsRevealed] = useState(false)
  const [displayText, setDisplayText] = useState('tok_zrd_********')
  const [tokenized, setTokenized] = useState('tok_zrd_********')

  useEffect(() => {
    // Generate the random token string only on the client after hydration
    const randomToken = 'tok_zrd_' + [...Array(8)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')
    setDisplayText(randomToken)
    setTokenized(randomToken)
  }, [])

  useEffect(() => {
    let iteration = 0
    let interval: NodeJS.Timeout

    const targetText = isRevealed ? originalText : tokenized

    clearInterval(interval!)
    
    interval = setInterval(() => {
      setDisplayText((currentText) => {
        return targetText
          .split('')
          .map((letter, index) => {
            if (index < iteration) {
              return targetText[index]
            }
            return LETTERS[Math.floor(Math.random() * 26)]
          })
          .join('')
      })

      if (iteration >= targetText.length) {
        clearInterval(interval)
      }

      iteration += 1 / 2 // Control speed
    }, 30)

    return () => clearInterval(interval)
  }, [isRevealed, originalText, tokenized])

  return (
    <div 
      className="group relative flex cursor-pointer flex-col w-full rounded-xl border border-white/5 bg-[#0f0f15] p-3 shadow-inner hover:border-zord-accent-500/30 hover:bg-[#12121a] transition-all duration-300"
      onMouseEnter={() => setIsRevealed(true)}
      onMouseLeave={() => setIsRevealed(false)}
    >
      <div className="absolute inset-0 rounded-xl bg-zord-accent-500/5 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
      <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40 group-hover:text-zord-accent-400/80 transition-colors">
        {label}
      </span>
      <span className="font-[family:var(--font-zord-mono)] text-sm tracking-widest text-[#93c5fd] group-hover:text-white transition-colors">
        {displayText}
      </span>
      <div className="absolute right-3 top-3 rounded bg-white/5 px-1.5 py-0.5 text-[9px] uppercase text-white/30 group-hover:bg-zord-accent-500/20 group-hover:text-zord-accent-200">
        {isRevealed ? 'Decrypted' : 'Tokenized'}
      </div>
    </div>
  )
}
