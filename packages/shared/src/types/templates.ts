export type TemplateCategory = 'productivity' | 'developer' | 'data' | 'communication'

export type TemplateAuthType = 'API_KEY' | 'BEARER' | 'BASIC_AUTH' | 'NONE'

export interface TemplateToolConfig {
  name: string
  description: string
  httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  httpUrl: string
  parametersSchema: Record<string, unknown>
  headersConfig: Array<{ key: string; value: string; isSecret?: boolean }>
  isEnabled: boolean
}

export type ServerTemplate = {
  id: string
  name: string
  description: string
  category: TemplateCategory
  icon: string
  baseUrl: string
  authType: TemplateAuthType
  authHelpUrl?: string
  tools: TemplateToolConfig[]
}
