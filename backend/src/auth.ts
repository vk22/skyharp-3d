import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET
const TOKEN_EXPIRY = '30d'

export interface AuthTokenPayload {
  sub: string
  username: string
}

export function getJwtSecret(): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not set')
  }
  return JWT_SECRET
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_EXPIRY })
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined

  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' })
    return
  }

  try {
    req.user = jwt.verify(token, getJwtSecret()) as AuthTokenPayload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
