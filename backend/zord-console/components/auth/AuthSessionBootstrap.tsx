'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { clearAuth, getCurrentUser, hasSessionHint, hydrateSession } from '@/services/auth'
import { UserRole } from '@/types/auth'

function getLoginRoute(pathname: string, searchSuffix: string) {
  const q = searchSuffix.startsWith('?') ? searchSuffix : searchSuffix ? `?${searchSuffix}` : ''
  if (pathname.startsWith('/payout-command-view')) {
    return `/console/login?next=${encodeURIComponent(pathname + q)}`
  }
  if (pathname.startsWith('/admin')) return '/admin/login'
  if (pathname.startsWith('/ops')) return '/ops/login'
  if (pathname.startsWith('/customer')) return '/customer/login'
  if (pathname.startsWith('/app-final')) return '/app-final/login'
  return '/console/login'
}

function isProtectedPath(pathname: string) {
  return (
    pathname.startsWith('/console') ||
    pathname.startsWith('/customer') ||
    pathname.startsWith('/ops') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/app-final') ||
    pathname.startsWith('/payout-command-view')
  )
}

function isLoginPath(pathname: string) {
  return pathname === '/console/login' || pathname === '/customer/login' || pathname === '/ops/login' || pathname === '/admin/login' || pathname === '/app-final/login'
}

function roleMatchesPath(pathname: string, role: UserRole) {
  if (pathname.startsWith('/admin')) return role === 'ADMIN'
  if (pathname.startsWith('/ops')) return role === 'OPS'
  if (
    pathname.startsWith('/customer') ||
    pathname.startsWith('/console') ||
    pathname.startsWith('/app-final') ||
    pathname.startsWith('/payout-command-view')
  ) {
    return role === 'CUSTOMER_USER' || role === 'CUSTOMER_ADMIN'
  }
  return true
}

export function AuthSessionBootstrap() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!pathname || isLoginPath(pathname) || !isProtectedPath(pathname)) {
      return
    }

    const searchSuffix = typeof window !== 'undefined' ? window.location.search : ''

    // The hint cookie prevents immediate false redirects on hard refresh while
    // the real session is still being revalidated through /api/auth/me.
    if (!hasSessionHint() && !getCurrentUser()) {
      clearAuth()
      router.replace(getLoginRoute(pathname, searchSuffix))
      return
    }

    let cancelled = false

    void hydrateSession().then((user) => {
      if (cancelled) return

      if (!user) {
        router.replace(getLoginRoute(pathname, searchSuffix))
        return
      }

      if (!roleMatchesPath(pathname, user.role)) {
        clearAuth()
        router.replace(getLoginRoute(pathname, searchSuffix))
      }
    })

    return () => {
      cancelled = true
    }
  }, [pathname, router])

  return null
}
