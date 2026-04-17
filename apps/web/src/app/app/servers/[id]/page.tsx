'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Copy, Check, RefreshCw, RotateCcw, Play,
  Loader2, AlertCircle, CheckCircle2, Clock, ChevronLeft, ChevronRight, Plus,
  Zap, Globe, Trash2, Activity, Save, Search, CalendarDays,
  ShieldCheck, Key, Users, X, Github,
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
  useDeploymentVerify,
  type ToolTestResult,
  type ServerWithMeta,
  type DeploymentVerification,
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
import { GithubImportDialog } from '@/components/github-import/GithubImportDialog'
import {
  useOAuthApps,
  useCreateOAuthApp,
  useDeleteOAuthApp,
  useOAuthSessions,
  useRevokeSession,
  useRevokeAllSessions,
  useUpdateAuthMode,
  type OAuthAppCreated,
} from '@/hooks/use-oauth'
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
  const [githubImportOpen, setGithubImportOpen] = React.useState(false)
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
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {pagination ? `${pagination.total} tool${pagination.total !== 1 ? 's' : ''}` : ''}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGithubImportOpen(true)}
          >
            <Github className="h-4 w-4 mr-2" />
            Import GitHub
          </Button>
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Ajouter un tool
          </Button>
        </div>
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

      <GithubImportDialog
        serverId={serverId}
        open={githubImportOpen}
        onOpenChange={(v) => {
          setGithubImportOpen(v)
          if (!v) onRedeployTriggered?.()
        }}
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

// ─── DeploymentVerifyPanel ────────────────────────────────────────────────────

function CheckRow({
  label,
  status,
  detail,
}: {
  label: string
  status: 'ok' | 'mismatch' | 'unknown' | 'fail'
  detail?: string
}) {
  const icon =
    status === 'ok' ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
    ) : status === 'mismatch' || status === 'fail' ? (
      <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
    ) : (
      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
    )

  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      {icon}
      <div className="flex-1 min-w-0">
        <span className="text-sm">{label}</span>
        {detail && (
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{detail}</p>
        )}
      </div>
    </div>
  )
}

