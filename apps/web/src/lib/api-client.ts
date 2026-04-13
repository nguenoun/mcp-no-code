'use client'

import axios, { type AxiosError } from 'axios'
import { getSession, signOut } from 'next-auth/react'
import type { ApiError } from '@mcpbuilder/shared'

export const apiClient = axios.create({
  baseURL: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000',
  headers: { 'Content-Type': 'application/json' },
})

// Inject Bearer token from NextAuth session on every request
apiClient.interceptors.request.use(async (config) => {
  const session = await getSession()
  if (session?.accessToken) {
    config.headers['Authorization'] = `Bearer ${session.accessToken}`
  }
  return config
})

// Handle 401 — token expired or invalid: force sign out
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    if (error.response?.status === 401) {
      await signOut({ callbackUrl: '/login' })
    }
    return Promise.reject(error.response?.data ?? error)
  },
)
