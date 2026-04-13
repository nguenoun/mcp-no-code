import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../lib/jwt'
import { AppError } from '../lib/errors'

export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const authHeader = req.headers['authorization']
    if (!authHeader?.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing or invalid Authorization header')
    }
    const token = authHeader.slice(7)
    req.user = verifyAccessToken(token)
    next()
  } catch (err) {
    if (err instanceof AppError) {
      next(err)
    } else {
      next(AppError.unauthorized('Invalid or expired token'))
    }
  }
}
