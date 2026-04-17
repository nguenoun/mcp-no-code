import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Quick start',
}

export default function GettingStartedPage() {
  return (
    <div className="space-y-10">
      <div className="space-y-3 pb-6 border-b">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Getting started</p>
        <h1 className="text-3xl font-bold tracking-tight">Quick start</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Deploy your first MCP server in under 5 minutes.
        </p>
      </div>

      {/* Prerequisites */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Prerequisites</h2>
        <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside pl-2">
          <li>A free MCPBuilder account (<Link href="/register" className="text-primary underline underline-offset-4">sign up here</Link>)</li>
          <li>An API you want to expose (OpenAPI spec URL, or any HTTP endpoint)</li>
          <li>Claude Desktop or access to the Anthropic API (to test your server)</li>
        </ul>
      </section>

      {/* Step 1 */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shrink-0">1</div>
          <h2 className="text-xl font-semibold">Create a new server</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          After logging in, go to <strong className="text-foreground">Serveurs</strong> in the sidebar and click{' '}
          <strong className="text-foreground">Nouveau serveur</strong>.
          You&apos;ll be presented with three options:
        </p>
        <div className="grid gap-3">
          {[
            {
              title: 'Import OpenAPI',
              description: 'Provide a URL, upload a file, or paste JSON/YAML. MCPBuilder will detect all endpoints and generate tools automatically.',
            },
            {
              title: 'Create manually',
              description: 'Add tools one by one. For each tool, specify the HTTP method, URL, name, and a description for the AI.',
            },
            {
              title: 'Use a template',
              description: 'Start from a pre-built integration (Stripe, GitHub, Notion, etc.). Tools are pre-configured and ready to use.',
            },
          ].map(({ title, description }) => (
            <div key={title} className="rounded-lg border p-4 space-y-1">
              <p className="font-semibold text-sm">{title}</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Step 2 */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shrink-0">2</div>
          <h2 className="text-xl font-semibold">Configure tools and deploy</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          After selecting your source, review the generated tools. You can rename them, edit their description,
          and toggle individual tools on or off.
        </p>
        <p className="text-sm text-muted-foreground">
          On the final step, choose a <strong className="text-foreground">deployment mode</strong>:
        </p>
        <div className="grid gap-3">
          <div className="rounded-lg border p-4 space-y-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">☁️ Cloudflare Workers (recommended)</p>
              <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">Recommended</span>
            </div>
            <p className="text-sm text-muted-foreground">Deployed globally on Cloudflare&apos;s edge network. Available instantly, scales automatically, low latency.</p>
          </div>
          <div className="rounded-lg border p-4 space-y-1">
            <p className="font-semibold text-sm">💻 Local</p>
            <p className="text-sm text-muted-foreground">Runs as a process on MCPBuilder servers. For development and testing.</p>
          </div>
        </div>
      </section>

      {/* Step 3 */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shrink-0">3</div>
          <h2 className="text-xl font-semibold">Get your MCP endpoint</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          After deployment, open your server&apos;s detail page. In the{' '}
          <strong className="text-foreground">Connexion</strong> tab you&apos;ll find:
        </p>
        <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside pl-2">
          <li>Your MCP endpoint URL (SSE)</li>
          <li>Your API key for authentication</li>
          <li>Copy-ready Claude Desktop configuration</li>
        </ul>
      </section>

      {/* Step 4 */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shrink-0">4</div>
          <h2 className="text-xl font-semibold">Connect to Claude Desktop</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Edit your Claude Desktop config file at{' '}
          <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">~/Library/Application Support/Claude/claude_desktop_config.json</code>{' '}
          (macOS) and add your server:
        </p>
        <div className="rounded-xl border bg-zinc-950 overflow-hidden">
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-zinc-800">
            <span className="text-xs text-zinc-500 font-mono">claude_desktop_config.json</span>
          </div>
          <pre className="px-5 py-4 text-xs font-mono text-zinc-300 overflow-auto leading-relaxed">
{`{
  "mcpServers": {
    "my-server": {
      "url": "https://YOUR_ENDPOINT/mcp/SERVER_ID/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}
          </pre>
        </div>
        <p className="text-sm text-muted-foreground">
          Restart Claude Desktop after saving. Your tools will appear in the{' '}
          <strong className="text-foreground">Tools</strong> section when starting a new conversation.
        </p>
      </section>

      {/* Next steps */}
      <section className="space-y-4 pt-4 border-t">
        <h2 className="text-xl font-semibold">Next steps</h2>
        <div className="grid gap-3">
          <Link href="/docs/features/credentials" className="flex items-center justify-between rounded-lg border p-4 hover:border-primary/50 transition-colors group">
            <div>
              <p className="font-semibold text-sm group-hover:text-primary transition-colors">Add credentials</p>
              <p className="text-sm text-muted-foreground">Authenticate your tools with API keys and bearer tokens.</p>
            </div>
            <span className="text-muted-foreground group-hover:text-primary transition-colors">→</span>
          </Link>
          <Link href="/docs/deployment/cloudflare" className="flex items-center justify-between rounded-lg border p-4 hover:border-primary/50 transition-colors group">
            <div>
              <p className="font-semibold text-sm group-hover:text-primary transition-colors">Configure Cloudflare</p>
              <p className="text-sm text-muted-foreground">Set up your own Cloudflare account for custom deployment.</p>
            </div>
            <span className="text-muted-foreground group-hover:text-primary transition-colors">→</span>
          </Link>
          <Link href="/docs/integration/claude-api" className="flex items-center justify-between rounded-lg border p-4 hover:border-primary/50 transition-colors group">
            <div>
              <p className="font-semibold text-sm group-hover:text-primary transition-colors">Use with Claude API</p>
              <p className="text-sm text-muted-foreground">Integrate your MCP server with the Anthropic API programmatically.</p>
            </div>
            <span className="text-muted-foreground group-hover:text-primary transition-colors">→</span>
          </Link>
        </div>
      </section>
    </div>
  )
}
