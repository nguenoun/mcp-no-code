import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowRight,
  Zap,
  Globe,
  Shield,
  BarChart3,
  Code2,
  FileJson,
  Layers,
  Clock,
  CheckCircle,
} from 'lucide-react'

// ─── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border bg-card p-6 space-y-3 hover:shadow-sm transition-shadow">
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="font-semibold text-sm">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({
  number,
  title,
  description,
}: {
  number: number
  title: string
  description: string
}) {
  return (
    <div className="flex gap-5">
      <div className="flex-shrink-0 h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
        {number}
      </div>
      <div className="space-y-1 pt-1">
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

// ─── Landing page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/30 border-b">
        {/* Decorative grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0)',
            backgroundSize: '28px 28px',
            opacity: 0.4,
          }}
        />
        <div className="relative container max-w-6xl mx-auto px-4 py-24 md:py-36 text-center space-y-8">
          <Badge variant="secondary" className="gap-1.5 text-xs font-medium px-3 py-1">
            <Zap className="h-3 w-3" />
            Deploy MCP servers in minutes, not days
          </Badge>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl mx-auto leading-[1.1]">
            Build and deploy{' '}
            <span className="text-primary">MCP servers</span>{' '}
            without writing code
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Connect any API to Claude, GPT-4, and other AI assistants in minutes.
            Import an OpenAPI spec or build tools manually — then deploy globally on Cloudflare Edge.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button size="lg" asChild className="gap-2">
              <Link href="/register">
                Get started free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/docs">View documentation</Link>
            </Button>
          </div>

          {/* Terminal preview */}
          <div className="mx-auto max-w-2xl mt-12 rounded-xl border bg-zinc-950 text-left overflow-hidden shadow-2xl">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-zinc-800">
              <span className="h-3 w-3 rounded-full bg-red-500/80" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
              <span className="h-3 w-3 rounded-full bg-green-500/80" />
              <span className="ml-3 text-xs text-zinc-500 font-mono">MCP Endpoint — Stripe API</span>
            </div>
            <div className="px-5 py-4 font-mono text-xs space-y-1.5 text-zinc-300">
              <p><span className="text-emerald-400">✓</span> <span className="text-zinc-500">tool</span> create_payment_intent</p>
              <p><span className="text-emerald-400">✓</span> <span className="text-zinc-500">tool</span> list_customers</p>
              <p><span className="text-emerald-400">✓</span> <span className="text-zinc-500">tool</span> get_subscription</p>
              <p><span className="text-emerald-400">✓</span> <span className="text-zinc-500">tool</span> update_invoice</p>
              <p className="pt-1 text-zinc-500">Deployed on Cloudflare Edge  ·  4 tools  ·  latency 23ms</p>
              <p className="text-primary/80">https://mcp-stripe.wesype.workers.dev/mcp</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Logos / social proof ─────────────────────────────────────────────────── */}
      <section className="border-b py-10 bg-muted/20">
        <div className="container max-w-6xl mx-auto px-4 text-center space-y-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Works with any API — already used to connect
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {['Stripe', 'GitHub', 'Notion', 'Slack', 'Linear', 'Shopify', 'Twilio', 'Airtable'].map(
              (name) => (
                <span key={name} className="text-sm font-semibold text-muted-foreground/60">
                  {name}
                </span>
              ),
            )}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 border-b">
        <div className="container max-w-6xl mx-auto px-4 space-y-12">
          <div className="text-center space-y-3 max-w-xl mx-auto">
            <h2 className="text-3xl font-bold tracking-tight">Everything you need to ship MCP servers</h2>
            <p className="text-muted-foreground">
              From import to production in minutes — no infrastructure expertise required.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon={FileJson}
              title="Import OpenAPI specs"
              description="Paste a URL, upload a file, or paste JSON/YAML. MCPBuilder parses your spec and generates MCP tools automatically."
            />
            <FeatureCard
              icon={Code2}
              title="Build tools manually"
              description="Create tools one by one by configuring HTTP method, URL, and a natural-language description for the AI."
            />
            <FeatureCard
              icon={Layers}
              title="Template library"
              description="Get started instantly with pre-built integrations for Stripe, GitHub, Notion, Slack, and many more."
            />
            <FeatureCard
              icon={Globe}
              title="Cloudflare Edge deployment"
              description="Deploy your MCP server globally on Cloudflare Workers. Ultra-low latency from 300+ locations worldwide."
            />
            <FeatureCard
              icon={BarChart3}
              title="Real-time analytics"
              description="Monitor every tool call with status, latency, and error details. Powered by Cloudflare Analytics Engine."
            />
            <FeatureCard
              icon={Shield}
              title="Secure by default"
              description="Auto-generated API keys, encrypted credential storage, and per-server rate limiting out of the box."
            />
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 border-b bg-muted/20">
        <div className="container max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="space-y-10">
              <div className="space-y-3">
                <h2 className="text-3xl font-bold tracking-tight">
                  From API to AI tool in 3 steps
                </h2>
                <p className="text-muted-foreground">
                  No Dockerfile, no deployment pipeline, no infrastructure.
                  Just your API and a few clicks.
                </p>
              </div>

              <div className="space-y-8">
                <StepCard
                  number={1}
                  title="Import or build your tools"
                  description="Point MCPBuilder at your OpenAPI spec URL, or manually configure each tool with HTTP method, URL, and description."
                />
                <StepCard
                  number={2}
                  title="Configure and deploy"
                  description="Choose Cloudflare Edge for global production deployments, or Local for development. Optionally attach credentials for authenticated APIs."
                />
                <StepCard
                  number={3}
                  title="Connect to Claude"
                  description="Copy the generated MCP endpoint URL and paste it into Claude Desktop, the Anthropic API, or any MCP-compatible client."
                />
              </div>
            </div>

            {/* Config snippet */}
            <div className="rounded-xl border bg-zinc-950 overflow-hidden shadow-xl">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-zinc-800">
                <span className="h-3 w-3 rounded-full bg-red-500/80" />
                <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
                <span className="h-3 w-3 rounded-full bg-green-500/80" />
                <span className="ml-3 text-xs text-zinc-500 font-mono">claude_desktop_config.json</span>
              </div>
              <pre className="px-5 py-5 text-xs font-mono text-zinc-300 overflow-auto leading-relaxed">
{`{
  "mcpServers": {
    "stripe": {
      "url": "https://mcp-stripe-abc123
              .workers.dev/mcp",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="container max-w-6xl mx-auto px-4 text-center space-y-8">
          <div className="space-y-3 max-w-xl mx-auto">
            <h2 className="text-3xl font-bold tracking-tight">
              Start building today
            </h2>
            <p className="text-muted-foreground">
              Free for personal projects. No credit card required.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" asChild className="gap-2">
              <Link href="/register">
                Create your first MCP server
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/docs">Read the docs</Link>
            </Button>
          </div>

          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground pt-2">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              No credit card
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              Deploy in minutes
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-emerald-500" />
              Free forever for personal use
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
