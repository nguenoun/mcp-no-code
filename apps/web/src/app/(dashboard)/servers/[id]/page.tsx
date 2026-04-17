'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Copy, Check, RefreshCw, RotateCcw, Play,
  Loader2, AlertCircle, CheckCircle2, Clock, ChevronLeft, ChevronRight, Plus,
  Zap, Globe, Trash2, Activity, Save, Search, CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ToolCard } from '@/components/tool-editor/ToolCard'
import { ToolEditorModal } from '@/components/tool-editor/ToolEditorModal'
import { RedeployNotification } from '@/components/redeploy-notification/RedeployNotification'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useDefaultWorkspace } from '@/hooks/use-workspace'
import {
  useServerStatus,
  useRestartServer,
  useRotateApiKey,
  useTestTool,
  useUpdateServer,
  useDeleteServer,
  useDeploymentStatus,
  type ToolTestResult,
  type ServerWithMeta,
} from '@/hooks/use-servers'
import { useCredentials } from '@/hooks/use-credentials'
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

// ─── CopyButton ───────────────────────────────────────────────────────────────

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

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'RUNNING') {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        Actif
      </span>
    )
  }
  if (status === 'ERROR') {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Erreur
      </Badge>
    )
  }
  return <Badge variant="secondary">Arrêté</Badge>
}

// ─── RuntimeBadge ─────────────────────────────────────────────────────────────

