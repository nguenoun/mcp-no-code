// ─── JSON Schema subset ───────────────────────────────────────────────────────

export interface JSONSchema7 {
  type?: string | string[]
  properties?: Record<string, JSONSchema7>
  required?: string[]
  description?: string
  items?: JSONSchema7
  enum?: unknown[]
  format?: string
  default?: unknown
  oneOf?: JSONSchema7[]
  anyOf?: JSONSchema7[]
  allOf?: JSONSchema7[]
  nullable?: boolean
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  example?: unknown
}

// ─── OpenAPI import types ─────────────────────────────────────────────────────

export interface ParsedTool {
  suggestedName: string
  suggestedDescription: string
  httpMethod: string
  httpPath: string
  parametersSchema: JSONSchema7
  requiresAuth: boolean
}

export interface ParsedOpenAPIResult {
  baseUrl: string
  title: string
  version: string
  tools: ParsedTool[]
  rawSpec: object
}

// ─── API request/response shapes for import routes ───────────────────────────

export interface ImportFromUrlBody {
  url: string
  workspaceId: string
}

export interface ImportFromContentBody {
  content: string
  workspaceId: string
}
