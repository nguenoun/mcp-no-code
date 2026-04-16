'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Copy, Check, RefreshCw, RotateCcw, Play,
  Loader2, AlertCircle, CheckCircle2, Clock, ChevronLeft, ChevronRight, Plus,
  Zap, Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToolCard } from '@/components/tool-editor/ToolCard'
import { ToolEditorModal } from '@/components/tool-editor/ToolEditorModal'
import { RedeployNotification } from '@/components/redeploy-notification/RedeployNotification'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useDefaultWorkspace } from '@/hooks/use-workspace'
import {
  useServerStatus,
  useRestartServer,
  useRotateApiKey,
  useTestTool,
  type ToolTestResult,
  type ServerWithMeta,
} from '@/hooks/use-servers'
import type { ApiResponse } from '@mcpbuilder/shared'
import {
  useTools,
  useCreateTool,
  useUpdateTool,
  useToggleTool,
  useDeleteTool,
} from '@/hooks/use-tools'
import { useLogs } from '@/hooks/use-logs'
import { cn } from '@/lib/utils'
import type { McpTool } from '@mcpbuilder/shared'
import type { ToolFormData } from '@/hooks/use-tools'

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = React.useState(false)

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-7 w-7', className)}
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'RUNNING') {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        Running
      </span>
    )
  }
  if (status === 'ERROR') {
    return <Badge variant="destructive">Error</Badge>
  }
  return <Badge variant="secondary">Stopped</Badge>
}

// ─── Tab: Tools ───────────────────────────────────────────────────────────────

function ToolsTab({
  serverId,
  onRedeployTriggered,
}: {
  serverId: string
  onRedeployTriggered?: () => void
}) {
  const [page, setPage] = React.useState(1)
  const [modalOpen, setModalOpen] = React.useState(false)
  const [editingTool, setEditingTool] = React.useState<McpTool | undefined>()

  const { data, isLoading } = useTools(serverId, page)
  const createTool = useCreateTool(serverId)
  // Pass empty string when no tool is being edited; the hook is disabled if toolId is ''
  const updateTool = useUpdateTool(serverId, editingTool?.id ?? '')
  const toggleTool = useToggleTool(serverId)
  const deleteTool = useDeleteTool(serverId)

  const handleOpenCreate = () => {
    setEditingTool(undefined)
    setModalOpen(true)
  }

  const handleOpenEdit = (tool: McpTool) => {
    setEditingTool(tool)
    setModalOpen(true)
  }

  const handleSave = async (formData: ToolFormData) => {
    let result: { redeployTriggered?: boolean }
    if (editingTool) {
      result = await updateTool.mutateAsync(formData)
    } else {
      result = await createTool.mutateAsync(formData)
    }
    setModalOpen(false)
    if (result.redeployTriggered) {
      onRedeployTriggered?.()
    }
  }

  const tools = data?.tools ?? []
  const pagination = data?.pagination

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {pagination ? `${pagination.total} tool${pagination.total !== 1 ? 's' : ''}` : ''}
        </p>
        <Button size="sm" onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Ajouter un tool
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border p-4 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      ) : tools.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <p className="font-medium text-sm">Aucun tool configuré</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Ajoutez votre premier tool pour que votre serveur MCP soit utilisable.
            </p>
            <Button size="sm" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un tool
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tools.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              onEdit={handleOpenEdit}
              onToggle={(toolId, isEnabled) => toggleTool.mutate({ toolId, isEnabled })}
              onDelete={(toolId, confirm) => deleteTool.mutate({ toolId, confirm })}
              isToggling={toggleTool.isPending}
              isDeleting={deleteTool.isPending}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Précédent
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} / {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= pagination.totalPages}
          >
            Suivant
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <ToolEditorModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        tool={editingTool}
        onSave={handleSave}
      />
    </div>
  )
}

// ─── Tab: Tester ──────────────────────────────────────────────────────────────

