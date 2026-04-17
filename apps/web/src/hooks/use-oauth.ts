'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { ApiResponse } from '@mcpbuilder/shared'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OAuthApp {
  id: string
  name: string
  clientId: string
  redirectUris: string[]
  createdAt: string
  _count: { tokens: number }
}

export interface OAuthAppCreated extends OAuthApp {
  clientSecret: string
}

export interface OAuthSession {
  id: string
  scopes: string[]
  createdAt: string
  expiresAt: string
  client: { name: string }
  user: { email: string }
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

const oauthKeys = {
  apps: (serverId: string) => ['oauth', 'apps', serverId] as const,
  sessions: (serverId: string) => ['oauth', 'sessions', serverId] as const,
}

// ─── useOAuthApps ─────────────────────────────────────────────────────────────

export function useOAuthApps(serverId: string) {
  return useQuery({
    queryKey: oauthKeys.apps(serverId),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<OAuthApp[]>>(
        `/api/v1/servers/${serverId}/oauth/apps`,
      )
      return res.data.data
    },
    enabled: Boolean(serverId),
  })
}

// ─── useCreateOAuthApp ────────────────────────────────────────────────────────

export function useCreateOAuthApp(serverId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { name: string; redirectUris: string[] }) => {
      const res = await apiClient.post<ApiResponse<OAuthAppCreated>>(
        `/api/v1/servers/${serverId}/oauth/apps`,
        data,
      )
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: oauthKeys.apps(serverId) })
    },
  })
}

// ─── useDeleteOAuthApp ────────────────────────────────────────────────────────

export function useDeleteOAuthApp(serverId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (appId: string) => {
      await apiClient.delete(`/api/v1/servers/${serverId}/oauth/apps/${appId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: oauthKeys.apps(serverId) })
      queryClient.invalidateQueries({ queryKey: oauthKeys.sessions(serverId) })
    },
  })
}

// ─── useOAuthSessions ─────────────────────────────────────────────────────────

export function useOAuthSessions(serverId: string, enabled = true) {
  return useQuery({
    queryKey: oauthKeys.sessions(serverId),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<OAuthSession[]>>(
        `/api/v1/servers/${serverId}/oauth/sessions`,
      )
      return res.data.data
    },
    enabled: Boolean(serverId) && enabled,
  })
}

// ─── useRevokeSession ─────────────────────────────────────────────────────────

export function useRevokeSession(serverId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tokenId: string) => {
      await apiClient.delete(
        `/api/v1/servers/${serverId}/oauth/sessions/${tokenId}`,
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: oauthKeys.sessions(serverId) })
    },
  })
}

// ─── useRevokeAllSessions ─────────────────────────────────────────────────────

export function useRevokeAllSessions(serverId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/api/v1/servers/${serverId}/oauth/sessions`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: oauthKeys.sessions(serverId) })
    },
  })
}

// ─── useUpdateAuthMode ────────────────────────────────────────────────────────

export function useUpdateAuthMode(serverId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (authMode: 'API_KEY' | 'OAUTH') => {
      const res = await apiClient.put<ApiResponse<{ serverId: string; authMode: string }>>(
        `/api/v1/servers/${serverId}/auth-mode`,
        { authMode },
      )
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', 'detail', serverId] })
    },
  })
}
