'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Plus, Activity, Zap, AlertTriangle, Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ServerCard } from '@/components/server-card/ServerCard'
import { useDefaultWorkspace, useWorkspaceStats } from '@/hooks/use-workspace'
import { useServers, useRestartServer, useDeleteServer } from '@/hooks/use-servers'
import { useMe } from '@/hooks/use-me'
import { cn } from '@/lib/utils'
import type { CallLog } from '@mcpbuilder/shared'

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  className,
}: {
  title: string
  value: string | number
  icon: React.ElementType
  loading?: boolean
  className?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn('h-4 w-4 text-muted-foreground', className)} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Recent activity ──────────────────────────────────────────────────────────

function RecentActivity({ logs }: { logs: CallLog[] }) {
  if (logs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Aucune activité récente.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-center justify-between gap-3 text-sm py-2 border-b last:border-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Badge
              variant={log.status === 'SUCCESS' ? 'secondary' : 'destructive'}
              className="text-xs shrink-0"
            >
              {log.status}
            </Badge>
            <span className="font-mono text-xs truncate">{log.toolName}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
            {log.latencyMs !== null && <span>{log.latencyMs}ms</span>}
            <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const { workspaceId, isLoading: workspaceLoading } = useDefaultWorkspace()
  const { data: me } = useMe()
  const { data: stats, isLoading: statsLoading } = useWorkspaceStats(workspaceId)
  const { data: servers, isLoading: serversLoading } = useServers(workspaceId)
  const restartServer = useRestartServer(workspaceId ?? '')
  const deleteServer = useDeleteServer(workspaceId ?? '')

  const isLoading = workspaceLoading || statsLoading

  useEffect(() => {
    if (me && servers && !me.hasCompletedOnboarding && servers.length === 0) {
      router.replace('/onboarding')
    }
  }, [me, servers, router])

  return (
    <div className="space-y-8">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Vue d&apos;ensemble de votre workspace
          </p>
        </div>
        <Button asChild>
          <Link href="/servers/new">
            <Plus className="h-4 w-4 mr-2" />
            Nouveau serveur
          </Link>
        </Button>
      </div>

      {/* ── Stats row ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Serveurs actifs"
          value={stats?.activeServers ?? 0}
          icon={Activity}
          loading={isLoading}
          className="text-emerald-500"
        />
        <StatCard
          title="Appels aujourd'hui"
          value={stats?.callsToday ?? 0}
          icon={Zap}
          loading={isLoading}
        />
        <StatCard
          title="Erreurs (24h)"
          value={stats?.errorsToday ?? 0}
          icon={AlertTriangle}
          loading={isLoading}
          className={stats?.errorsToday ? 'text-destructive' : undefined}
        />
        <StatCard
          title="Latence moyenne"
          value={stats ? `${stats.avgLatencyMs}ms` : '—'}
          icon={Clock}
          loading={isLoading}
        />
      </div>

      {/* ── Servers grid ──────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Vos serveurs MCP</h2>
          {servers && servers.length > 0 && (
            <span className="text-sm text-muted-foreground">{servers.length} serveur{servers.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {serversLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-64 mt-2" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : servers && servers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {servers.map((server) => (
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
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="h-10 w-10 text-muted-foreground/40 mb-4" />
              <p className="font-medium text-sm">Aucun serveur MCP</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Créez votre premier serveur MCP pour commencer.
              </p>
              <Button asChild size="sm">
                <Link href="/servers/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Créer un serveur
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ── Recent activity ────────────────────────────────────────────────────── */}
      {servers && servers.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Activité récente</h2>
          <Card>
            <CardContent className="pt-4">
              {workspaceLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <RecentActivity logs={[]} />
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}