function DeploymentVerifyPanel({ serverId, onRedeploy }: { serverId: string; onRedeploy: () => void }) {
  const verify = useDeploymentVerify(serverId)
  const result = verify.data as DeploymentVerification | undefined

  const handleRun = () => { verify.mutate() }

  const statusColor =
    !result ? '' :
    result.overallStatus === 'ok' ? 'border-emerald-200 bg-emerald-50/40' :
    result.overallStatus === 'degraded' ? 'border-amber-200 bg-amber-50/40' :
    'border-destructive/30 bg-destructive/5'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-orange-600" />
          Vérification du déploiement
        </Label>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={handleRun}
          disabled={verify.isPending}
        >
          {verify.isPending ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Vérification…</>
          ) : (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Vérifier</>
          )}
        </Button>
      </div>

      {result && result.applicable && (
        <Card className={cn('border', statusColor)}>
          <CardContent className="p-4 space-y-1">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <span className={cn(
                'text-xs font-semibold',
                result.overallStatus === 'ok' ? 'text-emerald-700' :
                result.overallStatus === 'degraded' ? 'text-amber-700' :
                'text-destructive',
              )}>
                {result.overallStatus === 'ok' && '✓ Worker synchronisé'}
                {result.overallStatus === 'degraded' && '⚠ Désynchronisation détectée — redéploiement requis'}
                {result.overallStatus === 'error' && '✗ Worker inaccessible'}
              </span>
              {result.healthLatencyMs !== null && (
                <span className="text-xs text-muted-foreground">{result.healthLatencyMs}ms</span>
              )}
            </div>

            {/* Checks — quand inaccessible, on affiche juste l'URL sans dupliquer le message d'erreur */}
            {!result.workerReachable ? (
              <div className="flex items-start gap-3 py-2">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm">Impossible de joindre le worker</span>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{result.endpointUrl}</p>
                </div>
              </div>
            ) : (
              <>
                <CheckRow
                  label="Endpoint accessible"
                  status="ok"
                  detail={result.endpointUrl}
                />
                <CheckRow
                  label="Server ID"
                  status={result.checks.serverId.status}
                  detail={
                    result.checks.serverId.status !== 'ok'
                      ? `Worker: ${result.checks.serverId.worker} ≠ Attendu: ${result.checks.serverId.expected}`
                      : undefined
                  }
                />
                <CheckRow
                  label="Mode d'authentification"
                  status={result.checks.authMode.status}
                  detail={
                    result.checks.authMode.status !== 'ok'
                      ? `Worker: ${result.checks.authMode.worker ?? '?'} ≠ DB: ${result.checks.authMode.expected}`
                      : `${result.checks.authMode.worker ?? result.checks.authMode.expected}`
                  }
                />
                <CheckRow
                  label={`Tools actifs (${result.checks.toolCount.worker ?? '?'} / ${result.checks.toolCount.expected} attendus)`}
                  status={result.checks.toolCount.status}
                  detail={
                    result.checks.tools.missingFromWorker.length > 0
                      ? `Manquants dans le worker : ${result.checks.tools.missingFromWorker.join(', ')}`
                      : result.checks.tools.extraInWorker.length > 0
                        ? `En surplus dans le worker : ${result.checks.tools.extraInWorker.join(', ')}`
                        : undefined
                  }
                />
                <CheckRow
                  label="Rejet des appels non authentifiés"
                  status={result.checks.authRejection.status}
                  detail={
                    result.checks.authRejection.status === 'fail'
                      ? 'Le worker a répondu sans exiger un token — vérifiez les secrets déployés'
                      : undefined
                  }
                />
              </>
            )}

            {/* CTA redeploy */}
            {(result.overallStatus === 'degraded' || result.overallStatus === 'error') && (
              <div className="pt-3">
                <Button size="sm" className="w-full text-xs" onClick={onRedeploy}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Redéployer maintenant
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
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
  authMode,
  onRedeploy,
}: {
  serverId: string
  apiKey: string
  endpointUrl: string | null
  runtimeMode: string
  serverName: string
  authMode: 'API_KEY' | 'OAUTH'
  onRedeploy?: () => void
}) {
  const rotateKey = useRotateApiKey()
  const [revealedKey, setRevealedKey] = React.useState<string | null>(null)
  const [rotateConfirm, setRotateConfirm] = React.useState(false)
  const [healthResult, setHealthResult] = React.useState<{ ok: boolean; latencyMs: number } | null>(null)
  const [healthLoading, setHealthLoading] = React.useState(false)

  const isCloudflare = runtimeMode === 'CLOUDFLARE'
  // enabled=true so the query always runs and we can trigger a manual refetch
  const { data: deployStatus, isLoading: deployLoading, refetch: refetchDeployStatus } =
    useDeploymentStatus(serverId, isCloudflare)

  const displayKey = revealedKey ?? apiKey
  const maskedKey = `${displayKey.slice(0, 8)}${'•'.repeat(Math.max(0, displayKey.length - 16))}${displayKey.slice(-8)}`

  const handleRotate = async () => {
    const res = await rotateKey.mutateAsync(serverId)
    setRevealedKey(res.apiKey)
    setRotateConfirm(false)
  }

  // Routes the health check through the backend (avoids CORS on direct browser fetch).
  // Workers deployed before the CORS fix also benefit from this approach.
  const handleHealthCheck = async () => {
    setHealthLoading(true)
    setHealthResult(null)
    try {
      const { data } = await refetchDeployStatus()
      const hc = data?.healthCheck ?? null
      setHealthResult(hc ? { ok: hc.ok, latencyMs: hc.latencyMs } : { ok: false, latencyMs: 0 })
    } catch {
      setHealthResult({ ok: false, latencyMs: 0 })
    } finally {
      setHealthLoading(false)
    }
  }

  const mcpUrl = endpointUrl ? `${endpointUrl}/mcp` : null
  const sseUrl = endpointUrl ? `${endpointUrl}/sse` : null

  const isOAuth = authMode === 'OAUTH'
  const apiBaseUrl =
    typeof process !== 'undefined'
      ? (process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000')
      : 'http://localhost:4000'
  const discoveryUrl = `${apiBaseUrl}/mcp/${serverId}/.well-known/oauth-authorization-server`
  const authorizeUrl = `${apiBaseUrl}/mcp/${serverId}/authorize`
  const tokenUrl = `${apiBaseUrl}/mcp/${serverId}/token`
  const revokeUrl = `${apiBaseUrl}/mcp/${serverId}/revoke`

  // Integration snippets — content depends on auth mode
  const cfSnippet = mcpUrl
    ? JSON.stringify(
        isOAuth
          ? {
              mcpServers: {
                [serverName]: {
                  url: mcpUrl,
                  // OAuth clients auto-discover auth via /.well-known/
                },
              },
            }
          : {
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
    ? `// mcp_config.json\n${JSON.stringify(
        {
          mcpServers: {
            [serverName]: {
              command: 'npx',
              args: ['-y', '@mcpbuilder/client'],
              env: isOAuth
                ? { MCP_URL: sseUrl }
                : { MCP_URL: sseUrl, MCP_API_KEY: displayKey },
            },
          },
        },
        null,
        2,
      )}`
    : ''

  return (
    <div className="space-y-6">

      {/* ── Auth mode banner ─────────────────────────────────────────────────── */}
      <div
        className={cn(
          'flex items-start gap-3 rounded-lg border px-4 py-3',
          isOAuth
            ? 'border-purple-200 bg-purple-50/60'
            : 'border-blue-200 bg-blue-50/60',
        )}
      >
        <div
          className={cn(
            'mt-0.5 rounded-md p-1.5 shrink-0',
            isOAuth ? 'bg-purple-100' : 'bg-blue-100',
          )}
        >
          {isOAuth ? (
            <ShieldCheck className="h-4 w-4 text-purple-600" />
          ) : (
            <Key className="h-4 w-4 text-blue-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-semibold', isOAuth ? 'text-purple-800' : 'text-blue-800')}>
            {isOAuth ? 'Mode OAuth 2.0 actif' : 'Mode Clé API actif'}
          </p>
          <p className={cn('text-xs mt-0.5', isOAuth ? 'text-purple-700' : 'text-blue-700')}>
            {isOAuth
              ? 'Les clients distants doivent passer par le flux PKCE — ils ne peuvent pas utiliser la clé API statique.'
              : 'Les clients distants s\'authentifient avec la clé API ci-dessous en tant que Bearer token.'}
          </p>
        </div>
        <Badge
          className={cn(
            'shrink-0 text-xs',
            isOAuth
              ? 'bg-purple-100 text-purple-700 border-purple-300'
              : 'bg-blue-100 text-blue-700 border-blue-300',
          )}
          variant="outline"
        >
          {isOAuth ? 'OAuth 2.0 / PKCE' : 'Bearer token'}
        </Badge>
      </div>

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
      <div className={cn('space-y-2', isOAuth && 'opacity-60')}>
        <div className="flex items-center gap-2">
          <Label>Clé API</Label>
          {isOAuth && (
            <span className="text-xs text-muted-foreground italic">
              — non utilisée pour l&apos;accès MCP en mode OAuth
            </span>
          )}
        </div>
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

      {/* ── OAuth endpoints (mode OAuth uniquement) ────────────────────────────── */}
      {isOAuth && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-purple-600" />
              Endpoints OAuth 2.0
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Les clients compatibles MCP découvrent ces URLs automatiquement via la metadata (RFC 8414).
            </p>
          </div>

          {/* Discovery URL — le plus important */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              Discovery (RFC 8414)
            </Label>
            <div className="flex items-center gap-2 rounded-md border border-purple-200 bg-purple-50/40 px-3 py-2">
              <code className="flex-1 text-xs font-mono truncate text-purple-800">{discoveryUrl}</code>
              <CopyButton value={discoveryUrl} />
            </div>
            <p className="text-xs text-muted-foreground">
              Un client qui supporte l&apos;auto-discovery OAuth lit cette URL pour trouver tous les endpoints.
            </p>
          </div>

          {/* Endpoints détaillés */}
          <div className="grid gap-2">
            {[
              { label: 'Authorization', url: authorizeUrl },
              { label: 'Token', url: tokenUrl },
              { label: 'Revocation', url: revokeUrl },
            ].map(({ label, url }) => (
              <div key={label} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
                <code className="flex-1 text-xs font-mono truncate text-muted-foreground">{url}</code>
                <CopyButton value={url} />
              </div>
            ))}
          </div>

          {/* Prérequis */}
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
            <span>
              Le client doit d&apos;abord être enregistré dans l&apos;onglet{' '}
              <strong>Auth → Applications enregistrées</strong> pour obtenir un{' '}
              <code className="font-mono">client_id</code> et un{' '}
              <code className="font-mono">client_secret</code>.
            </span>
          </div>
        </div>
      )}

      {isOAuth && <Separator />}

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

              {/* ── Vérification approfondie du déploiement ─── */}
              <Separator />
              <DeploymentVerifyPanel
                serverId={serverId}
                onRedeploy={onRedeploy ?? (() => {})}
              />
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
          <div className="flex items-center gap-2">
            <Label>Configuration client MCP</Label>
            {isOAuth && (
              <Badge variant="outline" className="text-xs text-purple-700 border-purple-300 bg-purple-50">
                OAuth auto-discovery
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Format standard MCP — compatible avec tout client MCP (Claude Desktop, Cursor, VS Code, Zed…).
            {isOAuth && (
              <> Le client découvre automatiquement le flux OAuth via{' '}
              <code className="font-mono">/.well-known/oauth-authorization-server</code>.</>
            )}
          </p>
          <div className="relative">
            <ScrollArea className="max-h-[200px]">
              <pre className="rounded-md bg-muted px-4 py-3 text-xs font-mono whitespace-pre">{cfSnippet}</pre>
            </ScrollArea>
            <CopyButton value={cfSnippet} className="absolute top-2 right-2 bg-background/80" />
          </div>
        </div>
      ) : localSnippet ? (
        <div className="space-y-2">
          <Label>Configuration client MCP</Label>
          <p className="text-xs text-muted-foreground">
            Format standard MCP — compatible avec tout client MCP (Claude Desktop, Cursor, VS Code, Zed…).
          </p>
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

// ─── Tab: Autorisation ────────────────────────────────────────────────────────

// G4 — Dialog "Nouvelle application OAuth"
function NewAppDialog({
  serverId,
  open,
  onOpenChange,
  onCreated,
}: {
  serverId: string
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (app: OAuthAppCreated) => void
}) {
  const create = useCreateOAuthApp(serverId)
  const [name, setName] = React.useState('')
  const [uris, setUris] = React.useState('')

  const handleClose = () => {
    setName('')
    setUris('')
    create.reset()
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    const redirectUris = uris
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const app = await create.mutateAsync({ name: name.trim(), redirectUris })
    onCreated(app)
    setName('')
    setUris('')
  }

  const errorMsg = create.isError
    ? ((create.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data
        ?.error?.message ?? 'Une erreur est survenue.')
    : null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle application OAuth</DialogTitle>
          <DialogDescription>
            Enregistrez une application cliente pour lui permettre d&apos;accéder à ce serveur via
            OAuth 2.0.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="app-name">Nom de l&apos;application</Label>
            <Input
              id="app-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mon client MCP"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="app-uris">URIs de redirection</Label>
            <Textarea
              id="app-uris"
              value={uris}
              onChange={(e) => setUris(e.target.value)}
              placeholder={'http://localhost:3000/callback\nhttps://myapp.example.com/oauth/callback'}
              className="font-mono text-xs min-h-[80px] resize-none"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">Une URI par ligne.</p>
          </div>
          {errorMsg && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={create.isPending}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !uris.trim() || create.isPending}
          >
            {create.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Création…</>
            ) : (
              'Créer'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// G4 — Dialog "Credentials créés" (one-time display)
function AppCreatedDialog({
  app,
  open,
  onOpenChange,
}: {
  app: OAuthAppCreated | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  if (!app) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Application créée</DialogTitle>
          <DialogDescription>
            Copiez le <strong>Client Secret</strong> maintenant. Il ne sera plus affiché.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Client ID
            </p>
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <code className="flex-1 text-xs font-mono truncate">{app.clientId}</code>
              <CopyButton value={app.clientId} />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Client Secret
            </p>
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50/50 px-3 py-2">
              <code className="flex-1 text-xs font-mono break-all">{app.clientSecret}</code>
              <CopyButton value={app.clientSecret} />
            </div>
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              Stockez ce secret en lieu sûr — il ne sera plus jamais affiché.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// G2-G5 — AuthTab
function AuthTab({
  serverId,
  initialAuthMode,
}: {
  serverId: string
  initialAuthMode: 'API_KEY' | 'OAUTH'
}) {
  const updateAuthMode = useUpdateAuthMode(serverId)
  const { data: apps, isLoading: appsLoading } = useOAuthApps(serverId)
  const deleteApp = useDeleteOAuthApp(serverId)
  const { data: sessions, isLoading: sessionsLoading } = useOAuthSessions(serverId)
  const revokeSession = useRevokeSession(serverId)
  const revokeAll = useRevokeAllSessions(serverId)

  // Local auth mode — optimistically updated after PUT
  const [authMode, setAuthMode] = React.useState<'API_KEY' | 'OAUTH'>(initialAuthMode)
  React.useEffect(() => { setAuthMode(initialAuthMode) }, [initialAuthMode])

  const [switchConfirmOpen, setSwitchConfirmOpen] = React.useState(false)
  const [pendingMode, setPendingMode] = React.useState<'API_KEY' | 'OAUTH' | null>(null)
  const [newAppOpen, setNewAppOpen] = React.useState(false)
  const [createdApp, setCreatedApp] = React.useState<OAuthAppCreated | null>(null)
  const [createdDialogOpen, setCreatedDialogOpen] = React.useState(false)
  const [revokeAllConfirm, setRevokeAllConfirm] = React.useState(false)

  const requestSwitch = (mode: 'API_KEY' | 'OAUTH') => {
    setPendingMode(mode)
    setSwitchConfirmOpen(true)
  }

  const confirmSwitch = async () => {
    if (!pendingMode) return
    await updateAuthMode.mutateAsync(pendingMode)
    setAuthMode(pendingMode)
    setSwitchConfirmOpen(false)
    setPendingMode(null)
  }

  const handleAppCreated = (app: OAuthAppCreated) => {
    setNewAppOpen(false)
    setCreatedApp(app)
    setCreatedDialogOpen(true)
  }

  const handleRevokeAll = async () => {
    await revokeAll.mutateAsync()
    setRevokeAllConfirm(false)
  }

  const isOAuth = authMode === 'OAUTH'

  return (
    <div className="space-y-8 max-w-2xl">

      {/* ── G2 Mode d'authentification ────────────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Mode d&apos;authentification</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Contrôle comment les clients s&apos;authentifient pour appeler ce serveur MCP.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* API Key card */}
          <button
            type="button"
            onClick={() => authMode !== 'API_KEY' && requestSwitch('API_KEY')}
            className={cn(
              'text-left rounded-lg border p-4 transition-colors',
              authMode === 'API_KEY'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'hover:border-muted-foreground/40 cursor-pointer',
            )}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-md bg-blue-100 p-1.5">
                <Key className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Clé API</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Bearer token statique — simple et rapide. Adapté aux clients de confiance.
                </p>
              </div>
            </div>
            {authMode === 'API_KEY' && (
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Actif
              </span>
            )}
          </button>

          {/* OAuth card */}
          <button
            type="button"
            onClick={() => authMode !== 'OAUTH' && requestSwitch('OAUTH')}
            className={cn(
              'text-left rounded-lg border p-4 transition-colors',
              authMode === 'OAUTH'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'hover:border-muted-foreground/40 cursor-pointer',
            )}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-md bg-purple-100 p-1.5">
                <ShieldCheck className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium">OAuth 2.0</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Flux PKCE avec consentement utilisateur. Recommandé pour les accès tiers.
                </p>
              </div>
            </div>
            {authMode === 'OAUTH' && (
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Actif
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── G3 Applications (only in OAUTH mode) ─────────────────────────────── */}
      {isOAuth && (
        <>
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Applications enregistrées</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Clients OAuth autorisés à demander l&apos;accès à ce serveur.
                </p>
              </div>
              <Button size="sm" onClick={() => setNewAppOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nouvelle application
              </Button>
            </div>

            {appsLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="rounded-lg border p-4 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                ))}
              </div>
            ) : !apps || apps.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm font-medium">Aucune application enregistrée</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">
                    Créez une application pour permettre à vos clients OAuth de s&apos;authentifier.
                  </p>
                  <Button size="sm" onClick={() => setNewAppOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nouvelle application
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {apps.map((app) => (
                  <div
                    key={app.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-4"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium truncate">{app.name}</p>
                      <code className="text-xs font-mono text-muted-foreground">
                        {app.clientId}
                      </code>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          Créé le{' '}
                          {new Date(app.createdAt).toLocaleDateString('fr-FR')}
                        </span>
                        <span>
                          {app._count.tokens} session{app._count.tokens !== 1 ? 's' : ''} active
                          {app._count.tokens !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteApp.mutate(app.id)}
                      disabled={deleteApp.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── G5 Sessions actives (only in OAUTH mode) ──────────────────────────── */}
      {isOAuth && (
        <>
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Sessions actives
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tokens OAuth valides accordant l&apos;accès à ce serveur.
                </p>
              </div>
              {sessions && sessions.length > 0 && (
                !revokeAllConfirm ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs shrink-0"
                    onClick={() => setRevokeAllConfirm(true)}
                  >
                    Tout révoquer
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Confirmer ?</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="text-xs h-7"
                      onClick={handleRevokeAll}
                      disabled={revokeAll.isPending}
                    >
                      {revokeAll.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Oui'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setRevokeAllConfirm(false)}
                    >
                      Non
                    </Button>
                  </div>
                )
              )}
            </div>

            {sessionsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20 ml-auto" />
                  </div>
                ))}
              </div>
            ) : !sessions || sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aucune session active.
              </p>
            ) : (
              <div className="space-y-0">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center gap-3 py-3 border-b last:border-0 text-sm flex-wrap"
                  >
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-xs">{session.user.email}</span>
                        <Badge variant="secondary" className="text-xs">
                          {session.client.name}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {session.scopes.map((s) => (
                          <Badge
                            key={s}
                            variant="outline"
                            className="text-xs font-mono px-1.5 py-0"
                          >
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1 cursor-default">
                              <Clock className="h-3 w-3" />
                              {new Date(session.createdAt).toLocaleDateString('fr-FR')}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              Expire le{' '}
                              {new Date(session.expiresAt).toLocaleString('fr-FR', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => revokeSession.mutate(session.id)}
                        disabled={revokeSession.isPending}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Switch mode confirmation */}
      <Dialog open={switchConfirmOpen} onOpenChange={setSwitchConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Changer le mode d&apos;authentification ?</DialogTitle>
            <DialogDescription>
              Passer en mode{' '}
              <strong>{pendingMode === 'OAUTH' ? 'OAuth 2.0' : 'Clé API'}</strong>{' '}
              {pendingMode === 'API_KEY'
                ? 'révoquera toutes les sessions OAuth actives. Les clients utilisant un Bearer token OAuth ne pourront plus se connecter.'
                : 'désactivera l\'authentification par clé API statique.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSwitchConfirmOpen(false)}
              disabled={updateAuthMode.isPending}
            >
              Annuler
            </Button>
            <Button onClick={confirmSwitch} disabled={updateAuthMode.isPending}>
              {updateAuthMode.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New app dialog */}
      <NewAppDialog
        serverId={serverId}
        open={newAppOpen}
        onOpenChange={setNewAppOpen}
        onCreated={handleAppCreated}
      />

      {/* Created credentials dialog */}
      <AppCreatedDialog
        app={createdApp}
        open={createdDialogOpen}
        onOpenChange={setCreatedDialogOpen}
      />
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
            onClick={() => router.push('/app/servers')}
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
          <TabsTrigger value="auth" className="flex-1">Auth</TabsTrigger>
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
            authMode={(serverDetail?.authMode as 'API_KEY' | 'OAUTH') ?? 'API_KEY'}
            onRedeploy={() => restartServer.mutate(serverId)}
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
              onDeleted={() => router.push('/app/servers')}
            />
          )}
        </TabsContent>

        <TabsContent value="auth" className="mt-6">
          <AuthTab
            serverId={serverId}
            initialAuthMode={(serverDetail?.authMode as 'API_KEY' | 'OAUTH') ?? 'API_KEY'}
          />
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