function RuntimeBadge({ mode }: { mode: string }) {
  if (mode === 'CLOUDFLARE') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 text-xs font-medium px-2 py-0.5">
        <Zap className="h-3 w-3" />
        Edge
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5">
      <Globe className="h-3 w-3" />
      Local
    </span>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
  valueClassName,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  loading?: boolean
  valueClassName?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="h-5 w-12 mt-0.5" />
          ) : (
            <p className={cn('text-sm font-semibold', valueClassName)}>{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
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
  const updateTool = useUpdateTool(serverId, editingTool?.id ?? '')
  const toggleTool = useToggleTool(serverId)
  const deleteTool = useDeleteTool(serverId)

  const handleOpenCreate = () => { setEditingTool(undefined); setModalOpen(true) }
  const handleOpenEdit = (tool: McpTool) => { setEditingTool(tool); setModalOpen(true) }

  const handleSave = async (formData: ToolFormData) => {
    let result: { redeployTriggered?: boolean }
    if (editingTool) {
      result = await updateTool.mutateAsync(formData)
    } else {
      result = await createTool.mutateAsync(formData)
    }
    setModalOpen(false)
    if (result.redeployTriggered) onRedeployTriggered?.()
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

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
            <ChevronLeft className="h-4 w-4" />
            Précédent
          </Button>
          <span className="text-xs text-muted-foreground">Page {page} / {pagination.totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.totalPages}>
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

// ─── Tab: Testeur ─────────────────────────────────────────────────────────────

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
                  <Badge variant="secondary" className="font-mono text-xs">{t.httpMethod}</Badge>
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

      <Button onClick={handleRun} disabled={!selectedToolId || testTool.isPending} className="w-full">
        {testTool.isPending ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Exécution…</>
        ) : (
          <><Play className="h-4 w-4 mr-2" />Exécuter</>
        )}
      </Button>

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
          {result.error && <p className="text-xs text-destructive">{result.error}</p>}
          {result.body !== null && (
            <div className="relative">
              <pre className="rounded-md bg-muted px-4 py-3 text-xs font-mono overflow-auto max-h-[320px] whitespace-pre-wrap break-all">
                {(() => {
                  try { return JSON.stringify(JSON.parse(result.body!), null, 2) }
                  catch { return result.body }
                })()}
              </pre>
              <CopyButton value={result.body} className="absolute top-2 right-2 bg-background/80" />
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

  const isCloudflare = runtimeMode === 'CLOUDFLARE'
  const { data: deployStatus, isLoading: deployLoading } = useDeploymentStatus(serverId, isCloudflare)

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

  const mcpUrl = endpointUrl ? `${endpointUrl}/mcp` : null
  const sseUrl = endpointUrl ? `${endpointUrl}/sse` : null

  const cfSnippet = mcpUrl
    ? JSON.stringify(
        {
          mcpServers: {
            [serverName]: {
              url: mcpUrl,
              headers: { Authorization: `Bearer ${displayKey}` },
            },
          },
        },
        null,
        2,
      )
    : ''

  const localSnippet = sseUrl
    ? `// claude_desktop_config.json\n${JSON.stringify(
        {
          mcpServers: {
            [serverName]: {
              command: 'npx',
              args: ['-y', '@mcpbuilder/client'],
              env: { MCP_URL: sseUrl, MCP_API_KEY: displayKey },
            },
          },
        },
        null,
        2,
      )}`
    : ''

  return (
    <div className="space-y-6">

      {/* ── CF Deployment Status ─────────────────────────────────────────────── */}
      {isCloudflare && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="p-4">
            {deployLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Chargement du statut Cloudflare…
              </div>
            ) : deployStatus ? (
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700">
                    <Zap className="h-3.5 w-3.5" />
                    Cloudflare Worker
                  </span>
                  {deployStatus.workerName && (
                    <code className="text-xs font-mono text-muted-foreground">{deployStatus.workerName}</code>
                  )}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-xs font-medium',
                      deployStatus.workerApiStatus === 'active' ? 'text-emerald-600' : 'text-amber-600',
                    )}
                  >
                    {deployStatus.workerApiStatus === 'active' ? (
                      <><CheckCircle2 className="h-3 w-3" />Déployé</>
                    ) : (
                      <><AlertCircle className="h-3 w-3" />{deployStatus.workerApiStatus ?? 'Inconnu'}</>
                    )}
                  </span>
                </div>
                {deployStatus.healthCheck && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                      deployStatus.healthCheck.ok
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700',
                    )}
                  >
                    {deployStatus.healthCheck.ok ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                    {deployStatus.healthCheck.ok
                      ? `${deployStatus.healthCheck.latencyMs}ms · ${deployStatus.healthCheck.toolCount} tools`
                      : 'Health check échoué'}
                  </span>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* ── API Key ──────────────────────────────────────────────────────────── */}
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
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setRotateConfirm(true)}>
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
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setRotateConfirm(false)}>
                Annuler
              </Button>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* ── Endpoint URLs ─────────────────────────────────────────────────────── */}
      {endpointUrl ? (
        <div className="space-y-3">
          {isCloudflare ? (
            <>
              <div className="flex items-center gap-2">
                <Label>URL MCP (Streamable HTTP)</Label>
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
                <code className="flex-1 text-xs font-mono truncate text-muted-foreground">{mcpUrl}</code>
                <CopyButton value={mcpUrl!} />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Globe className="h-3 w-3 shrink-0" />
                Votre serveur MCP est hébergé sur le réseau edge Cloudflare
              </p>
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
                      healthResult.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
                    )}
                  >
                    {healthResult.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                    {healthResult.ok ? `OK — ${healthResult.latencyMs}ms` : `Échec — ${healthResult.latencyMs}ms`}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <Label>URL du endpoint SSE</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <code className="flex-1 text-xs font-mono truncate text-muted-foreground">{sseUrl}</code>
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

      {/* ── Integration snippets ──────────────────────────────────────────────── */}
      {isCloudflare && cfSnippet ? (
        <div className="space-y-2">
          <Label>Intégration Claude Desktop / Cursor</Label>
          <div className="relative">
            <ScrollArea className="max-h-[200px]">
              <pre className="rounded-md bg-muted px-4 py-3 text-xs font-mono whitespace-pre">{cfSnippet}</pre>
            </ScrollArea>
            <CopyButton value={cfSnippet} className="absolute top-2 right-2 bg-background/80" />
          </div>
        </div>
      ) : localSnippet ? (
        <div className="space-y-2">
          <Label>Exemple de configuration</Label>
          <div className="relative">
            <ScrollArea className="max-h-[200px]">
              <pre className="rounded-md bg-muted px-4 py-3 text-xs font-mono whitespace-pre">{localSnippet}</pre>
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
  const [toolSearch, setToolSearch] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(toolSearch), 400)
    return () => clearTimeout(t)
  }, [toolSearch])

  React.useEffect(() => { setPage(1) }, [statusFilter, debouncedSearch])

  const { data, isLoading } = useLogs(serverId, {
    page,
    limit: 20,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    toolName: debouncedSearch || undefined,
  })

  const logs = data?.logs ?? []
  const pagination = data?.pagination

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
        >
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous</SelectItem>
            <SelectItem value="SUCCESS">Succès</SelectItem>
            <SelectItem value="ERROR">Erreurs</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[160px] max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filtrer par tool…"
            value={toolSearch}
            onChange={(e) => setToolSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
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
        <p className="text-sm text-muted-foreground text-center py-8">Aucun log trouvé.</p>
      ) : (
        <div className="space-y-0">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center gap-3 py-2.5 border-b last:border-0 text-sm"
            >
              <Badge
                variant={log.status === 'SUCCESS' ? 'secondary' : 'destructive'}
                className="text-xs shrink-0 w-14 justify-center"
              >
                {log.status === 'SUCCESS' ? 'OK' : 'ERR'}
              </Badge>
              <span className="font-mono text-xs flex-1 truncate">{log.toolName}</span>
              {log.errorMessage && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-destructive truncate max-w-[180px] cursor-default">
                        {log.errorMessage}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">{log.errorMessage}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                {log.latencyMs !== null && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {log.latencyMs}ms
                  </span>
                )}
                <span>
                  {new Date(log.createdAt).toLocaleString('fr-FR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
            <ChevronLeft className="h-4 w-4" />
            Précédent
          </Button>
          <span className="text-xs text-muted-foreground">Page {page} / {pagination.totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.totalPages}>
            Suivant
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Paramètres ──────────────────────────────────────────────────────────

function ParamsTab({
  serverId,
  workspaceId,
  initialName,
  initialDescription,
  initialCredentialId,
  onDeleted,
}: {
  serverId: string
  workspaceId: string
  initialName: string
  initialDescription: string | null | undefined
  initialCredentialId: string | null | undefined
  onDeleted: () => void
}) {
  const updateServer = useUpdateServer(serverId, workspaceId)
  const deleteServer = useDeleteServer(workspaceId)
  const { data: credentials } = useCredentials(workspaceId)

  const [name, setName] = React.useState(initialName)
  const [description, setDescription] = React.useState(initialDescription ?? '')
  const [credentialId, setCredentialId] = React.useState<string>(initialCredentialId ?? 'none')
  const [saved, setSaved] = React.useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = React.useState('')

  React.useEffect(() => { setName(initialName) }, [initialName])
  React.useEffect(() => { setDescription(initialDescription ?? '') }, [initialDescription])
  React.useEffect(() => { setCredentialId(initialCredentialId ?? 'none') }, [initialCredentialId])

  const isDirty =
    name.trim() !== initialName ||
    (description.trim() || null) !== (initialDescription?.trim() || null) ||
    credentialId !== (initialCredentialId ?? 'none')

  const handleSave = async () => {
    await updateServer.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      credentialId: credentialId === 'none' ? null : credentialId,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleDelete = async () => {
    await deleteServer.mutateAsync(serverId)
    setDeleteDialogOpen(false)
    onDeleted()
  }

  return (
    <div className="space-y-8 max-w-lg">

      {/* ── Server info ───────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Informations du serveur</h3>

        <div className="space-y-2">
          <Label htmlFor="param-name">Nom</Label>
          <Input
            id="param-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mon serveur MCP"
            maxLength={100}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="param-desc">Description</Label>
          <Textarea
            id="param-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description optionnelle…"
            className="min-h-[80px] resize-none"
            maxLength={500}
          />
        </div>
      </div>

      {/* ── Credential ────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Credential</h3>

        <div className="space-y-2">
          <Label htmlFor="param-cred">Identifiant attaché</Label>
          <Select value={credentialId} onValueChange={setCredentialId}>
            <SelectTrigger id="param-cred">
              <SelectValue placeholder="Sélectionner un credential…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">Aucun credential</span>
              </SelectItem>
              {(credentials ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    {c.name}
                    <Badge variant="secondary" className="text-xs font-mono">{c.type}</Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Le credential est injecté dans les headers de chaque appel tool.
          </p>
        </div>
      </div>

      {/* Save row */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={!isDirty || !name.trim() || updateServer.isPending}
        >
          {updateServer.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enregistrement…</>
          ) : (
            <><Save className="h-4 w-4 mr-2" />Enregistrer</>
          )}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            Modifications enregistrées
          </span>
        )}
      </div>

      <Separator />

      {/* ── Danger zone ───────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-destructive">Zone dangereuse</h3>
        <Card className="border-destructive/30">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-medium">Supprimer ce serveur</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Action irréversible. Tous les tools et logs associés seront supprimés.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="shrink-0"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Supprimer
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Delete dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setDeleteConfirmText('')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le serveur</DialogTitle>
            <DialogDescription>
              Cette action est <strong>irréversible</strong>. Le serveur, ses tools, ses logs
              et son déploiement Cloudflare seront définitivement supprimés.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm">
              Saisissez <strong>{initialName}</strong> pour confirmer
            </Label>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={initialName}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDeleteDialogOpen(false); setDeleteConfirmText('') }}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteConfirmText !== initialName || deleteServer.isPending}
            >
              {deleteServer.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const { data: serverDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['servers', 'detail', serverId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ServerWithMeta>>(`/api/v1/servers/${serverId}`)
      return res.data.data
    },
    enabled: Boolean(serverId),
  })
  const restartServer = useRestartServer(workspaceId ?? '')

  // Stats queries (minimal payload — just need pagination totals)
  const { data: allLogsData } = useLogs(serverId, { limit: 20, page: 1 })
  const { data: errorLogsData } = useLogs(serverId, { limit: 1, page: 1, status: 'ERROR' })

  const [redeployVisible, setRedeployVisible] = React.useState(false)

  const isLoading = detailLoading || statusLoading
  const apiKey = serverDetail?.apiKey ?? null
  const serverName = serverDetail?.name ?? (detailLoading ? '' : `Serveur ${serverId.slice(0, 8)}`)
  const runtimeMode = serverDetail?.runtimeMode ?? 'LOCAL'

  // Computed stats
  const totalCalls = allLogsData?.pagination.total ?? 0
  const totalErrors = errorLogsData?.pagination.total ?? 0
  const avgLatency = React.useMemo(() => {
    const withLatency = (allLogsData?.logs ?? []).filter((l) => l.latencyMs !== null)
    if (withLatency.length === 0) return null
    return Math.round(
      withLatency.reduce((acc, l) => acc + l.latencyMs!, 0) / withLatency.length,
    )
  }, [allLogsData])

  const toolCount = status?.toolCount ?? serverDetail?._count?.tools ?? 0
  const createdAt = serverDetail?.createdAt ? new Date(serverDetail.createdAt) : null
  const startedAt = status?.startedAt ? new Date(status.startedAt) : null

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 mt-0.5 shrink-0"
            onClick={() => router.push('/servers')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl font-bold truncate">{serverName}</h1>
                  <StatusBadge status={status?.dbStatus ?? 'STOPPED'} />
                  <RuntimeBadge mode={runtimeMode} />
                </div>
                {serverDetail?.description && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                    {serverDetail.description}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                  {createdAt && (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      Créé le {createdAt.toLocaleDateString('fr-FR')}
                    </span>
                  )}
                  {startedAt && (
                    <span className="flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      Démarré le{' '}
                      {startedAt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  )}
                  {status?.endpointUrl && (
                    <span className="font-mono truncate max-w-xs">
                      {status.endpointUrl}
                    </span>
                  )}
                </div>
              </>
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
            {runtimeMode === 'CLOUDFLARE' ? 'Redéployer' : 'Redémarrer'}
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Tools actifs"
            value={toolCount}
            icon={Zap}
            loading={isLoading}
          />
          <StatCard
            label="Appels total"
            value={totalCalls}
            icon={Activity}
            loading={!allLogsData && isLoading}
          />
          <StatCard
            label="Erreurs"
            value={totalErrors}
            icon={AlertCircle}
            loading={!errorLogsData && isLoading}
            valueClassName={totalErrors > 0 ? 'text-destructive' : undefined}
          />
          <StatCard
            label="Latence moy."
            value={avgLatency !== null ? `${avgLatency}ms` : '—'}
            icon={Clock}
            loading={!allLogsData && isLoading}
          />
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="tools">
        <TabsList className="w-full">
          <TabsTrigger value="tools" className="flex-1">Tools</TabsTrigger>
          <TabsTrigger value="tester" className="flex-1">Testeur</TabsTrigger>
          <TabsTrigger value="connexion" className="flex-1">Connexion</TabsTrigger>
          <TabsTrigger value="logs" className="flex-1">Logs</TabsTrigger>
          <TabsTrigger value="params" className="flex-1">Paramètres</TabsTrigger>
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

        <TabsContent value="params" className="mt-6">
          {workspaceId && (
            <ParamsTab
              serverId={serverId}
              workspaceId={workspaceId}
              initialName={serverName}
              initialDescription={serverDetail?.description}
              initialCredentialId={serverDetail?.credential?.id}
              onDeleted={() => router.push('/servers')}
            />
          )}
        </TabsContent>
      </Tabs>

      <RedeployNotification
        serverId={serverId}
        visible={redeployVisible}
        onDismiss={() => setRedeployVisible(false)}
      />
    </div>
  )
}
