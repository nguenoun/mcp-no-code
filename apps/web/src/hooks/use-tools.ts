'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { ApiResponse, McpTool } from '@mcpbuilder/shared'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HeaderConfig {
  key: string
  value: string
  isSecret: boolean
}

export interface ToolFormData {
  name: string
  description: string
  httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  httpUrl: string
  parametersSchema: Record<string, unknown>
  headersConfig: HeaderConfig[]
  isEnabled: boolean
}

export interface PaginatedToolsResponse {
  tools: McpTool[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

export const toolKeys = {
  all: (serverId: string) => ['tools', serverId] as const,
  list: (serverId: string, page = 1, limit = 20) =>
    ['tools', serverId, 'list', page, limit] as const,
}

// ─── useTools ─────────────────────────────────────────────────────────────────

export function useTools(serverId: string, page = 1, limit = 20) {
  return useQuery({
    queryKey: toolKeys.list(serverId, page, limit),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<PaginatedToolsResponse>>(
        `/api/v1/servers/${serverId}/tools`,
        { params: { page, limit } },
      )
      return res.data.data
    },
    enabled: Boolean(serverId),
  })
}

// ─── useCreateTool ────────────────────────────────────────────────────────────

export function useCreateTool(serverId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: ToolFormData) => {
      const res = await apiClient.post<ApiResponse<McpTool & { redeployTriggered?: boolean }>>(
        `/api/v1/servers/${serverId}/tools`,
        data,
      )
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolKeys.all(serverId) })
    },
  })
}

// ─── useUpdateTool ────────────────────────────────────────────────────────────

export function useUpdateTool(serverId: string, toolId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: Partial<ToolFormData>) => {
      const res = await apiClient.put<ApiResponse<McpTool & { redeployTriggered?: boolean }>>(
        `/api/v1/servers/${serverId}/tools/${toolId}`,
        data,
      )
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolKeys.all(serverId) })
    },
  })
}

// ─── useToggleTool ────────────────────────────────────────────────────────────

export function useToggleTool(serverId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ toolId, isEnabled }: { toolId: string; isEnabled: boolean }) => {
      const res = await apiClient.put<ApiResponse<McpTool>>(
        `/api/v1/servers/${serverId}/tools/${toolId}`,
        { isEnabled },
      )
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolKeys.all(serverId) })
    },
  })
}

// ─── useDeleteTool ────────────────────────────────────────────────────────────

export function useDeleteTool(serverId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ toolId, confirm = false }: { toolId: string; confirm?: boolean }) => {
      const res = await apiClient.delete<ApiResponse<McpTool | { deleted: boolean }>>(
        `/api/v1/servers/${serverId}/tools/${toolId}`,
        { params: confirm ? { confirm: 'true' } : undefined },
      )
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolKeys.all(serverId) })
    },
  })
}
