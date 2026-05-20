import { DM_Sans } from 'next/font/google'

/** DM Sans for Intent / Settlement journal surfaces (batch overview + tables). */
export const journalDmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const JOURNAL_DM_SANS = journalDmSans.className
