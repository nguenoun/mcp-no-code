'use client'

import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { ApiResponse, ParsedOpenAPIResult } from '@mcpbuilder/shared'

async function parseImportResponse(
  res: { data: ApiResponse<ParsedOpenAPIResult> },
): Promise<ParsedOpenAPIResult> {
  if (!res.data.success) throw new Error('Import failed')
  return res.data.data
}

export function useImportFromUrl() {
  return useMutation({
    mutationFn: async ({
      url,
      workspaceId,
    }: {
      url: string
      workspaceId: string
    }): Promise<ParsedOpenAPIResult> => {
      const res = await apiClient.post<ApiResponse<ParsedOpenAPIResult>>(
        '/api/v1/import/openapi/url',
        { url, workspaceId },
      )
      return parseImportResponse(res)
    },
  })
}

export function useImportFromContent() {
  return useMutation({
    mutationFn: async ({
      content,
      workspaceId,
    }: {
      content: string
      workspaceId: string
    }): Promise<ParsedOpenAPIResult> => {
      const res = await apiClient.post<ApiResponse<ParsedOpenAPIResult>>(
        '/api/v1/import/openapi/content',
        { content, workspaceId },
      )
      return parseImportResponse(res)
    },
  })
}
