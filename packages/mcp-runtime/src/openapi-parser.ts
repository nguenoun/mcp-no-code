import SwaggerParser from '@apidevtools/swagger-parser'
import type { OpenAPIV2, OpenAPIV3 } from 'openapi-types'
import { parse as parseYaml } from 'yaml'
import type { JSONSchema7, ParsedOpenAPIResult, ParsedTool } from '@mcpbuilder/shared'

const MAX_TOOLS = 50
const INCLUDED_PARAM_LOCATIONS = new Set(['path', 'query'])

// ─── Type guards ──────────────────────────────────────────────────────────────

function isV3(doc: object): doc is OpenAPIV3.Document {
  return 'openapi' in doc
}

function isV2(doc: object): doc is OpenAPIV2.Document {
  return 'swagger' in doc
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function generateOperationId(method: string, path: string): string {
  const parts = path
    .replace(/\{([^}]+)\}/g, (_, p: string) => `By${capitalize(p)}`)
    .split('/')
    .filter(Boolean)
    .map(capitalize)
  return `${method.toLowerCase()}${parts.join('')}`
}

function toSafeToolName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'tool'
  ).slice(0, 64)
}

function schemaToJSONSchema7(schema: unknown): JSONSchema7 {
  if (!schema || typeof schema !== 'object') return {}
  // Strip $ref and x-* vendor extensions for cleanliness
  const { $ref: _ref, ...rest } = schema as Record<string, unknown>
  return rest as JSONSchema7
}

function extractBaseUrlV3(doc: OpenAPIV3.Document): string {
  const server = doc.servers?.[0]
  if (!server?.url) return ''
  let url = server.url
  if (server.variables) {
    for (const [key, variable] of Object.entries(server.variables)) {
      url = url.replace(`{${key}}`, String(variable.default ?? ''))
    }
  }
  // Normalize trailing slash
  return url.replace(/\/$/, '')
}

function extractBaseUrlV2(doc: OpenAPIV2.Document): string {
  const scheme = doc.schemes?.[0] ?? 'https'
  const host = doc.host ?? ''
  const basePath = (doc.basePath ?? '/').replace(/\/$/, '')
  return host ? `${scheme}://${host}${basePath}` : ''
}

function buildParametersSchema(
  params: Array<OpenAPIV3.ParameterObject | OpenAPIV2.GeneralParameterObject>,
  requestBodyV3?: OpenAPIV3.RequestBodyObject | null,
  bodyParamV2?: OpenAPIV2.InBodyParameterObject | null,
): JSONSchema7 {
  const properties: Record<string, JSONSchema7> = {}
  const required: string[] = []

  for (const param of params) {
    if (!INCLUDED_PARAM_LOCATIONS.has(param.in)) continue

    // OpenAPIV3 params have .schema; V2 params embed type directly
    const rawSchema = (param as OpenAPIV3.ParameterObject).schema
    const schema: JSONSchema7 = rawSchema
      ? schemaToJSONSchema7(rawSchema)
      : { type: (param as OpenAPIV2.GeneralParameterObject).type ?? 'string' }

    properties[param.name] = {
      ...schema,
      description: param.description ?? schema.description,
    }

    if (param.required) required.push(param.name)
  }

  // OpenAPI 3.x requestBody
  if (requestBodyV3) {
    const mediaType =
      requestBodyV3.content['application/json'] ??
      requestBodyV3.content['application/x-www-form-urlencoded'] ??
      Object.values(requestBodyV3.content)[0]

    if (mediaType?.schema) {
      properties['body'] = {
        ...schemaToJSONSchema7(mediaType.schema),
        description: requestBodyV3.description ?? 'Request body',
      }
      if (requestBodyV3.required) required.push('body')
    }
  }

  // Swagger 2.x body parameter
  if (bodyParamV2?.schema) {
    properties['body'] = {
      ...schemaToJSONSchema7(bodyParamV2.schema),
      description: bodyParamV2.description ?? 'Request body',
    }
    if (bodyParamV2.required) required.push('body')
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 && { required }),
  }
}

function hasOperationSecurity(
  operation: OpenAPIV3.OperationObject | OpenAPIV2.OperationObject,
  globalSecurity: unknown[] | undefined,
): boolean {
  const opSec = operation.security
  if (opSec !== undefined) return opSec.length > 0
  return (globalSecurity?.length ?? 0) > 0
}

// ─── OpenAPIParser ────────────────────────────────────────────────────────────

