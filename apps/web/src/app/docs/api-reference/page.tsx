import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'API reference',
}

const endpoints = [
  {
    method: 'GET',
    path: '/mcp/:serverId/sse',
    description: 'Establish an SSE connection to the MCP server. Used by Claude Desktop and MCP clients.',
    auth: 'Bearer token (API key)',
  },
  {
    method: 'POST',
    path: '/mcp/:serverId/messages',
    description: 'Send an MCP protocol message (initialize, tools/list, tools/call, etc.).',
    auth: 'Bearer token (API key)',
  },
  {
    method: 'GET',
    path: '/api/v1/workspaces/:workspaceId/servers',
    description: 'List all MCP servers in a workspace.',
    auth: 'Session cookie',
  },
  {
    method: 'POST',
    path: '/api/v1/workspaces/:workspaceId/servers',
    description: 'Create a new MCP server.',
    auth: 'Session cookie',
  },
  {
    method: 'PUT',
    path: '/api/v1/servers/:serverId',
    description: 'Update server name, description, or credential.',
    auth: 'Session cookie',
  },
  {
    method: 'DELETE',
    path: '/api/v1/servers/:serverId',
    description: 'Delete a server and all its tools. Deprovisions the Cloudflare Worker.',
    auth: 'Session cookie',
  },
  {
    method: 'POST',
    path: '/api/v1/servers/:serverId/restart',
    description: 'Restart a local runtime server, or redeploy a Cloudflare Worker.',
    auth: 'Session cookie',
  },
  {
    method: 'POST',
    path: '/api/v1/servers/:serverId/rotate-key',
    description: 'Rotate the API key for an MCP server.',
    auth: 'Session cookie',
  },
  {
    method: 'GET',
    path: '/api/v1/servers/:serverId/tools',
    description: 'List all tools configured on a server.',
    auth: 'Session cookie',
  },
  {
    method: 'POST',
    path: '/api/v1/servers/:serverId/tools',
    description: 'Add a new tool to a server.',
    auth: 'Session cookie',
  },
  {
    method: 'PUT',
    path: '/api/v1/servers/:serverId/tools/:toolId',
    description: 'Update a tool definition.',
    auth: 'Session cookie',
  },
  {
    method: 'DELETE',
    path: '/api/v1/servers/:serverId/tools/:toolId',
    description: 'Remove a tool from a server.',
    auth: 'Session cookie',
  },
]

const methodColors: Record<string, string> = {
  GET: 'bg-blue-500/10 text-blue-600 border-blue-200',
  POST: 'bg-green-500/10 text-green-600 border-green-200',
  PUT: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
  DELETE: 'bg-red-500/10 text-red-600 border-red-200',
  PATCH: 'bg-purple-500/10 text-purple-600 border-purple-200',
}

export default function ApiReferencePage() {
  return (
    <div className="space-y-10">
      <div className="space-y-3 pb-6 border-b">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Integration</p>
        <h1 className="text-3xl font-bold tracking-tight">API reference</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          HTTP endpoints exposed by the MCPBuilder API.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Authentication</h2>
        <div className="text-sm text-muted-foreground space-y-3">
          <p>
            MCPBuilder exposes two categories of endpoints with different auth requirements:
          </p>
          <ul className="list-disc list-inside space-y-2 pl-2">
            <li>
              <strong className="text-foreground">MCP proxy routes</strong>{' '}
              (<code className="font-mono text-xs bg-muted px-1 rounded">/mcp/*</code>) — use an{' '}
              <code className="font-mono text-xs bg-muted px-1 rounded">Authorization: Bearer YOUR_API_KEY</code>{' '}
              header. The API key is shown in your server&apos;s Connexion tab.
            </li>
            <li>
              <strong className="text-foreground">Management API</strong>{' '}
              (<code className="font-mono text-xs bg-muted px-1 rounded">/api/v1/*</code>) — use a session
              cookie obtained by logging in via{' '}
              <code className="font-mono text-xs bg-muted px-1 rounded">POST /api/v1/auth/login</code>.
            </li>
          </ul>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Base URL</h2>
        <div className="rounded-lg bg-muted/50 border px-4 py-3 font-mono text-sm">
          https://api.mcpbuilder.com
        </div>
        <p className="text-xs text-muted-foreground">
          In development: <code className="font-mono bg-muted px-1 rounded">http://localhost:4000</code>
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Endpoints</h2>
        <div className="space-y-3">
          {endpoints.map((ep, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${methodColors[ep.method] ?? 'bg-muted text-foreground border-border'}`}
                >
                  {ep.method}
                </span>
                <code className="text-sm font-mono">{ep.path}</code>
              </div>
              <p className="text-sm text-muted-foreground">{ep.description}</p>
              <p className="text-xs text-muted-foreground">
                Auth: <span className="text-foreground">{ep.auth}</span>
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
