import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: false,

  // Ensure ws is bundled in standalone output (used by instrumentation.ts)
  serverExternalPackages: ['ws'],

  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ]
  },
}

export default nextConfig
