'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { ApiResponse, McpServer } from '@mcpbuilder/shared'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ServerWithMeta extends McpServer {
  credential?: { id: string; name: string; type: string } | null
  _count?: { tools: number }
}

export interface CreateServerData {
  name: string
  description?: string
  runtimeMode?: 'LOCAL' | 'CLOUDFLARE'
}

export interface DeploymentStatusInfo {
  status: string
  endpointUrl: string | null
  workerName: string | null
  workerApiStatus: string | null
  healthCheck: {
    ok: boolean
    latencyMs: number
    toolCount: number
  } | null
}

export interface RuntimeConfig {
  cloudflareConfigured: boolean
  defaultRuntimeMode: 'LOCAL' | 'CLOUDFLARE'
}

export interface UpdateServerData {
  name?: string
  description?: string
  credentialId?: string | null
}

export interface ServerStatusInfo {
  serverId: string
  dbStatus: string
  endpointUrl: string | null
  running: boolean
  port: number | null
  status: string
  toolCount: number
  startedAt: string | null
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

export const serverKeys = {
  all: (workspaceId: string) => ['servers', workspaceId] as const,
  list: (workspaceId: string) => ['servers', workspaceId, 'list'] as const,
  detail: (serverId: string) => ['servers', 'detail', serverId] as const,
  status: (serverId: string) => ['servers', 'status', serverId] as const,
  deploymentStatus: (serverId: string) => ['servers', 'deployment-status', serverId] as const,
}

// ─── useServers ───────────────────────────────────────────────────────────────

export function useServers(workspaceId: string | null) {
  return useQuery({
    queryKey: serverKeys.list(workspaceId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ServerWithMeta[]>>(
        `/api/v1/workspaces/${workspaceId}/servers`,
      )
      return res.data.data
    },
    enabled: Boolean(workspaceId),
    refetchInterval: 10_000,
  })
}

// ─── useServerStatus ──────────────────────────────────────────────────────────

export function useServerStatus(serverId: string | null) {
  return useQuery({
    queryKey: serverKeys.status(serverId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ServerStatusInfo>>(
        `/api/v1/servers/${serverId}/status`,
      )
      return res.data.data
    },
    enabled: Boolean(serverId),
    refetchInterval: 10_000,
  })
}

// ─── useCreateServer ──────────────────────────────────────────────────────────

export function useCreateServer(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateServerData) => {
      const res = await apiClient.post<ApiResponse<McpServer>>(
        `/api/v1/workspaces/${workspaceId}/servers`,
        data,
      )
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.all(workspaceId) })
    },
  })
}

// ─── useUpdateServer ──────────────────────────────────────────────────────────

export function useUpdateServer(serverId: string, workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: UpdateServerData) => {
      const res = await apiClient.put<ApiResponse<ServerWithMeta>>(
        `/api/v1/servers/${serverId}`,
        data,
      )
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.all(workspaceId) })
      queryClient.invalidateQueries({ queryKey: serverKeys.detail(serverId) })
    },
  })
}

// ─── useDeleteServer ──────────────────────────────────────────────────────────

export function useDeleteServer(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (serverId: string) => {
      const res = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(
        `/api/v1/servers/${serverId}`,
      )
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.all(workspaceId) })
    },
  })
}

// ─── useRestartServer ─────────────────────────────────────────────────────────

export function useRestartServer(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (serverId: string) => {
      const res = await apiClient.post<ApiResponse<{ serverId: string; endpointUrl: string }>>(
        `/api/v1/servers/${serverId}/restart`,
      )
      return res.data.data
    },
    onSuccess: (_, serverId) => {
      queryClient.invalidateQueries({ queryKey: serverKeys.all(workspaceId) })
      queryClient.invalidateQueries({ queryKey: serverKeys.status(serverId) })
    },
  })
}

// ─── useRotateApiKey ──────────────────────────────────────────────────────────

export function useRotateApiKey() {
  return useMutation({
    mutationFn: async (serverId: string) => {
      const res = await apiClient.post<ApiResponse<{ apiKey: string }>>(
        `/api/v1/servers/${serverId}/rotate-key`,
      )
      return res.data.data
    },
  })
}

// ─── useTestTool ──────────────────────────────────────────────────────────────

export interface ToolTestResult {
  httpStatus: number
  latencyMs: number
  body: string | null
  status: 'SUCCESS' | 'ERROR'
  error?: string
}

export function useTestTool(serverId: string) {
  return useMutation({
    mutationFn: async ({ toolId, args }: { toolId: string; args: Record<string, unknown> }) => {
      const res = await apiClient.post<ApiResponse<ToolTestResult>>(
        `/api/v1/servers/${serverId}/tools/${toolId}/test`,
        { args },
      )
      return res.data.data
    },
  })
}

// ─── useDeploymentStatus ──────────────────────────────────────────────────────

export function useDeploymentStatus(serverId: string | null, enabled = false) {
  return useQuery({
    queryKey: serverKeys.deploymentStatus(serverId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<DeploymentStatusInfo>>(
        `/api/v1/servers/${serverId}/deployment-status`,
      )
      return res.data.data
    },
    enabled: Boolean(serverId) && enabled,
    refetchInterval: enabled ? 2_000 : false,
  })
}

// ─── useDeploymentVerify ──────────────────────────────────────────────────────

export type CheckStatus = 'ok' | 'mismatch' | 'unknown' | 'fail'

export interface DeploymentVerification {
  applicable: boolean
  reason?: string
  workerReachable: boolean
  healthLatencyMs: number | null
  endpointUrl: string
  overallStatus: 'ok' | 'degraded' | 'error'
  checks: {
    serverId: { status: CheckStatus; worker: string | null; expected: string }
    authMode: { status: CheckStatus; worker: string | null; expected: string }
    toolCount: { status: CheckStatus; worker: number | null; expected: number }
    tools: { status: CheckStatus; missingFromWorker: string[]; extraInWorker: string[] }
    authRejection: { status: CheckStatus }
  }
}

export function useDeploymentVerify(serverId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.get<ApiResponse<DeploymentVerification>>(
        `/api/v1/servers/${serverId}/deployment-verify`,
      )
      return res.data.data
    },
  })
}

// ─── useRuntimeConfig ─────────────────────────────────────────────────────────

export function useRuntimeConfig() {
  return useQuery({
    queryKey: ['runtime-config'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<RuntimeConfig>>('/api/v1/servers/runtime-config')
      return res.data.data
    },
  })
}
