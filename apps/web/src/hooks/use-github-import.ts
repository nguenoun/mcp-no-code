'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { ApiResponse } from '@mcpbuilder/shared'
import { toolKeys, type ToolFormData } from '@/hooks/use-tools'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CandidateTool {
  name: string
  description: string
  httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  httpUrl: string
  parametersSchema: Record<string, unknown>
  confidence: 'high' | 'medium' | 'low'
}

export interface GithubAnalyzeResult {
  source: 'openapi' | 'ai'
  baseUrl: string
  title: string
  tools: CandidateTool[]
}

export interface AnalyzeParams {
  repoUrl: string
  branch?: string
  githubToken?: string
  baseUrl?: string
}

export interface ConfirmResult {
  created: number
  skipped: number
  redeployTriggered: boolean
}

// ─── useAnalyzeGithubRepo ─────────────────────────────────────────────────────

export function useAnalyzeGithubRepo(serverId: string) {
  return useMutation({
    mutationFn: async (params: AnalyzeParams) => {
      const res = await apiClient.post<ApiResponse<GithubAnalyzeResult>>(
        `/api/v1/servers/${serverId}/import/analyze`,
        params,
      )
      return res.data.data
    },
  })
}

// ─── useConfirmGithubImport ───────────────────────────────────────────────────

export function useConfirmGithubImport(serverId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tools: ToolFormData[]) => {
      const res = await apiClient.post<ApiResponse<ConfirmResult>>(
        `/api/v1/servers/${serverId}/import/confirm`,
        { tools },
      )
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolKeys.all(serverId) })
    },
  })
}
