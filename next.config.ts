import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/tasks', destination: '/', permanent: false },
      { source: '/calendar', destination: '/', permanent: false },
      { source: '/autopilot', destination: '/', permanent: false },
      { source: '/money', destination: '/', permanent: false },
      { source: '/mentor', destination: '/', permanent: false },
      { source: '/vision', destination: '/', permanent: false },
    ]
  },
}

export default nextConfig
