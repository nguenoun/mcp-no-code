'use client'

import * as React from 'react'
import { Pencil, Trash2, MoreVertical, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
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
import { cn } from '@/lib/utils'
import type { McpTool } from '@mcpbuilder/shared'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolCardProps {
  tool: McpTool
  onEdit: (tool: McpTool) => void
  onToggle: (toolId: string, isEnabled: boolean) => void
  onDelete: (toolId: string, confirm: boolean) => void
  isToggling?: boolean
  isDeleting?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const METHOD_BADGE_VARIANT: Record<HttpMethod, string> = {
  GET: 'get',
  POST: 'post',
  PUT: 'put',
  PATCH: 'patch',
  DELETE: 'delete',
}

function truncate(text: string, max = 100): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}

function paramCount(schema: unknown): number {
  if (!schema || typeof schema !== 'object') return 0
  const props = (schema as Record<string, unknown>).properties
  if (!props || typeof props !== 'object') return 0
  return Object.keys(props).length
}

// ─── Delete confirmation dialog ───────────────────────────────────────────────

interface DeleteConfirmProps {
  tool: McpTool
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (hard: boolean) => void
  isDeleting: boolean
}

function DeleteConfirmDialog({
  tool,
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: DeleteConfirmProps) {
  const isSoftDeleted = !tool.isEnabled

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {isSoftDeleted ? 'Supprimer définitivement ?' : 'Désactiver le tool ?'}
          </DialogTitle>
          <DialogDescription>
            {isSoftDeleted ? (
              <>
                Le tool <strong>{tool.name}</strong> est déjà désactivé. Voulez-vous le supprimer
                définitivement ? Cette action est irréversible.
              </>
            ) : (
              <>
                Le tool <strong>{tool.name}</strong> sera désactivé. Vous pourrez le supprimer
                définitivement ensuite.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Annuler
          </Button>
          {isSoftDeleted ? (
            <Button
              variant="destructive"
              onClick={() => onConfirm(true)}
              disabled={isDeleting}
            >
              {isDeleting ? 'Suppression…' : 'Supprimer définitivement'}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={() => onConfirm(false)}
              disabled={isDeleting}
            >
              {isDeleting ? 'Désactivation…' : 'Désactiver'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── ToolCard ─────────────────────────────────────────────────────────────────

export function ToolCard({
  tool,
  onEdit,
  onToggle,
  onDelete,
  isToggling = false,
  isDeleting = false,
}: ToolCardProps) {
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const numParams = paramCount(tool.parametersSchema)

  return (
    <>
      <div
        className={cn(
          'rounded-lg border bg-card p-4 transition-opacity',
          !tool.isEnabled && 'opacity-60',
        )}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Badge
              variant={
                (METHOD_BADGE_VARIANT[tool.httpMethod as HttpMethod] ??
                  'secondary') as Parameters<typeof Badge>[0]['variant']
              }
              className="shrink-0 font-mono text-xs"
            >
              {tool.httpMethod}
            </Badge>
            <span className="font-semibold text-sm truncate">{tool.name}</span>
            {!tool.isEnabled && (
              <Badge variant="secondary" className="shrink-0 text-xs">
                Désactivé
              </Badge>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Enable / Disable toggle */}
            <Switch
              checked={tool.isEnabled}
              onCheckedChange={(v) => onToggle(tool.id, v)}
              disabled={isToggling}
              aria-label={tool.isEnabled ? 'Désactiver le tool' : 'Activer le tool'}
            />

            {/* Edit button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(tool)}
              aria-label="Modifier"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>

            {/* More actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Plus d'actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(tool)}>
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  Modifier
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

        {/* Description */}
        {tool.description ? (
          <p className="mt-2 text-sm text-muted-foreground leading-snug">
            {truncate(tool.description, 100)}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground italic">Aucune description.</p>
        )}

        {/* Meta row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono truncate max-w-[280px]">{tool.httpUrl}</span>
          {numParams > 0 && (
            <span>
              {numParams} paramètre{numParams > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <DeleteConfirmDialog
        tool={tool}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={(hard) => {
          onDelete(tool.id, hard)
          setDeleteOpen(false)
        }}
        isDeleting={isDeleting}
      />
    </>
  )
}
