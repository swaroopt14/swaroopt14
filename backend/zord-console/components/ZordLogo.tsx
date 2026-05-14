'use client'

interface ZordLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'hero'
  className?: string
  variant?: 'light' | 'dark'
  /** Max nav height (h-11); full wordmark visible, left-aligned. */
  fitToHeight?: boolean
}

/** Inline wordmark — avoids Next/Image and missing raster assets under `public/sources/`. */
function Wordmark({ className }: { className: string }) {
  return (
    <span className={`font-bold tracking-[-0.04em] ${className}`} aria-hidden>
      Zord
    </span>
  )
}

export function ZordLogo({ size = 'md', className = '', variant = 'dark', fitToHeight }: ZordLogoProps) {
  const textClass = variant === 'dark' ? 'text-white' : 'text-neutral-900'
  const sizeClass = fitToHeight
    ? 'text-[1.35rem] sm:text-[1.45rem]'
    : size === 'sm'
      ? 'text-[1.05rem]'
      : size === 'md'
        ? 'text-[1.2rem] sm:text-[1.28rem]'
        : size === 'lg'
          ? 'text-[1.45rem] sm:text-[1.55rem]'
          : 'text-[1.65rem] sm:text-[2rem] lg:text-[2.35rem]'

  if (fitToHeight) {
    return (
      <div className={`flex h-14 w-auto shrink-0 items-center justify-start ${className}`} aria-label="Arealis Zord">
        <Wordmark className={`${textClass} ${sizeClass}`} />
      </div>
    )
  }

  const containerClass =
    size === 'sm'
      ? 'w-[136px]'
      : size === 'md'
        ? 'w-[176px]'
        : size === 'lg'
          ? 'w-[236px]'
          : 'w-[220px] sm:w-[300px] lg:w-[408px]'

  return (
    <div className={`flex items-center ${containerClass} ${className}`} aria-label="Arealis Zord">
      <Wordmark className={`${textClass} ${sizeClass}`} />
    </div>
  )
}
