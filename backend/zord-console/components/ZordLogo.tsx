import Image from 'next/image'

interface ZordLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'hero'
  className?: string
  variant?: 'light' | 'dark'
  /** Max nav height (h-11); full wordmark visible, left-aligned. */
  fitToHeight?: boolean
}

export function ZordLogo({ size = 'md', className = '', variant = 'dark', fitToHeight }: ZordLogoProps) {
  const imageClassName = variant === 'dark' ? 'brightness-0 invert' : ''

  if (fitToHeight) {
    return (
      <div className={`flex h-14 w-auto shrink-0 items-center justify-start ${className}`}>
        <Image
          src="/sources/logo_company-removebg-preview.png"
          alt="Arealis Zord"
          width={640}
          height={160}
          className={`${imageClassName} h-14 w-auto max-h-14 object-contain object-left`}
          priority
        />
      </div>
    )
  }

  const sizeConfig = {
    sm: { width: 136, height: 34, containerClassName: 'w-[136px]' },
    md: { width: 176, height: 44, containerClassName: 'w-[176px]' },
    lg: { width: 236, height: 59, containerClassName: 'w-[236px]' },
    hero: { width: 408, height: 102, containerClassName: 'w-[220px] sm:w-[300px] lg:w-[408px]' },
  }

  const currentSize = sizeConfig[size]

  return (
    <div className={`flex items-center ${currentSize.containerClassName} ${className}`}>
      <Image
        src="/sources/logo_company-removebg-preview.png"
        alt="Arealis Zord"
        width={currentSize.width}
        height={currentSize.height}
        className={`${imageClassName} h-auto w-full`}
        priority={size === 'lg' || size === 'hero'}
      />
    </div>
  )
}
