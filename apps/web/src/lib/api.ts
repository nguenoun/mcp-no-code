import axios from 'axios'
import type { ApiResult } from '@mcpbuilder/shared'

export const apiClient = axios.create({
  baseURL: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response) {
      return Promise.reject(error.response.data as ApiResult<never>)
    }
    return Promise.reject(error)
  },
)
