'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { ApiResponse, CallLog } from '@mcpbuilder/shared'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaginatedLogsResponse {
  logs: CallLog[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface LogsFilter {
  page?: number
  limit?: number
  status?: 'SUCCESS' | 'ERROR'
  toolName?: string
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

export const logKeys = {
  all: (serverId: string) => ['logs', serverId] as const,
  list: (serverId: string, filter: LogsFilter) => ['logs', serverId, filter] as const,
}

// ─── useLogs ──────────────────────────────────────────────────────────────────

export function useLogs(serverId: string | null, filter: LogsFilter = {}) {
  const { page = 1, limit = 20, status, toolName } = filter

  return useQuery({
    queryKey: logKeys.list(serverId ?? '', filter),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: Record<string, any> = { page, limit }
      if (status) params['status'] = status
      if (toolName) params['toolName'] = toolName

      const res = await apiClient.get<ApiResponse<PaginatedLogsResponse>>(
        `/api/v1/servers/${serverId}/logs`,
        { params },
      )
      return res.data.data
    },
    enabled: Boolean(serverId),
    refetchInterval: 15_000,
  })
}
