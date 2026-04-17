'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Plus, Activity, Zap, AlertTriangle, Clock, Loader2, Server, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useDefaultWorkspace, useWorkspaceStats } from '@/hooks/use-workspace'
import { useServers } from '@/hooks/use-servers'
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

  const isLoading = workspaceLoading || statsLoading

  useEffect(() => {
    if (me && servers && !me.hasCompletedOnboarding && servers.length === 0) {
      router.replace('/app/onboarding')
    }
  }, [me, servers, router])

  const serverCount = servers?.length ?? 0
  const runningCount = servers?.filter((s) => s.status === 'RUNNING').length ?? 0

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
          <Link href="/app/servers/new">
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

      {/* ── Servers summary card ───────────────────────────────────────────────── */}
      <section>
        <Card>
          <CardContent className="flex items-center justify-between py-5 px-6">
            {serversLoading ? (
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-md" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ) : serverCount === 0 ? (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <Server className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Aucun serveur</p>
                  <p className="text-xs text-muted-foreground">
                    Créez votre premier serveur MCP pour commencer.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Server className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {serverCount} serveur{serverCount !== 1 ? 's' : ''} hébergé{serverCount !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {runningCount} actif{runningCount !== 1 ? 's' : ''} en ce moment
                  </p>
                </div>
              </div>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href="/app/servers" className="flex items-center gap-1.5">
                Gérer les serveurs
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* ── Recent activity ────────────────────────────────────────────────────── */}
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
    </div>
  )
}
