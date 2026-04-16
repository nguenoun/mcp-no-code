'use client'

import * as React from 'react'
import { Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import type { ApiResponse } from '@mcpbuilder/shared'
import type { DeploymentStatusInfo } from '@/hooks/use-servers'

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifState = 'deploying' | 'success' | 'error'

interface RedeployNotificationProps {
  serverId: string
  visible: boolean
  onDismiss: () => void
}

// ─── RedeployNotification ─────────────────────────────────────────────────────

export function RedeployNotification({ serverId, visible, onDismiss }: RedeployNotificationProps) {
  const [state, setState] = React.useState<NotifState>('deploying')

  React.useEffect(() => {
    if (!visible) return
    setState('deploying')

    let dismissTimeout: ReturnType<typeof setTimeout>

    const interval = setInterval(async () => {
      try {
        const res = await apiClient.get<ApiResponse<DeploymentStatusInfo>>(
          `/api/v1/servers/${serverId}/deployment-status`,
        )
        const data = res.data.data

        if (data.healthCheck?.ok) {
          setState('success')
          clearInterval(interval)
          dismissTimeout = setTimeout(onDismiss, 3_000)
        } else if (data.status === 'ERROR') {
          setState('error')
          clearInterval(interval)
        }
      } catch {
        setState('error')
        clearInterval(interval)
      }
    }, 2_000)

    return () => {
      clearInterval(interval)
      clearTimeout(dismissTimeout)
    }
  }, [visible, serverId, onDismiss])

  if (!visible) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-2 fade-in">
      <div className="rounded-lg border bg-background shadow-lg px-4 py-3 flex items-start gap-3">
        {state === 'deploying' && (
          <>
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin mt-0.5 shrink-0" />
            <p className="text-sm">⚡ Redéploiement en cours sur Cloudflare Workers...</p>
          </>
        )}
        {state === 'success' && (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <p className="text-sm">✅ Serveur mis à jour et disponible</p>
          </>
        )}
        {state === 'error' && (
          <>
            <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="text-sm">❌ Erreur de déploiement</p>
              <a
                href={`/servers/${serverId}?tab=logs`}
                className="text-xs text-muted-foreground underline inline-flex items-center gap-1"
              >
                Voir les logs
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
