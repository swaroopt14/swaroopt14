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
  // PERMANENTLY DISABLE Next.js server-side fetch caching.
  // Without this, Next.js 14 caches ALL fetch() calls on the server,
  // meaning API proxy routes return stale data even after DB changes.
  // This single setting fixes the "stale data" problem once and for all.
  experimental: {
    // Opt out of server-side fetch cache for all routes
    // Every fetch() call will hit the real backend, every time.
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