function TesterTab({ serverId }: { serverId: string }) {
  const { data } = useTools(serverId, 1, 100)
  const testTool = useTestTool(serverId)

  const [selectedToolId, setSelectedToolId] = React.useState<string>('')
  const [argsJson, setArgsJson] = React.useState('{}')
  const [jsonError, setJsonError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<ToolTestResult | null>(null)

  const tools = (data?.tools ?? []).filter((t) => t.isEnabled)

  const handleRun = async () => {
    if (!selectedToolId) return
    setJsonError(null)
    let args: Record<string, unknown>
    try {
      args = JSON.parse(argsJson) as Record<string, unknown>
    } catch {
      setJsonError('JSON invalide')
      return
    }
    const res = await testTool.mutateAsync({ toolId: selectedToolId, args })
    setResult(res)
  }

  const selectedTool = tools.find((t) => t.id === selectedToolId)

  return (
    <div className="space-y-5">
      {/* Tool selector */}
      <div className="space-y-2">
        <Label>Tool à tester</Label>
        <Select value={selectedToolId} onValueChange={setSelectedToolId}>
          <SelectTrigger>
            <SelectValue placeholder="Choisir un tool…" />
          </SelectTrigger>
          <SelectContent>
            {tools.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                <span className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {t.httpMethod}
                  </Badge>
                  {t.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedTool && (
          <p className="text-xs text-muted-foreground font-mono">{selectedTool.httpUrl}</p>
        )}
      </div>

      {/* Args */}
      <div className="space-y-2">
        <Label>Arguments (JSON)</Label>
        <Textarea
          className={cn('font-mono text-xs min-h-[120px]', jsonError && 'border-destructive')}
          value={argsJson}
          onChange={(e) => setArgsJson(e.target.value)}
          placeholder='{"param": "value"}'
          spellCheck={false}
        />
        {jsonError && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {jsonError}
          </p>
        )}
      </div>

      <Button
        onClick={handleRun}
        disabled={!selectedToolId || testTool.isPending}
        className="w-full"
      >
        {testTool.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Exécution…
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Exécuter
          </>
        )}
      </Button>

      {/* Result */}
      {result && (
        <div className="space-y-3">
          <Separator />
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {result.status === 'SUCCESS' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
              <span className="text-sm font-medium">
                {result.status === 'SUCCESS' ? 'Succès' : 'Erreur'}
                {result.httpStatus > 0 && ` — HTTP ${result.httpStatus}`}
              </span>
            </div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {result.latencyMs}ms
            </span>
          </div>
          {result.error && (
            <p className="text-xs text-destructive">{result.error}</p>
          )}
          {result.body !== null && (
            <div className="relative">
              <pre className="rounded-md bg-muted px-4 py-3 text-xs font-mono overflow-auto max-h-[320px] whitespace-pre-wrap break-all">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(result.body!), null, 2)
                  } catch {
                    return result.body
                  }
                })()}
              </pre>
              <CopyButton
                value={result.body}
                className="absolute top-2 right-2 bg-background/80"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Connexion ───────────────────────────────────────────────────────────

function ConnexionTab({
  serverId,
  apiKey,
  endpointUrl,
  runtimeMode,
  serverName,
}: {
  serverId: string
  apiKey: string
  endpointUrl: string | null
  runtimeMode: string
  serverName: string
}) {
  const rotateKey = useRotateApiKey()
  const [revealedKey, setRevealedKey] = React.useState<string | null>(null)
  const [rotateConfirm, setRotateConfirm] = React.useState(false)
  const [healthResult, setHealthResult] = React.useState<{ ok: boolean; latencyMs: number } | null>(null)
  const [healthLoading, setHealthLoading] = React.useState(false)

  const displayKey = revealedKey ?? apiKey
  const maskedKey = `${displayKey.slice(0, 8)}${'•'.repeat(Math.max(0, displayKey.length - 16))}${displayKey.slice(-8)}`

  const handleRotate = async () => {
    const res = await rotateKey.mutateAsync(serverId)
    setRevealedKey(res.apiKey)
    setRotateConfirm(false)
  }

  const handleHealthCheck = async () => {
    if (!endpointUrl) return
    setHealthLoading(true)
    setHealthResult(null)
    const startMs = Date.now()
    try {
      const r = await fetch(`${endpointUrl}/health`)
      setHealthResult({ ok: r.ok, latencyMs: Date.now() - startMs })
    } catch {
      setHealthResult({ ok: false, latencyMs: Date.now() - startMs })
    } finally {
      setHealthLoading(false)
    }
  }

  const isCloudflare = runtimeMode === 'CLOUDFLARE'
  const mcpUrl = endpointUrl ? `${endpointUrl}/mcp` : null
  const sseUrl = endpointUrl ? `${endpointUrl}/sse` : null

  const cfClaudeDesktopSnippet = mcpUrl
    ? `{\n  "mcpServers": {\n    "${serverName}": {\n      "url": "${mcpUrl}",\n      "headers": {\n        "Authorization": "Bearer ${displayKey}"\n      }\n    }\n  }\n}`
    : ''

  const cfCursorSnippet = mcpUrl
    ? `{\n  "mcpServers": {\n    "${serverName}": {\n      "url": "${mcpUrl}",\n      "headers": {\n        "Authorization": "Bearer ${displayKey}"\n      }\n    }\n  }\n}`
    : ''

  const localSnippet = sseUrl
    ? `// Claude Desktop config (claude_desktop_config.json)\n{\n  "mcpServers": {\n    "my-server": {\n      "command": "npx",\n      "args": ["-y", "@mcpbuilder/client"],\n      "env": {\n        "MCP_URL": "${sseUrl}",\n        "MCP_API_KEY": "${displayKey}"\n      }\n    }\n  }\n}`
    : ''

  return (
    <div className="space-y-6">
      {/* API Key */}
      <div className="space-y-2">
        <Label>Clé API</Label>
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <code className="flex-1 text-sm font-mono truncate">
            {revealedKey ? revealedKey : maskedKey}
          </code>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs shrink-0"
            onClick={() => setRevealedKey(revealedKey ? null : apiKey)}
          >
            {revealedKey ? 'Masquer' : 'Révéler'}
          </Button>
          <CopyButton value={displayKey} />
        </div>
        {revealedKey && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Nouvelle clé — copiez-la maintenant, elle ne sera plus affichée.
          </p>
        )}
        <div className="flex items-center gap-2 pt-1">
          {!rotateConfirm ? (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setRotateConfirm(true)}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Régénérer la clé
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Confirmer la régénération ?</span>
              <Button
                variant="destructive"
                size="sm"
                className="text-xs h-7"
                onClick={handleRotate}
                disabled={rotateKey.isPending}
              >
                {rotateKey.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Oui, régénérer'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => setRotateConfirm(false)}
              >
                Annuler
              </Button>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Endpoint */}
      {endpointUrl ? (
        <div className="space-y-3">
          {isCloudflare ? (
            <>
              <div className="flex items-center gap-2">
                <Label>URL Workers</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 text-xs font-medium px-2 py-0.5 cursor-default">
                        <Zap className="h-3 w-3" />
                        Edge
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Servi depuis le réseau edge Cloudflare — 200+ localisations mondiales</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <code className="flex-1 text-xs font-mono truncate text-muted-foreground">
                  {mcpUrl}
                </code>
                <CopyButton value={mcpUrl!} />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Globe className="h-3 w-3 shrink-0" />
                Votre serveur MCP est hébergé sur le réseau edge Cloudflare (200+ localisations mondiales)
              </p>

              {/* Health check */}
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={handleHealthCheck}
                  disabled={healthLoading}
                >
                  {healthLoading ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Tester la connexion
                </Button>
                {healthResult && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                      healthResult.ok
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700',
                    )}
                  >
                    {healthResult.ok ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                    {healthResult.ok ? `OK — ${healthResult.latencyMs}ms` : `Échec — ${healthResult.latencyMs}ms`}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <Label>URL du endpoint SSE</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <code className="flex-1 text-xs font-mono truncate text-muted-foreground">
                  {sseUrl}
                </code>
                <CopyButton value={sseUrl!} />
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Le serveur n&apos;est pas encore démarré. L&apos;URL sera disponible après le démarrage.
        </p>
      )}

      <Separator />

      {/* Snippet */}
      {isCloudflare && cfClaudeDesktopSnippet ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Claude Desktop</Label>
            <div className="relative">
              <ScrollArea className="max-h-[200px]">
                <pre className="rounded-md bg-muted px-4 py-3 text-xs font-mono whitespace-pre">
                  {cfClaudeDesktopSnippet}
                </pre>
              </ScrollArea>
              <CopyButton value={cfClaudeDesktopSnippet} className="absolute top-2 right-2 bg-background/80" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cursor</Label>
            <div className="relative">
              <ScrollArea className="max-h-[200px]">
                <pre className="rounded-md bg-muted px-4 py-3 text-xs font-mono whitespace-pre">
                  {cfCursorSnippet}
                </pre>
              </ScrollArea>
              <CopyButton value={cfCursorSnippet} className="absolute top-2 right-2 bg-background/80" />
            </div>
          </div>
        </div>
      ) : localSnippet ? (
        <div className="space-y-2">
          <Label>Exemple de configuration</Label>
          <div className="relative">
            <ScrollArea className="max-h-[200px]">
              <pre className="rounded-md bg-muted px-4 py-3 text-xs font-mono whitespace-pre">
                {localSnippet}
              </pre>
            </ScrollArea>
            <CopyButton value={localSnippet} className="absolute top-2 right-2 bg-background/80" />
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── Tab: Logs ────────────────────────────────────────────────────────────────

function LogsTab({ serverId }: { serverId: string }) {
  const [page, setPage] = React.useState(1)
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | 'SUCCESS' | 'ERROR'>('ALL')

  const { data, isLoading } = useLogs(serverId, {
    page,
    limit: 20,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
  })

  const logs = data?.logs ?? []
  const pagination = data?.pagination

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <Label className="text-sm shrink-0">Statut</Label>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1) }}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous</SelectItem>
            <SelectItem value="SUCCESS">Succès</SelectItem>
            <SelectItem value="ERROR">Erreurs</SelectItem>
          </SelectContent>
        </Select>
        {pagination && (
          <span className="text-xs text-muted-foreground ml-auto">
            {pagination.total} entrée{pagination.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16 ml-auto" />
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Aucun log trouvé.
        </p>
      ) : (
        <div className="space-y-0">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center gap-3 py-2.5 border-b last:border-0 text-sm"
            >
              <Badge
                variant={log.status === 'SUCCESS' ? 'secondary' : 'destructive'}
                className="text-xs shrink-0 w-16 justify-center"
              >
                {log.status}
              </Badge>
              <span className="font-mono text-xs flex-1 truncate">{log.toolName}</span>
              {log.errorMessage && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {log.errorMessage}
                </span>
              )}
              <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                {log.latencyMs !== null && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {log.latencyMs}ms
                  </span>
                )}
                <span>{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Précédent
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} / {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= pagination.totalPages}
          >
            Suivant
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ServerDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const serverId = params.id

  const { workspaceId } = useDefaultWorkspace()
  const { data: status, isLoading: statusLoading } = useServerStatus(serverId)
  const { data: serverDetail } = useQuery({
    queryKey: ['servers', 'detail', serverId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ServerWithMeta>>(`/api/v1/servers/${serverId}`)
      return res.data.data
    },
    enabled: Boolean(serverId),
  })
  const restartServer = useRestartServer(workspaceId ?? '')

  const [redeployVisible, setRedeployVisible] = React.useState(false)

  const apiKey = serverDetail?.apiKey ?? null
  const serverName = serverDetail?.name ?? (statusLoading ? 'Chargement…' : `Serveur ${serverId.slice(0, 8)}`)
  const runtimeMode = serverDetail?.runtimeMode ?? 'LOCAL'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 mt-0.5 shrink-0"
          onClick={() => router.push('/')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          {statusLoading ? (
            <Skeleton className="h-7 w-48" />
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold truncate">{serverName}</h1>
              <StatusBadge status={status?.dbStatus ?? 'STOPPED'} />
            </div>
          )}
          {status?.endpointUrl && (
            <p className="text-xs text-muted-foreground font-mono mt-1 truncate">
              {status.endpointUrl}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => restartServer.mutate(serverId)}
          disabled={restartServer.isPending}
          className="shrink-0"
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', restartServer.isPending && 'animate-spin')} />
          Redémarrer
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tools">
        <TabsList className="w-full">
          <TabsTrigger value="tools" className="flex-1">Tools</TabsTrigger>
          <TabsTrigger value="tester" className="flex-1">Testeur</TabsTrigger>
          <TabsTrigger value="connexion" className="flex-1">Connexion</TabsTrigger>
          <TabsTrigger value="logs" className="flex-1">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="tools" className="mt-6">
          <ToolsTab
            serverId={serverId}
            onRedeployTriggered={() => setRedeployVisible(true)}
          />
        </TabsContent>

        <TabsContent value="tester" className="mt-6">
          <TesterTab serverId={serverId} />
        </TabsContent>

        <TabsContent value="connexion" className="mt-6">
          <ConnexionTab
            serverId={serverId}
            apiKey={apiKey ?? '•'.repeat(32)}
            endpointUrl={status?.endpointUrl ?? null}
            runtimeMode={runtimeMode}
            serverName={serverName}
          />
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <LogsTab serverId={serverId} />
        </TabsContent>
      </Tabs>

      {/* Cloudflare redeploy notification */}
      <RedeployNotification
        serverId={serverId}
        visible={redeployVisible}
        onDismiss={() => setRedeployVisible(false)}
      />
    </div>
  )
}