export class OpenAPIParser {
  /**
   * Fetch and parse an OpenAPI spec from a URL.
   * URL validation (HTTPS-only, no private IPs) is the caller's responsibility.
   */
  async parseFromUrl(url: string): Promise<ParsedOpenAPIResult> {
    let api: object
    try {
      api = (await SwaggerParser.dereference(url)) as object
    } catch (err) {
      throw new Error(
        `Failed to load OpenAPI spec from URL: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    if (!isV3(api) && !isV2(api)) {
      throw new Error('Not a valid OpenAPI 3.x or Swagger 2.x specification')
    }
    return this.extractResult(api)
  }

  /**
   * Parse an OpenAPI spec from a JSON string, YAML string, or already-parsed object.
   */
  async parseFromContent(content: string | object): Promise<ParsedOpenAPIResult> {
    let spec: object

    if (typeof content === 'string') {
      try {
        const trimmed = content.trimStart()
        spec =
          trimmed.startsWith('{') || trimmed.startsWith('[')
            ? (JSON.parse(content) as object)
            : (parseYaml(content) as object)
      } catch (err) {
        throw new Error(
          `Invalid content — must be valid JSON or YAML: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    } else {
      spec = content
    }

    if (!spec || typeof spec !== 'object') {
      throw new Error('Content must be a non-null JSON/YAML object')
    }

    if (!isV3(spec) && !isV2(spec)) {
      throw new Error(
        'Not a valid OpenAPI 3.x or Swagger 2.x specification. Missing "openapi" or "swagger" field.',
      )
    }

    let api: object
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      api = (await SwaggerParser.dereference(spec as any)) as object
    } catch (err) {
      throw new Error(
        `Invalid OpenAPI specification: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    return this.extractResult(api)
  }

  private extractResult(api: object): ParsedOpenAPIResult {
    if (isV3(api)) return this.extractV3(api)
    if (isV2(api)) return this.extractV2(api)
    throw new Error('Unrecognized spec format')
  }

  // ─── OpenAPI 3.x ────────────────────────────────────────────────────────────

  private extractV3(doc: OpenAPIV3.Document): ParsedOpenAPIResult {
    const baseUrl = extractBaseUrlV3(doc)
    const title = doc.info?.title ?? 'Untitled API'
    const version = doc.info?.version ?? '1.0.0'
    const globalSecurity = doc.security
    const tools: ParsedTool[] = []

    for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
      if (!pathItem) continue

      const sharedParams = (pathItem.parameters ?? []) as OpenAPIV3.ParameterObject[]

      for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
        const operation = pathItem[method] as OpenAPIV3.OperationObject | undefined
        if (!operation) continue

        const opParams = (operation.parameters ?? []) as OpenAPIV3.ParameterObject[]
        const opParamNames = new Set(opParams.map((p) => p.name))
        const mergedParams = [...sharedParams.filter((p) => !opParamNames.has(p.name)), ...opParams]

        const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject | undefined

        tools.push({
          suggestedName: toSafeToolName(
            operation.operationId ?? generateOperationId(method, path),
          ),
          suggestedDescription:
            operation.summary ?? operation.description ?? `${method.toUpperCase()} ${path}`,
          httpMethod: method.toUpperCase(),
          httpPath: path,
          parametersSchema: buildParametersSchema(mergedParams, requestBody ?? null),
          requiresAuth: hasOperationSecurity(operation, globalSecurity),
        })
      }
    }

    return this.finalize(tools, { baseUrl, title, version, rawSpec: doc })
  }

  // ─── Swagger 2.x ────────────────────────────────────────────────────────────

  private extractV2(doc: OpenAPIV2.Document): ParsedOpenAPIResult {
    const baseUrl = extractBaseUrlV2(doc)
    const title = doc.info?.title ?? 'Untitled API'
    const version = doc.info?.version ?? '1.0.0'
    const globalSecurity = doc.security
    const tools: ParsedTool[] = []

    for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
      if (!pathItem) continue

      const sharedParams = (pathItem.parameters ?? []) as Array<
        OpenAPIV2.InBodyParameterObject | OpenAPIV2.GeneralParameterObject
      >

      for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
        const operation = pathItem[method] as OpenAPIV2.OperationObject | undefined
        if (!operation) continue

        const opParams = (operation.parameters ?? []) as Array<
          OpenAPIV2.InBodyParameterObject | OpenAPIV2.GeneralParameterObject
        >
        const opParamNames = new Set(
          opParams.map((p) => (p as OpenAPIV2.GeneralParameterObject).name),
        )
        const allParams = [
          ...sharedParams.filter(
            (p) => !opParamNames.has((p as OpenAPIV2.GeneralParameterObject).name),
          ),
          ...opParams,
        ]

        const bodyParam = allParams.find((p) => p.in === 'body') as
          | OpenAPIV2.InBodyParameterObject
          | undefined
        const nonBodyParams = allParams.filter(
          (p) => p.in !== 'body' && p.in !== 'formData',
        ) as OpenAPIV2.GeneralParameterObject[]

        tools.push({
          suggestedName: toSafeToolName(
            operation.operationId ?? generateOperationId(method, path),
          ),
          suggestedDescription:
            operation.summary ?? operation.description ?? `${method.toUpperCase()} ${path}`,
          httpMethod: method.toUpperCase(),
          httpPath: path,
          parametersSchema: buildParametersSchema(nonBodyParams, null, bodyParam ?? null),
          requiresAuth: hasOperationSecurity(operation, globalSecurity),
        })
      }
    }

    return this.finalize(tools, { baseUrl, title, version, rawSpec: doc })
  }

  private finalize(
    tools: ParsedTool[],
    meta: { baseUrl: string; title: string; version: string; rawSpec: object },
  ): ParsedOpenAPIResult {
    return {
      ...meta,
      tools: tools
        .sort((a, b) => a.suggestedName.localeCompare(b.suggestedName))
        .slice(0, MAX_TOOLS),
    }
  }
}
