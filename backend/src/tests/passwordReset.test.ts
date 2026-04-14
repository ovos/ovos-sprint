import { describe, it, expect } from 'vitest'
import { generatePasswordResetToken, verifyPasswordResetToken, hashPasswordResetToken, getPasswordResetExpiry } from '../utils/passwordReset.js'

describe('passwordReset utility', () => {
  describe('generatePasswordResetToken', () => {
    it('generates a token and hash that can be verified', () => {
      const { token, tokenHash } = generatePasswordResetToken()
      expect(verifyPasswordResetToken(token, tokenHash)).toBe(true)
    })

    it('generates a 64-character hex token (256 bits)', () => {
      const { token } = generatePasswordResetToken()
      expect(token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('produces a deterministic hash (SHA-256) suitable for direct DB lookup', () => {
      // With SHA-256, hashing the same token twice should produce the same hash
      // This is the key property that enables O(1) DB lookup instead of O(n) bcrypt scan
      const { token } = generatePasswordResetToken()
      const hash1 = hashPasswordResetToken(token)
      const hash2 = hashPasswordResetToken(token)
      expect(hash1).toBe(hash2)
    })

    it('rejects wrong token', () => {
      const { tokenHash } = generatePasswordResetToken()
      expect(verifyPasswordResetToken('wrong-token', tokenHash)).toBe(false)
    })

    it('generates unique tokens each time', () => {
      const a = generatePasswordResetToken()
      const b = generatePasswordResetToken()
      expect(a.token).not.toBe(b.token)
      expect(a.tokenHash).not.toBe(b.tokenHash)
    })
  })

  describe('getPasswordResetExpiry', () => {
    it('returns an ISO date string ~1 hour in the future', () => {
      const expiry = getPasswordResetExpiry()
      const expiryDate = new Date(expiry)
      const now = new Date()
      const diffMs = expiryDate.getTime() - now.getTime()
      // Should be roughly 1 hour (3600000ms), allow 5s tolerance
      expect(diffMs).toBeGreaterThan(3595000)
      expect(diffMs).toBeLessThan(3605000)
    })
  })
})
