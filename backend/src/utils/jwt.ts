import jwt from 'jsonwebtoken'

const DEFAULT_SECRET = 'development-secret-change-in-production'

function getSecret(): string {
  return process.env.JWT_SECRET || DEFAULT_SECRET
}

export interface JWTPayload {
  userId: number
  email: string
  role: 'admin' | 'project_manager' | 'user'
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '7d' })
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, getSecret()) as JWTPayload
}
