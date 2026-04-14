import crypto from 'crypto'

/**
 * Generates a cryptographically secure password reset token.
 * Returns both the plain token (to send via email) and a SHA-256 hash (to store in DB).
 * SHA-256 is used instead of bcrypt because:
 * 1. The token already has 256 bits of entropy, so bcrypt's slow hashing adds no security value
 * 2. SHA-256 is deterministic, enabling O(1) DB lookup by hash instead of O(n) bcrypt scan
 */
export function generatePasswordResetToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('hex') // 64 char hex = 256 bits entropy
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  return { token, tokenHash }
}

/**
 * Hashes a token with SHA-256 for DB lookup.
 * Since SHA-256 is deterministic, we can look up the token directly in the DB
 * instead of scanning all rows and comparing with bcrypt.
 */
export function hashPasswordResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Verifies a plain token against a stored SHA-256 hash.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyPasswordResetToken(token: string, tokenHash: string): boolean {
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(tokenHash))
  } catch {
    return false
  }
}

/**
 * Calculate expiry time (1 hour from now)
 */
export function getPasswordResetExpiry(): string {
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 1)
  return expiresAt.toISOString()
}
