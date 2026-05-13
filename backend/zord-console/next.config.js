/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Warning: This allows production builds to successfully complete even if
    // your project has TypeScript errors.
    ignoreBuildErrors: true,
  },
  // Server fetch cache: opt out per-request via `cache: 'no-store'` on fetches and
  // `Cache-Control` on Route Handlers — there is no global "disable all fetch cache" flag here.
  experimental: {},
  // Auth-guarded HTML must not be stored by shared CDNs (stale shell / wrong session after deploy).
  async headers() {
    const privateHtml = [
      '/payout-command-view',
      '/payout-command-view/:path*',
      '/console/:path*',
      '/customer/:path*',
      '/ops/:path*',
      '/admin/:path*',
      '/app-final/:path*',
    ]
    const cacheHeaders = [
      { key: 'Cache-Control', value: 'private, no-cache, no-store, max-age=0, must-revalidate' },
      { key: 'Vary', value: 'Cookie' },
    ]
    return privateHtml.map((source) => ({ source, headers: cacheHeaders }))
  },
  // Mutate resolve.alias in place — replacing the whole object can drop Next.js
  // internal aliases and cause "Cannot find the middleware module" at runtime.
  webpack: (config) => {
    const alias = config.resolve.alias ?? {}
    config.resolve.alias = alias
    alias['@/constants'] = path.resolve(__dirname, 'constants')
    alias['@/components'] = path.resolve(__dirname, 'components')
    alias['@/types'] = path.resolve(__dirname, 'types')
    alias['@/utils'] = path.resolve(__dirname, 'utils')
    alias['@/services'] = path.resolve(__dirname, 'services')
    alias['@/config'] = path.resolve(__dirname, 'config')
    return config
  },
}

module.exports = nextConfig
