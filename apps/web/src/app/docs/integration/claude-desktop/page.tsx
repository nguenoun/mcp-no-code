import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Claude Desktop integration',
}

export default function ClaudeDesktopPage() {
  return (
    <div className="space-y-10">
      <div className="space-y-3 pb-6 border-b">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Integration</p>
        <h1 className="text-3xl font-bold tracking-tight">Claude Desktop</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Connect your MCP server to Claude Desktop and use your tools in natural language.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. Get your endpoint details</h2>
        <p className="text-sm text-muted-foreground">
          In MCPBuilder, open your server and go to the <strong className="text-foreground">Connexion</strong> tab.
          Copy the <strong className="text-foreground">MCP Endpoint URL</strong> and your{' '}
          <strong className="text-foreground">API Key</strong>.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">2. Edit claude_desktop_config.json</h2>
        <p className="text-sm text-muted-foreground">
          Open the Claude Desktop configuration file:
        </p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="rounded-lg bg-muted/50 border px-4 py-2.5 font-mono text-xs">
            <p className="text-muted-foreground mb-0.5">macOS</p>
            ~/Library/Application Support/Claude/claude_desktop_config.json
          </div>
          <div className="rounded-lg bg-muted/50 border px-4 py-2.5 font-mono text-xs">
            <p className="text-muted-foreground mb-0.5">Windows</p>
            %APPDATA%\Claude\claude_desktop_config.json
          </div>
        </div>

        <p className="text-sm text-muted-foreground">Add your server under <code className="font-mono text-xs bg-muted px-1 rounded">mcpServers</code>:</p>

        <div className="rounded-xl border bg-zinc-950 overflow-hidden">
          <div className="flex items-center px-4 py-2.5 border-b border-zinc-800">
            <span className="text-xs text-zinc-500 font-mono">claude_desktop_config.json</span>
          </div>
          <pre className="px-5 py-4 text-xs font-mono text-zinc-300 overflow-auto leading-relaxed">
{`{
  "mcpServers": {
    "my-stripe-server": {
      "url": "https://mcp-abc123.workers.dev/mcp/SERVER_ID/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer mcp_YOUR_API_KEY"
      }
    }
  }
}`}
          </pre>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">3. Restart Claude Desktop</h2>
        <p className="text-sm text-muted-foreground">
          Fully quit and relaunch Claude Desktop. Start a new conversation —
          you&apos;ll see a hammer icon indicating tools are available.
          Click it to see the list of tools your server exposes.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Troubleshooting</h2>
        <div className="space-y-3">
          {[
            {
              issue: 'Tools are not showing up',
              fix: 'Check that Claude Desktop was fully restarted (not just the window). Verify the config file is valid JSON with no trailing commas.',
            },
            {
              issue: 'Connection error / server not running',
              fix: 'Verify your server is running (green "Actif" badge on the server detail page). For Cloudflare Workers, the endpoint should always be available.',
            },
            {
              issue: 'Authentication failed',
              fix: 'Double-check that the Authorization header uses the exact API key shown in the Connexion tab. Keys are case-sensitive.',
            },
          ].map(({ issue, fix }) => (
            <div key={issue} className="rounded-lg border p-4 space-y-1">
              <p className="font-semibold text-sm">{issue}</p>
              <p className="text-sm text-muted-foreground">{fix}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
