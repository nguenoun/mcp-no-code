/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@mcpbuilder/shared'],

  // ── Subdomain rewrites for production ───────────────────────────────────────
  //
  // In production, the middleware handles subdomain routing at the edge.
  // These rewrites act as a fallback for Vercel / self-hosted deployments.
  //
  // Development: access /app/* and /docs/* directly (no subdomain needed).
  // Production:  app.domain.com → /app/*,  docs.domain.com → /docs/*
  //
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    }
  },
}

export default nextConfig
