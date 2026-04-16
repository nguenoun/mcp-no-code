'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiResponse, User } from '@mcpbuilder/shared'
import { apiClient } from '@/lib/api-client'

export const meKeys = {
  me: ['auth', 'me'] as const,
}

export function useMe() {
  return useQuery({
    queryKey: meKeys.me,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<User>>('/api/v1/auth/me')
      return res.data.data
    },
  })
}

export function usePatchMe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { hasCompletedOnboarding?: boolean }) => {
      const res = await apiClient.patch<ApiResponse<User>>('/api/v1/auth/me', payload)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meKeys.me })
    },
  })
}
