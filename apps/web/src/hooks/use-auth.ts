'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { signIn, signOut } from 'next-auth/react'
import { apiClient } from '@/lib/api-client'
import type { ApiResponse, User } from '@mcpbuilder/shared'

// ─── Keys ─────────────────────────────────────────────────────────────────────

export const authKeys = {
  me: ['auth', 'me'] as const,
}

// ─── useMe ────────────────────────────────────────────────────────────────────

export function useMe() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<User>>('/api/v1/auth/me')
      return res.data.data
    },
    staleTime: 5 * 60 * 1000, // 5 min
    retry: false,
  })
}

// ─── useLogin ─────────────────────────────────────────────────────────────────

export function useLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })
      if (result?.error) {
        throw new Error('Invalid email or password')
      }
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me })
    },
  })
}

// ─── useRegister ──────────────────────────────────────────────────────────────

export function useRegister() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      name,
      email,
      password,
    }: {
      name: string
      email: string
      password: string
    }) => {
      // 1. Create account via API
      await apiClient.post('/api/v1/auth/register', { name, email, password })

      // 2. Sign in via NextAuth to get session
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })
      if (result?.error) {
        throw new Error('Account created but sign-in failed. Please log in manually.')
      }
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me })
    },
  })
}

// ─── useLogout ────────────────────────────────────────────────────────────────

export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (refreshToken?: string) => {
      if (refreshToken) {
        // Best-effort: invalidate refresh token server-side
        await apiClient.post('/api/v1/auth/logout', { refreshToken }).catch(() => {})
      }
      await signOut({ redirect: false })
    },
    onSuccess: () => {
      queryClient.clear()
    },
  })
}
