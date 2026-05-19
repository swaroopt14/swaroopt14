import { redirect } from 'next/navigation'

/** Legacy entry — canonical home is `/`. */
export default function LandingPageFinal() {
  redirect('/')
}
