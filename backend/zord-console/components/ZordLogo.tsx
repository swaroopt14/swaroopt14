interface ZordLogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  variant?: 'light' | 'dark'
}

export function ZordLogo({ size = 'md', className = '', variant = 'dark' }: ZordLogoProps) {
  const sizeClasses = {
    sm: { icon: 'w-6 h-6', text: 'text-lg' },
    md: { icon: 'w-8 h-8', text: 'text-2xl' },
    lg: { icon: 'w-12 h-12', text: 'text-4xl' }
  }

  const currentSize = sizeClasses[size]

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      {/* Geometric Symbol - Abstract interconnected L-shaped figures forming an inverted A */}
      <svg
        className={currentSize.icon}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="0.5"/>
            <feOffset dx="0.5" dy="0.5" result="offsetblur"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.3"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        {/* Left L-shape - forms left side of inverted A */}
        <path
          d="M8 36L8 16L20 16"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#shadow)"
        />
        {/* Right L-shape - forms right side of inverted A */}
        <path
          d="M32 36L32 16L20 16"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#shadow)"
        />
      </svg>
      
      {/* Text */}
      <span className={`${currentSize.text} font-bold tracking-tight ${variant === 'dark' ? 'text-white' : 'text-gray-900'}`}>
        ZORD
      </span>
    </div>
  )
}
