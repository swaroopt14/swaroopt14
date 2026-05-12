import { CSSProperties, ReactNode } from 'react'
import { Navbar } from './Navbar'

interface DashboardLayoutProps {
  children: ReactNode
  mainClassName?: string
  pageStyle?: CSSProperties
}

export function DashboardLayout({ children, mainClassName = '', pageStyle }: DashboardLayoutProps) {
  return (
    <div
      className="min-h-screen bg-noise font-sans text-[#1C1F2E]"
      style={{
        backgroundColor: '#F0F2F5',
        backgroundImage:
          'radial-gradient(circle at 18% 10%, rgba(255,255,255,0.80), transparent 28%), radial-gradient(circle at 78% 8%, rgba(206,211,222,0.34), transparent 32%), radial-gradient(circle at 82% 72%, rgba(227,230,236,0.42), transparent 28%)',
        ...pageStyle,
      }}
    >
      <Navbar />
      <main className={`w-full px-6 py-6 md:px-8 max-w-[1600px] mx-auto ${mainClassName}`}>{children}</main>
    </div>
  )
}
