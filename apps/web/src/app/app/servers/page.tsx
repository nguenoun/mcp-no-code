'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Plus,
  Server,
  LayoutGrid,
  List,
  Search,
  RefreshCw,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  MoreVertical,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ServerCard } from '@/components/server-card/ServerCard'
import { useServers, useRestartServer, useDeleteServer } from '@/hooks/use-servers'
import { useDefaultWorkspace } from '@/hooks/use-workspace'
import { cn } from '@/lib/utils'
import type { ServerWithMeta } from '@/hooks/use-servers'

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'RUNNING' | 'STOPPED' | 'ERROR'
type RuntimeFilter = 'ALL' | 'LOCAL' | 'CLOUDFLARE'
type ViewMode = 'grid' | 'list'

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'RUNNING') {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        Running
      </span>
    )
  }
  if (status === 'ERROR') {
    return (
      <Badge variant="destructive" className="text-xs px-1.5 py-0">
        Error
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="text-xs px-1.5 py-0">
      Stopped
    </Badge>
  )
}

// ─── Copy button (inline) ─────────────────────────────────────────────────────

function CopyInline({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      onClick={(e) => {
        e.preventDefault()
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

// ─── Delete dialog ────────────────────────────────────────────────────────────

function DeleteDialog({
  server,
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: {
  server: ServerWithMeta
  open: boolean
  onOpenChange: (o: boolean) => void
  onConfirm: () => void
  isDeleting: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Supprimer le serveur ?</DialogTitle>
          <DialogDescription>
            Le serveur <strong>{server.name}</strong> et tous ses tools seront supprimés
            définitivement. Cette action est irréversible.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Suppression…' : 'Supprimer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── List row ────────────────────────────────────────────────────────────────

function ServerRow({
  server,
  onRestart,
  onDelete,
  isRestarting,
  isDeleting,
}: {
  server: ServerWithMeta
  onRestart: (id: string) => void
  onDelete: (id: string) => void
  isRestarting: boolean
  isDeleting: boolean
}) {
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const toolCount = server._count?.tools ?? 0

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-4 px-4 py-3 border-b last:border-0 hover:bg-muted/30 transition-colors text-sm',
          isDeleting && 'opacity-50 pointer-events-none',
        )}
      >
        {/* Name + description */}
        <div className="min-w-0 flex-[2]">
          <Link
            href={`/app/servers/${server.id}`}
            className="font-medium hover:underline truncate block"
          >
            {server.name}
          </Link>
          {server.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{server.description}</p>
          )}
        </div>

        {/* Status */}
        <div className="w-24 shrink-0">
          <StatusBadge status={server.status} />
        </div>

        {/* Runtime */}
        <div className="w-28 shrink-0">
          {server.runtimeMode === 'CLOUDFLARE' ? (
            <Badge
              variant="outline"
              className="text-xs px-1.5 py-0 border-orange-300 text-orange-600"
            >
              ☁️ Cloudflare
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
              💻 Local
            </Badge>
          )}
        </div>

        {/* Tools */}
        <div className="w-16 shrink-0 text-xs text-muted-foreground">
          {toolCount} tool{toolCount !== 1 ? 's' : ''}
        </div>

        {/* Credential */}
        <div className="w-32 shrink-0 text-xs text-muted-foreground truncate">
          {server.credential?.name ?? <span className="italic">—</span>}
        </div>

        {/* Endpoint */}
        <div className="flex-[2] min-w-0">
          {server.endpointUrl ? (
            <div className="flex items-center gap-1.5 rounded bg-muted/50 px-2 py-1">
              <code className="flex-1 text-xs text-muted-foreground font-mono truncate">
                {server.endpointUrl}
              </code>
              <CopyInline value={server.endpointUrl} />
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic">Non déployé</span>
          )}
        </div>

        {/* Created at */}
        <div className="w-24 shrink-0 text-xs text-muted-foreground text-right">
          {new Date(server.createdAt).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </div>

        {/* Actions */}
        <div className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/app/servers/${server.id}`}>
                  <ExternalLink className="h-3.5 w-3.5 mr-2" />
                  Ouvrir
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRestart(server.id)} disabled={isRestarting}>
                <RefreshCw className={cn('h-3.5 w-3.5 mr-2', isRestarting && 'animate-spin')} />
                Redémarrer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <DeleteDialog
        server={server}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => {
          onDelete(server.id)
          setDeleteOpen(false)
        }}
        isDeleting={isDeleting}
      />
    </>
  )
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

function GridSkeletons() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-14" />
            </div>
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-full" />
          </div>
        </Card>
      ))}
    </div>
  )
}

function ListSkeletons() {
  return (
    <div className="border rounded-lg overflow-hidden">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
          <Skeleton className="h-4 flex-[2]" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 flex-[2]" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-7" />
        </div>
      ))}
    </div>
  )
}

// ─── Servers page ─────────────────────────────────────────────────────────────

export default function ServersPage() {
  const { workspaceId } = useDefaultWorkspace()
  const { data: servers, isLoading } = useServers(workspaceId)
  const restartServer = useRestartServer(workspaceId ?? '')
  const deleteServer = useDeleteServer(workspaceId ?? '')

  const [view, setView] = React.useState<ViewMode>('grid')
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('ALL')
  const [runtimeFilter, setRuntimeFilter] = React.useState<RuntimeFilter>('ALL')

  const filtered = React.useMemo(() => {
    if (!servers) return []
    return servers.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false
      if (runtimeFilter !== 'ALL' && s.runtimeMode !== runtimeFilter) return false
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [servers, statusFilter, runtimeFilter, search])

  const counts = React.useMemo(() => {
    if (!servers) return { total: 0, running: 0, stopped: 0, error: 0 }
    return {
      total: servers.length,
      running: servers.filter((s) => s.status === 'RUNNING').length,
      stopped: servers.filter((s) => s.status === 'STOPPED').length,
      error: servers.filter((s) => s.status === 'ERROR').length,
    }
  }, [servers])

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Serveurs MCP</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gérez et supervisez vos serveurs MCP hébergés
          </p>
        </div>
        <Button asChild>
          <Link href="/app/servers/new">
            <Plus className="h-4 w-4 mr-2" />
            Nouveau serveur
          </Link>
        </Button>
      </div>

      {/* ── Summary chips ───────────────────────────────────────────────────────── */}
      {!isLoading && servers && servers.length > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-full border transition-colors',
              statusFilter === 'ALL'
                ? 'bg-foreground text-background border-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent hover:border-border',
            )}
          >
            <Server className="h-3.5 w-3.5" />
            {counts.total} au total
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'RUNNING' ? 'ALL' : 'RUNNING')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-full border transition-colors',
              statusFilter === 'RUNNING'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'text-muted-foreground hover:text-foreground border-transparent hover:border-border',
            )}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
            {counts.running} actif{counts.running !== 1 ? 's' : ''}
          </button>
          {counts.stopped > 0 && (
            <button
              onClick={() => setStatusFilter(statusFilter === 'STOPPED' ? 'ALL' : 'STOPPED')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-full border transition-colors',
                statusFilter === 'STOPPED'
                  ? 'bg-secondary text-secondary-foreground border-secondary'
                  : 'text-muted-foreground hover:text-foreground border-transparent hover:border-border',
              )}
            >
              <span className="h-2 w-2 rounded-full bg-secondary-foreground/40 inline-block" />
              {counts.stopped} arrêté{counts.stopped !== 1 ? 's' : ''}
            </button>
          )}
          {counts.error > 0 && (
            <button
              onClick={() => setStatusFilter(statusFilter === 'ERROR' ? 'ALL' : 'ERROR')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-full border transition-colors',
                statusFilter === 'ERROR'
                  ? 'bg-destructive text-destructive-foreground border-destructive'
                  : 'text-destructive hover:text-destructive border-transparent hover:border-border',
              )}
            >
              <span className="h-2 w-2 rounded-full bg-destructive inline-block" />
              {counts.error} en erreur
            </button>
          )}
        </div>
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Rechercher un serveur…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Runtime filter */}
        <Select
          value={runtimeFilter}
          onValueChange={(v) => setRuntimeFilter(v as RuntimeFilter)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Runtime" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les runtimes</SelectItem>
            <SelectItem value="CLOUDFLARE">☁️ Cloudflare</SelectItem>
            <SelectItem value="LOCAL">💻 Local</SelectItem>
          </SelectContent>
        </Select>

        {/* View toggle */}
        <div className="flex items-center rounded-md border overflow-hidden">
          <button
            onClick={() => setView('grid')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm transition-colors',
              view === 'grid'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('list')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-l',
              view === 'list'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        view === 'grid' ? <GridSkeletons /> : <ListSkeletons />
      ) : !servers || servers.length === 0 ? (
        /* Empty state — no servers at all */
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Server className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="font-semibold">Aucun serveur MCP</p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Créez votre premier serveur pour commencer à exposer des outils à vos agents IA.
            </p>
            <Button asChild>
              <Link href="/app/servers/new">
                <Plus className="h-4 w-4 mr-2" />
                Créer un serveur
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        /* Empty state — filters returned nothing */
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-sm">Aucun résultat</p>
            <p className="text-xs text-muted-foreground mt-1">
              Essayez de modifier les filtres ou la recherche.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => {
                setSearch('')
                setStatusFilter('ALL')
                setRuntimeFilter('ALL')
              }}
            >
              Réinitialiser les filtres
            </Button>
          </CardContent>
        </Card>
      ) : view === 'grid' ? (
        /* Grid view */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onRestart={(id) => restartServer.mutate(id)}
              onDelete={(id) => deleteServer.mutate(id)}
              isRestarting={restartServer.isPending && restartServer.variables === server.id}
              isDeleting={deleteServer.isPending && deleteServer.variables === server.id}
            />
          ))}
        </div>
      ) : (
        /* List view */
        <div className="rounded-lg border overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
            <span className="flex-[2]">Nom</span>
            <span className="w-24 shrink-0">Statut</span>
            <span className="w-28 shrink-0">Runtime</span>
            <span className="w-16 shrink-0">Tools</span>
            <span className="w-32 shrink-0">Credential</span>
            <span className="flex-[2]">Endpoint</span>
            <span className="w-24 shrink-0 text-right">Créé le</span>
            <span className="w-7 shrink-0" />
          </div>
          {filtered.map((server) => (
            <ServerRow
              key={server.id}
              server={server}
              onRestart={(id) => restartServer.mutate(id)}
              onDelete={(id) => deleteServer.mutate(id)}
              isRestarting={restartServer.isPending && restartServer.variables === server.id}
              isDeleting={deleteServer.isPending && deleteServer.variables === server.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
