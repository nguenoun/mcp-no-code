import Link from 'next/link'
import { ArrowRight, Zap, Globe, FileJson, Shield } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Documentation',
}

const QUICK_LINKS = [
  {
    href: '/docs/getting-started',
    icon: Zap,
    title: 'Quick start',
    description: 'Deploy your first MCP server in under 5 minutes.',
  },
  {
    href: '/docs/features/openapi-import',
    icon: FileJson,
    title: 'OpenAPI import',
    description: 'Turn any OpenAPI spec into MCP tools automatically.',
  },
  {
    href: '/docs/deployment/cloudflare',
    icon: Globe,
    title: 'Cloudflare deployment',
    description: 'Deploy globally on Cloudflare Workers Edge network.',
  },
  {
    href: '/docs/integration/claude-desktop',
    icon: Shield,
    title: 'Connect to Claude',
    description: 'Configure Claude Desktop or the Anthropic API.',
  },
]

export default function DocsHomePage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-3 pb-6 border-b">
        <h1 className="text-3xl font-bold tracking-tight">MCPBuilder Documentation</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Everything you need to build, deploy, and connect MCP servers to AI assistants.
          No code required.
        </p>
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-xl font-semibold mb-5">Start here</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {QUICK_LINKS.map(({ href, icon: Icon, title, description }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-start gap-4 rounded-lg border p-5 hover:border-primary/50 hover:bg-muted/30 transition-all"
            >
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-sm group-hover:text-primary transition-colors">
                  {title}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* What is MCPBuilder */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">What is MCPBuilder?</h2>
        <div className="prose prose-sm text-muted-foreground space-y-3">
          <p>
            MCPBuilder is a no-code platform for building and hosting{' '}
            <strong className="text-foreground">MCP (Model Context Protocol) servers</strong>.
            MCP is an open protocol that lets AI assistants like Claude call external tools and APIs.
          </p>
          <p>
            With MCPBuilder, you can:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Import any OpenAPI spec and generate MCP tools automatically</li>
            <li>Build tools manually with HTTP method, URL, and description</li>
            <li>Deploy to Cloudflare Workers Edge for global low-latency access</li>
            <li>Connect securely to Claude Desktop, the Anthropic API, or any MCP client</li>
            <li>Monitor usage with real-time logs and analytics</li>
          </ul>
          <p>
            No Dockerfile, no deployment scripts, no infrastructure expertise required.
          </p>
        </div>
      </div>

      {/* Core concepts */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Core concepts</h2>
        <div className="space-y-4">
          {[
            {
              term: 'MCP Server',
              definition:
                'A hosted service that exposes tools to AI assistants. Each server has a unique endpoint URL and an API key for authentication.',
            },
            {
              term: 'Tool',
              definition:
                'A single operation your AI can perform — backed by an HTTP endpoint. Defined by a name, description, HTTP method, and URL.',
            },
            {
              term: 'Credential',
              definition:
                'An API key or bearer token stored encrypted in your workspace. Attached to a server so tools can authenticate with external APIs.',
            },
            {
              term: 'Runtime',
              definition:
                'Where your MCP server runs. Cloudflare Workers (Edge) for production, or Local (server process) for development.',
            },
          ].map(({ term, definition }) => (
            <div key={term} className="rounded-lg border p-4">
              <dt className="font-semibold text-sm">{term}</dt>
              <dd className="text-sm text-muted-foreground mt-1">{definition}</dd>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-xl border bg-muted/30 p-6 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-sm">Ready to build?</p>
          <p className="text-sm text-muted-foreground mt-0.5">Follow the quick start guide to deploy your first server.</p>
        </div>
        <Link
          href="/docs/getting-started"
          className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Quick start <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
