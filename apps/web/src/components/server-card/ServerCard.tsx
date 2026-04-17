'use client'

import * as React from 'react'
import Link from 'next/link'
import { Copy, Check, MoreVertical, RefreshCw, Trash2, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ServerWithMeta } from '@/hooks/use-servers'

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

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ value, label = 'Copier' }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
      onClick={handleCopy}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copié' : label}
    </Button>
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

// ─── ServerCard ───────────────────────────────────────────────────────────────

export interface ServerCardProps {
  server: ServerWithMeta
  onRestart: (serverId: string) => void
  onDelete: (serverId: string) => void
  isRestarting?: boolean
  isDeleting?: boolean
}

export function ServerCard({
  server,
  onRestart,
  onDelete,
  isRestarting = false,
  isDeleting = false,
}: ServerCardProps) {
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const toolCount = server._count?.tools ?? 0

  return (
    <>
      <Card className={cn('transition-opacity', isDeleting && 'opacity-50 pointer-events-none')}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            {/* Name + status */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/app/servers/${server.id}`}
                  className="font-semibold text-sm hover:underline truncate"
                >
                  {server.name}
                </Link>
                <StatusBadge status={server.status} />
                {server.runtimeMode === 'CLOUDFLARE' ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className="text-xs px-1.5 py-0 border-orange-300 text-orange-600 cursor-default"
                        >
                          ☁️ Cloudflare
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Hébergé sur Cloudflare Workers — Edge global</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
                    💻 Local
                  </Badge>
                )}
              </div>
              {server.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {server.description}
                </p>
              )}
            </div>

            {/* Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
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
                <DropdownMenuItem
                  onClick={() => onRestart(server.id)}
                  disabled={isRestarting}
                >
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
        </CardHeader>

        <CardContent className="pt-0 space-y-3">
          {/* Meta row */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{toolCount} tool{toolCount !== 1 ? 's' : ''}</span>
            {server.credential && (
              <span className="truncate">
                {server.credential.name}
              </span>
            )}
          </div>

          {/* Endpoint URL + copy */}
          {server.endpointUrl && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5">
              <code className="flex-1 text-xs truncate text-muted-foreground font-mono">
                {server.endpointUrl}
              </code>
              <CopyButton value={server.endpointUrl} />
            </div>
          )}
        </CardContent>
      </Card>

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
