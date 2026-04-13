// ─── Enums ───────────────────────────────────────────────────────────────────

export enum Plan {
  FREE = 'FREE',
  PRO = 'PRO',
  TEAM = 'TEAM',
  ENTERPRISE = 'ENTERPRISE',
}

export enum ServerStatus {
  RUNNING = 'RUNNING',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR',
}

export enum CredentialType {
  API_KEY = 'API_KEY',
  BEARER = 'BEARER',
  BASIC_AUTH = 'BASIC_AUTH',
}

export enum CallStatus {
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

// ─── Model types (safe for API responses — no sensitive fields) ───────────────

export interface User {
  id: string
  email: string
  name: string | null
  googleId: string | null
  plan: Plan
  createdAt: Date
  updatedAt: Date
}

export interface Workspace {
  id: string
  name: string
  slug: string
  userId: string
  createdAt: Date
}

export interface McpServer {
  id: string
  workspaceId: string
  name: string
  description: string | null
  status: ServerStatus
  endpointUrl: string | null
  apiKey: string
  createdAt: Date
  updatedAt: Date
}

export interface McpTool {
  id: string
  mcpServerId: string
  name: string
  description: string | null
  httpMethod: string
  httpUrl: string
  parametersSchema: Record<string, unknown>
  headersConfig: Record<string, unknown>
  isEnabled: boolean
  createdAt: Date
}

/**
 * Credential sans encryptedValue — ne jamais exposer la valeur chiffrée dans les réponses API
 */
export interface Credential {
  id: string
  workspaceId: string
  name: string
  type: CredentialType
  createdAt: Date
}

export interface CallLog {
  id: string
  mcpServerId: string
  toolName: string
  status: CallStatus
  latencyMs: number | null
  errorMessage: string | null
  createdAt: Date
}
