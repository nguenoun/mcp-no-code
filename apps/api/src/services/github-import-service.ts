// ─── GitHub Import Service — Orchestrator ────────────────────────────────────
//
// 1. Fetch repo content via GitHub API (github-fetcher)
// 2a. OpenAPI spec found → parse with existing OpenAPIParser
// 2b. No spec → send README to Claude AI (ai-analyzer)
// 3. Return a unified list of CandidateTool[]

import { OpenAPIParser } from '@mcpbuilder/mcp-runtime'
import { fetchGithubRepo } from './github-fetcher'
import { analyzeWithAI } from './ai-analyzer'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CandidateTool = {
  name: string
  description: string
  httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  httpUrl: string
  parametersSchema: Record<string, unknown>
  confidence: 'high' | 'medium' | 'low'
}

export type GithubAnalyzeResult = {
  source: 'openapi' | 'ai'
  baseUrl: string
  title: string
  tools: CandidateTool[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

function sanitizeToolName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'tool'
  ).slice(0, 64)
}

function parseGithubUrl(repoUrl: string): { owner: string; repo: string } {
  let url: URL
  try {
    url = new URL(repoUrl)
  } catch {
    throw new Error('Invalid URL')
  }
  if (url.hostname !== 'github.com') throw new Error('Only github.com repositories are supported')
  const parts = url.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/')
  if (parts.length < 2 || !parts[0] || !parts[1])
    throw new Error('Invalid GitHub URL — expected https://github.com/owner/repo')
  return { owner: parts[0], repo: parts[1] }
}

// ─── analyzeGithubRepo ────────────────────────────────────────────────────────

const parser = new OpenAPIParser()

export async function analyzeGithubRepo(params: {
  repoUrl: string
  branch?: string
  githubToken?: string
  baseUrl?: string
}): Promise<GithubAnalyzeResult> {
  const { repoUrl, branch, githubToken, baseUrl } = params
  const { owner, repo } = parseGithubUrl(repoUrl)

  const fetched = await fetchGithubRepo({ owner, repo, branch, token: githubToken })

  // ── OpenAPI path ──────────────────────────────────────────────────────────
  if (fetched.type === 'openapi') {
    const result = await parser.parseFromContent(fetched.content)
    const resolvedBase = (baseUrl || result.baseUrl || '').replace(/\/$/, '')

    const tools: CandidateTool[] = result.tools
      .filter((t) => VALID_METHODS.has(t.httpMethod.toUpperCase()))
      .map((t) => ({
        name: sanitizeToolName(t.suggestedName),
        description: t.suggestedDescription,
        httpMethod: t.httpMethod.toUpperCase() as CandidateTool['httpMethod'],
        httpUrl: resolvedBase
          ? `${resolvedBase}${t.httpPath.startsWith('/') ? '' : '/'}${t.httpPath}`
          : t.httpPath,
        parametersSchema: t.parametersSchema as Record<string, unknown>,
        confidence: 'high' as const,
      }))

    return {
      source: 'openapi',
      baseUrl: resolvedBase,
      title: result.title,
      tools,
    }
  }

  // ── AI fallback path ──────────────────────────────────────────────────────
  const tools = await analyzeWithAI({
    readme: fetched.content,
    repoName: fetched.repoName,
    repoDescription: fetched.repoDescription,
    baseUrl,
  })

  return {
    source: 'ai',
    baseUrl: baseUrl ?? '',
    title: fetched.repoName,
    tools,
  }
}
