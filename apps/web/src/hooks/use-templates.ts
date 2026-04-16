'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiResponse, ServerTemplate } from '@mcpbuilder/shared'
import { apiClient } from '@/lib/api-client'
import { serverKeys } from './use-servers'

export type TemplateSummary = Omit<ServerTemplate, 'tools'> & {
  toolCount: number
}

export const templateKeys = {
  all: ['templates'] as const,
  list: ['templates', 'list'] as const,
  detail: (templateId: string) => ['templates', 'detail', templateId] as const,
}

export function useTemplates() {
  return useQuery({
    queryKey: templateKeys.list,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<TemplateSummary[]>>('/api/v1/templates')
      return res.data.data
    },
  })
}

export function useTemplate(templateId: string | null) {
  return useQuery({
    queryKey: templateKeys.detail(templateId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ServerTemplate>>(`/api/v1/templates/${templateId}`)
      return res.data.data
    },
    enabled: Boolean(templateId),
  })
}

export function useCreateServerFromTemplate(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      templateId,
      serverName,
      credentialId,
    }: {
      templateId: string
      serverName: string
      credentialId?: string
    }) => {
      const res = await apiClient.post<ApiResponse<{ id: string }>>(
        `/api/v1/workspaces/${workspaceId}/servers/from-template`,
        { templateId, serverName, credentialId },
      )
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.all(workspaceId) })
    },
  })
}
