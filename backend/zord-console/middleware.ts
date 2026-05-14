import { NextRequest, NextResponse } from 'next/server'

function getLoginPath(pathname: string) {
  // /admin and /ops keep their dedicated login pages for now; everything customer-facing
  // funnels through the canonical /signin flow.
  if (pathname.startsWith('/admin')) return '/admin/login'
  if (pathname.startsWith('/ops')) return '/ops/login'
  if (pathname.startsWith('/payout-command-view')) return '/signin/tenant'
  if (pathname.startsWith('/sandbox')) return '/signin/tenant'
  return '/signin'
}

function loginRedirectUrl(request: NextRequest, pathname: string) {
  const path = getLoginPath(pathname)
  const url = new URL(path, request.url)
  // For the canonical /signin flow, preserve the original destination so we can
  // return the user there after a successful login.
  if (path === '/signin' || path === '/signin/tenant') {
    const next = `${pathname}${request.nextUrl.search || ''}`
    url.searchParams.set('next', next)
  }
  return url
}

function roleMatchesPath(pathname: string, role: string) {
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

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (
    pathname === '/signin' ||
    pathname === '/signin/tenant' ||
    pathname === '/signup' ||
    pathname === '/console/login' ||
    pathname === '/customer/login' ||
    pathname === '/ops/login' ||
    pathname === '/admin/login' ||
    pathname === '/app-final/login'
  ) {
    return NextResponse.next()
  }

  const hasAccessToken = Boolean(request.cookies.get('zord_access_token')?.value)
  const hasRefreshToken = Boolean(request.cookies.get('zord_refresh_token')?.value)
  if (!hasAccessToken && !hasRefreshToken) {
    return NextResponse.redirect(loginRedirectUrl(request, pathname))
  }

  const role = request.cookies.get('zord_role')?.value
  if (role && !roleMatchesPath(pathname, role)) {
    return NextResponse.redirect(loginRedirectUrl(request, pathname))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/console/:path*',
    '/customer/:path*',
    '/ops/:path*',
    '/admin/:path*',
    '/app-final/:path*',
    '/payout-command-view',
    '/payout-command-view/:path*',
    '/sandbox',
    '/sandbox/:path*',
  ],
}
