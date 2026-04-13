import type { AuthTokenPayload } from '@mcpbuilder/shared'

declare global {
  namespace Express {
    interface Request {
      user: AuthTokenPayload
    }
  }
}
