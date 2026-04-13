import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { ApiError } from '@mcpbuilder/shared'
import { AppError } from '../lib/errors'
import { logger } from '../lib/logger'

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const body: ApiError = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    }
    res.status(err.statusCode).json(body)
    return
  }

  if (err instanceof ZodError) {
    const body: ApiError = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.flatten(),
      },
    }
    res.status(422).json(body)
    return
  }

  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error')

  const body: ApiError = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  }
  res.status(500).json(body)
}
