import { Plan, ServerStatus, CredentialType } from '../types/models.js'

// ─── Plans ───────────────────────────────────────────────────────────────────

export const PLANS = {
  [Plan.FREE]: {
    label: 'Free',
    maxWorkspaces: 1,
    maxServersPerWorkspace: 2,
    maxToolsPerServer: 5,
    maxCallLogsRetentionDays: 7,
  },
  [Plan.PRO]: {
    label: 'Pro',
    maxWorkspaces: 5,
    maxServersPerWorkspace: 10,
    maxToolsPerServer: 50,
    maxCallLogsRetentionDays: 30,
  },
  [Plan.TEAM]: {
    label: 'Team',
    maxWorkspaces: 20,
    maxServersPerWorkspace: 50,
    maxToolsPerServer: 200,
    maxCallLogsRetentionDays: 90,
  },
  [Plan.ENTERPRISE]: {
    label: 'Enterprise',
    maxWorkspaces: Infinity,
    maxServersPerWorkspace: Infinity,
    maxToolsPerServer: Infinity,
    maxCallLogsRetentionDays: 365,
  },
} as const

// ─── Labels ───────────────────────────────────────────────────────────────────

export const SERVER_STATUS_LABELS: Record<ServerStatus, string> = {
  [ServerStatus.RUNNING]: 'Running',
  [ServerStatus.STOPPED]: 'Stopped',
  [ServerStatus.ERROR]: 'Error',
}

export const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  [CredentialType.API_KEY]: 'API Key',
  [CredentialType.BEARER]: 'Bearer Token',
  [CredentialType.BASIC_AUTH]: 'Basic Auth',
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

// ─── Error codes ──────────────────────────────────────────────────────────────

export const ERROR_CODES = {
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  // Resources
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  // Plan
  PLAN_LIMIT_REACHED: 'PLAN_LIMIT_REACHED',
  // MCP runtime
  SERVER_START_FAILED: 'SERVER_START_FAILED',
  SERVER_STOP_FAILED: 'SERVER_STOP_FAILED',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  // Import
  INVALID_OPENAPI_SPEC: 'INVALID_OPENAPI_SPEC',
  IMPORT_FETCH_FAILED: 'IMPORT_FETCH_FAILED',
  // Internal
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

// ─── Misc ─────────────────────────────────────────────────────────────────────

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const MAX_SLUG_LENGTH = 48
export const MIN_PASSWORD_LENGTH = 8
