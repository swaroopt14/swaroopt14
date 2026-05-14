'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { clearAuth, getCurrentUser, hasSessionHint, hydrateSession } from '@/services/auth'
import { UserRole } from '@/types/auth'

function getLoginRoute(pathname: string, searchSuffix: string) {
  const q = searchSuffix.startsWith('?') ? searchSuffix : searchSuffix ? `?${searchSuffix}` : ''
  if (pathname.startsWith('/payout-command-view')) {
    return `/signin/tenant?next=${encodeURIComponent(pathname + q)}`
  }
  if (pathname.startsWith('/sandbox')) {
    return `/signin?next=${encodeURIComponent(pathname + q)}`
  }
  if (pathname.startsWith('/admin')) return '/admin/login'
  if (pathname.startsWith('/ops')) return '/ops/login'
  if (pathname.startsWith('/customer')) return '/customer/login'
  if (pathname.startsWith('/app-final')) return '/app-final/login'
  return '/signin'
}

function isProtectedPath(pathname: string) {
  return (
    pathname.startsWith('/console') ||
    pathname.startsWith('/customer') ||
    pathname.startsWith('/ops') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/app-final') ||
    pathname.startsWith('/payout-command-view') ||
    pathname.startsWith('/sandbox')
  )
}

function isLoginPath(pathname: string) {
  return (
    pathname === '/signin' ||
    pathname === '/signin/tenant' ||
    pathname === '/signup' ||
    pathname === '/console/login' ||
    pathname === '/customer/login' ||
    pathname === '/ops/login' ||
    pathname === '/admin/login' ||
    pathname === '/app-final/login'
  )
}

function roleMatchesPath(pathname: string, role: UserRole) {
  if (pathname.startsWith('/admin')) return role === 'ADMIN'
  if (pathname.startsWith('/ops')) return role === 'OPS'
  if (
    pathname.startsWith('/customer') ||
    pathname.startsWith('/console') ||
    pathname.startsWith('/app-final') ||
    pathname.startsWith('/payout-command-view') ||
    pathname.startsWith('/sandbox')
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

    void hydrateSession()
      .then((user) => {
        if (cancelled) return

        if (!user) {
          // Distinguish "no session" (cleared in hydrateSession) from transient
          // network failure (fetch threw or aborted — auth not cleared).
          if (!hasSessionHint() && !getCurrentUser()) {
            router.replace(getLoginRoute(pathname, searchSuffix))
          }
          return
        }

        if (!roleMatchesPath(pathname, user.role)) {
          clearAuth()
          router.replace(getLoginRoute(pathname, searchSuffix))
        }
      })
      .catch(() => {
        /* hydrateSession is defensive; swallow stray rejections */
      })

    return () => {
      cancelled = true
    }
  }, [pathname, router])

  return null
}
