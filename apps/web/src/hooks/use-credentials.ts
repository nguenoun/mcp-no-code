'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { ApiResponse } from '@mcpbuilder/shared'
import { CredentialType } from '@mcpbuilder/shared'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SafeCredential {
  id: string
  workspaceId: string
  name: string
  type: CredentialType
  createdAt: string
}

export type CreateCredentialInput =
  | { name: string; type: 'API_KEY'; value: string }
  | { name: string; type: 'BEARER'; value: string }
  | { name: string; type: 'BASIC_AUTH'; value: { username: string; password: string } }

export interface TestCredentialResult {
  ok: boolean
  statusCode: number | null
  latencyMs: number
  error: string | null
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

export const credentialKeys = {
  all: (workspaceId: string) => ['credentials', workspaceId] as const,
  list: (workspaceId: string) => ['credentials', workspaceId, 'list'] as const,
}

// ─── useCredentials ───────────────────────────────────────────────────────────

export function useCredentials(workspaceId: string) {
  return useQuery({
    queryKey: credentialKeys.list(workspaceId),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<SafeCredential[]>>(
        `/api/v1/workspaces/${workspaceId}/credentials`,
      )
      return res.data.data
    },
    enabled: Boolean(workspaceId),
  })
}

// ─── useCreateCredential ──────────────────────────────────────────────────────

export function useCreateCredential(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateCredentialInput) => {
      const res = await apiClient.post<ApiResponse<SafeCredential>>(
        `/api/v1/workspaces/${workspaceId}/credentials`,
        data,
      )
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: credentialKeys.all(workspaceId) })
    },
  })
}

// ─── useDeleteCredential ──────────────────────────────────────────────────────

export function useDeleteCredential(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (credentialId: string) => {
      await apiClient.delete(
        `/api/v1/workspaces/${workspaceId}/credentials/${credentialId}`,
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: credentialKeys.all(workspaceId) })
    },
  })
}

// ─── useTestCredential ────────────────────────────────────────────────────────

export function useTestCredential(workspaceId: string) {
  return useMutation({
    mutationFn: async ({
      credentialId,
      url,
    }: {
      credentialId: string
      url: string
    }) => {
      const res = await apiClient.post<ApiResponse<TestCredentialResult>>(
        `/api/v1/workspaces/${workspaceId}/credentials/${credentialId}/test`,
        { url },
      )
      return res.data.data
    },
  })
}
