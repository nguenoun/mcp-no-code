'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { ApiResponse, Workspace } from '@mcpbuilder/shared'

// ─── Keys ─────────────────────────────────────────────────────────────────────

export const workspaceKeys = {
  all: ['workspaces'] as const,
  stats: (workspaceId: string) => ['workspaces', workspaceId, 'stats'] as const,
}

// ─── useWorkspaces ────────────────────────────────────────────────────────────

export function useWorkspaces() {
  return useQuery({
    queryKey: workspaceKeys.all,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Workspace[]>>('/api/v1/workspaces')
      return res.data.data
    },
    staleTime: 5 * 60 * 1000,
  })
}

/** Returns the first workspace (the default one created at registration) */
export function useDefaultWorkspace() {
  const query = useWorkspaces()
  return {
    ...query,
    data: query.data?.[0] ?? null,
    workspaceId: query.data?.[0]?.id ?? null,
  }
}

// ─── WorkspaceStats ───────────────────────────────────────────────────────────

export interface WorkspaceStats {
  activeServers: number
  callsToday: number
  errorsToday: number
  avgLatencyMs: number
}

export function useWorkspaceStats(workspaceId: string | null) {
  return useQuery({
    queryKey: workspaceKeys.stats(workspaceId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<WorkspaceStats>>(
        `/api/v1/workspaces/${workspaceId}/stats`,
      )
      return res.data.data
    },
    enabled: Boolean(workspaceId),
    refetchInterval: 30_000,
  })
}
