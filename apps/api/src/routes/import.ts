import { Router } from 'express'
import { z } from 'zod'
import { OpenAPIParser } from '@mcpbuilder/mcp-runtime'
import { ERROR_CODES } from '@mcpbuilder/shared'
import type { ApiResponse, ParsedOpenAPIResult } from '@mcpbuilder/shared'
import { authMiddleware } from '../middleware/auth'
import { AppError } from '../lib/errors'
import { checkRateLimit, importRateLimitKey } from '../lib/rate-limiter'
import { analyzeGithubRepo, type GithubAnalyzeResult } from '../services/github-import-service'

const router = Router()
const parser = new OpenAPIParser()

const IMPORT_RATE_LIMIT = 10
const IMPORT_RATE_WINDOW = 60 * 60 // 1 hour
const MAX_CONTENT_BYTES = 5 * 1024 * 1024 // 5 MB

// ─── Schemas ──────────────────────────────────────────────────────────────────

const PRIVATE_IP_RE =
  /^(10\.|127\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|::1|localhost)/i

const urlImportSchema = z.object({
  url: z
    .string()
    .url('Must be a valid URL')
    .refine((u) => u.startsWith('https://'), 'Only HTTPS URLs are allowed')
    .refine((u) => {
      try {
        const { hostname } = new URL(u)
        return !PRIVATE_IP_RE.test(hostname)
      } catch {
        return false
      }
    }, 'URL must not point to a private or loopback address'),
  workspaceId: z.string().cuid('Invalid workspace ID'),
})

const contentImportSchema = z.object({
  content: z
    .string()
    .min(1, 'Content cannot be empty')
    .max(MAX_CONTENT_BYTES, `Content must be under ${MAX_CONTENT_BYTES / 1024 / 1024} MB`),
  workspaceId: z.string().cuid('Invalid workspace ID'),
})

// ─── POST /import/openapi/url ─────────────────────────────────────────────────

router.post('/openapi/url', authMiddleware, async (req, res, next) => {
  try {
    const { url, workspaceId } = urlImportSchema.parse(req.body)

    await checkRateLimit(importRateLimitKey(workspaceId), IMPORT_RATE_LIMIT, IMPORT_RATE_WINDOW)

    let result: ParsedOpenAPIResult
    try {
      result = await parser.parseFromUrl(url)
    } catch (err) {
      throw new AppError(
        ERROR_CODES.IMPORT_FETCH_FAILED,
        err instanceof Error ? err.message : 'Failed to fetch or parse OpenAPI spec',
        422,
      )
    }

    const response: ApiResponse<ParsedOpenAPIResult> = {
      success: true,
      data: {
        ...result,
        // Never send the full raw spec to the client — it can be very large
        rawSpec: {},
      },
    }
    res.json(response)
  } catch (err) {
    next(err)
  }
})

// ─── POST /import/openapi/content ─────────────────────────────────────────────

router.post('/openapi/content', authMiddleware, async (req, res, next) => {
  try {
    const { content, workspaceId } = contentImportSchema.parse(req.body)

    await checkRateLimit(importRateLimitKey(workspaceId), IMPORT_RATE_LIMIT, IMPORT_RATE_WINDOW)

    let result: ParsedOpenAPIResult
    try {
      result = await parser.parseFromContent(content)
    } catch (err) {
      throw new AppError(
        ERROR_CODES.INVALID_OPENAPI_SPEC,
        err instanceof Error ? err.message : 'Invalid OpenAPI specification',
        422,
      )
    }

    const response: ApiResponse<ParsedOpenAPIResult> = {
      success: true,
      data: { ...result, rawSpec: {} },
    }
    res.json(response)
  } catch (err) {
    next(err)
  }
})

// ─── POST /import/github ─────────────────────────────────────────────────────
//
// Standalone GitHub analysis — does not require an existing server.
// Used during server creation to extract tools before the server exists.

const githubImportSchema = z.object({
  repoUrl: z
    .string()
    .url('Must be a valid URL')
    .refine((u) => {
      try {
        return new URL(u).hostname === 'github.com'
      } catch {
        return false
      }
    }, 'Only github.com repositories are supported'),
  branch: z.string().max(255).optional(),
  githubToken: z.string().max(200).optional(),
  baseUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
})

router.post('/github', authMiddleware, async (req, res, next) => {
  try {
    const body = githubImportSchema.parse(req.body)

    let result: GithubAnalyzeResult
    try {
      result = await analyzeGithubRepo({
        repoUrl: body.repoUrl,
        ...(body.branch !== undefined && { branch: body.branch }),
        ...(body.githubToken !== undefined && { githubToken: body.githubToken }),
        ...(body.baseUrl !== undefined && { baseUrl: body.baseUrl }),
      })
    } catch (err) {
      throw new AppError(
        ERROR_CODES.IMPORT_FETCH_FAILED,
        err instanceof Error ? err.message : 'Failed to analyze repository',
        422,
      )
    }

    res.json({ success: true, data: result } satisfies ApiResponse<GithubAnalyzeResult>)
  } catch (err) {
    next(err)
  }
})

export default router
