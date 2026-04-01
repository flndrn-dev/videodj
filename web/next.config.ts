import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow Next.js to serve from the Electron renderer process
  // and from a standard web server without changes
  output: 'standalone',

  // Disable strict mode to avoid double-mounting effects in Electron
  reactStrictMode: false,

  // Allow cross-origin requests from the Electron renderer
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
