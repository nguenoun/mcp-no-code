import { ERROR_CODES, ErrorCode } from '@mcpbuilder/shared'

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }

  static notFound(resource: string): AppError {
    return new AppError(ERROR_CODES.NOT_FOUND, `${resource} not found`, 404)
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(ERROR_CODES.UNAUTHORIZED, message, 401)
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(ERROR_CODES.FORBIDDEN, message, 403)
  }

  static conflict(message: string): AppError {
    return new AppError(ERROR_CODES.ALREADY_EXISTS, message, 409)
  }

  static planLimit(message: string): AppError {
    return new AppError(ERROR_CODES.PLAN_LIMIT_REACHED, message, 403)
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(ERROR_CODES.VALIDATION_ERROR, message, 422, details)
  }
}
