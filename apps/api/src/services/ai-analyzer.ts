// ─── AI Analyzer — README → MCP tools via Claude ─────────────────────────────
//
// Used as a fallback when no OpenAPI spec is found in the repository.
// Sends the README content to Claude and asks it to extract REST API endpoints.

import type { CandidateTool } from './github-import-service'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001'
const MAX_README_CHARS = 8_000
const MAX_TOOLS = 30

const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

type AnthropicResponse = {
  content: Array<{ type: string; text: string }>
}

type RawTool = {
  name?: unknown
  description?: unknown
  httpMethod?: unknown
  httpPath?: unknown
  parametersSchema?: unknown
  confidence?: unknown
}

export async function analyzeWithAI(params: {
  readme: string
  repoName: string
  repoDescription: string | null
  baseUrl?: string
}): Promise<CandidateTool[]> {
  const { readme, repoName, repoDescription, baseUrl } = params

  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set — AI analysis is unavailable')

  const truncated = readme.slice(0, MAX_README_CHARS)

  const prompt = buildPrompt({
    repoName,
    repoDescription,
    readme: truncated,
    ...(baseUrl !== undefined && { baseUrl }),
  })

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = (await res.json()) as AnthropicResponse
  const text = data.content.find((c) => c.type === 'text')?.text ?? '[]'

  return parseAIResponse(text, baseUrl)
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildPrompt(params: {
  repoName: string
  repoDescription: string | null
  baseUrl?: string
  readme: string
}): string {
  const { repoName, repoDescription, baseUrl, readme } = params
  const lines: string[] = [
    'You are analyzing a GitHub repository README to extract REST API endpoints.',
    '',
    `Repository: ${repoName}`,
  ]
  if (repoDescription) lines.push(`Description: ${repoDescription}`)
  if (baseUrl) lines.push(`Base URL provided by user: ${baseUrl}`)
  lines.push(
    '',
    'README content:',
    '---',
    readme,
    '---',
    '',
    'Extract all REST API endpoints and return them as a JSON array.',
    'Each item must have:',
    '- name: tool name using only alphanumeric chars and hyphens (e.g. "list-users", max 64 chars)',
    '- description: brief description of what the endpoint does (max 200 chars)',
    '- httpMethod: one of GET, POST, PUT, PATCH, DELETE',
    '- httpPath: the URL path (e.g. "/users/{id}" or full URL if base is known)',
    '- parametersSchema: JSON Schema object describing path, query, and body parameters',
    '- confidence: "high" (clearly documented), "medium" (inferred), or "low" (uncertain)',
    '',
    'Rules:',
    '- Return ONLY a valid JSON array, no prose, no markdown code blocks',
    '- If no endpoints found, return []',
    `- Limit to ${MAX_TOOLS} endpoints`,
    '- Omit endpoints that are clearly authentication-only (login, logout, token)',
    '',
    'Example output:',
    '[',
    '  {',
    '    "name": "list-users",',
    '    "description": "List all users with pagination",',
    '    "httpMethod": "GET",',
    '    "httpPath": "/users",',
    '    "parametersSchema": {',
    '      "type": "object",',
    '      "properties": {',
    '        "page": { "type": "integer", "description": "Page number" },',
    '        "limit": { "type": "integer", "description": "Max results per page" }',
    '      }',
    '    },',
    '    "confidence": "high"',
    '  }',
    ']',
  )
  return lines.join('\n')
}

function parseAIResponse(text: string, baseUrl?: string): CandidateTool[] {
  // Extract JSON array from response (Claude sometimes wraps in prose)
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []

  let raw: RawTool[]
  try {
    raw = JSON.parse(match[0]) as RawTool[]
  } catch {
    return []
  }

  if (!Array.isArray(raw)) return []

  return raw
    .slice(0, MAX_TOOLS)
    .filter(
      (t) =>
        typeof t.name === 'string' &&
        typeof t.httpMethod === 'string' &&
        typeof t.httpPath === 'string' &&
        VALID_METHODS.has(String(t.httpMethod).toUpperCase()),
    )
    .map((t) => {
      const path = String(t.httpPath)
      const httpUrl =
        baseUrl && !path.startsWith('http')
          ? `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`
          : path

      return {
        name: sanitizeToolName(String(t.name)),
        description: String(t.description ?? '').slice(0, 200),
        httpMethod: String(t.httpMethod).toUpperCase() as CandidateTool['httpMethod'],
        httpUrl,
        parametersSchema: isPlainObject(t.parametersSchema) ? t.parametersSchema : {},
        confidence: toConfidence(t.confidence),
      }
    })
    .filter((t) => t.name.length > 0)
}

function sanitizeToolName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'tool'
  ).slice(0, 64)
}

function toConfidence(v: unknown): 'high' | 'medium' | 'low' {
  if (v === 'high' || v === 'medium' || v === 'low') return v
  return 'medium'
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
