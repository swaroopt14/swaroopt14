import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SolutionDetailClient } from '@/components/landing-final/SolutionDetailClient'
import { getSolutionBySlug, solutionEntries } from '@/components/landing-final/solutions-data'

export function generateStaticParams() {
  return solutionEntries.map((solution) => ({ slug: solution.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const solution = getSolutionBySlug(params.slug)

  if (!solution) {
    return {
      title: 'Solution not found | ZORD',
    }
  }

  return {
    title: `${solution.title} | ZORD Solutions`,
    description: solution.description,
  }
}

export default function SolutionPage({ params }: { params: { slug: string } }) {
  const solution = getSolutionBySlug(params.slug)

  if (!solution) {
    notFound()
  }

  return <SolutionDetailClient solution={solution} />
}
