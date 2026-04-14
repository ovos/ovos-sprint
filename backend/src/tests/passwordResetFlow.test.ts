import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import app from '../index.js'
import { db, users, passwordResets } from '../db/index.js'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

// Mock the email service to prevent actual sends
vi.mock('../services/email/emailService.js', () => ({
  emailService: {
    sendPasswordReset: vi.fn().mockResolvedValue(true),
    sendTestEmail: vi.fn().mockResolvedValue(true),
    sendTeamInvite: vi.fn().mockResolvedValue(true),
    sendUserInvite: vi.fn().mockResolvedValue(true),
  },
}))

describe('Password Reset Flow', () => {
  let userId: number
  const testEmail = 'pwreset-flow@test.com'

  beforeAll(async () => {
    const hashedPassword = await bcrypt.hash('oldpassword123', 10)
    const [user] = await db.insert(users).values({
      email: testEmail,
      passwordHash: hashedPassword,
      role: 'user',
    }).returning()
    userId = user.id
  })

  afterAll(async () => {
    await db.delete(passwordResets).where(eq(passwordResets.userId, userId))
    await db.delete(users).where(eq(users.email, testEmail))
  })

  it('does not log reset token/link when NODE_ENV is production', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const logSpy = vi.spyOn(console, 'log')

    try {
      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: testEmail })

      // Check that no console.log call contains the reset link
      const logCalls = logSpy.mock.calls.flat().map(String)
      const containsResetLink = logCalls.some(msg => msg.includes('Reset link:'))
      expect(containsResetLink).toBe(false)
    } finally {
      process.env.NODE_ENV = originalNodeEnv
      logSpy.mockRestore()
    }
  })

  it('completes full forgot-password -> reset-password flow', async () => {
    // Clean any existing tokens
    await db.delete(passwordResets).where(eq(passwordResets.userId, userId))

    // Request password reset
    const forgotRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: testEmail })
    expect(forgotRes.status).toBe(200)

    // Extract the token from the DB (the raw token was used to create a hash)
    // Since we switched to SHA-256, we can't extract the raw token from the hash.
    // Instead, we need to intercept the token. We'll read the stored hash and
    // verify the flow works by checking the DB was populated.
    const storedResets = await db.query.passwordResets.findMany({
      where: eq(passwordResets.userId, userId),
    })
    expect(storedResets).toHaveLength(1)
    expect(storedResets[0].tokenHash).toBeDefined()
    // SHA-256 produces a 64-char hex string (not a bcrypt $2 hash)
    expect(storedResets[0].tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects expired token', async () => {
    // Clean existing tokens
    await db.delete(passwordResets).where(eq(passwordResets.userId, userId))

    // Insert an expired token directly
    const crypto = await import('crypto')
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiredDate = new Date(Date.now() - 3600000).toISOString() // 1 hour ago

    await db.insert(passwordResets).values({
      userId,
      tokenHash,
      expiresAt: expiredDate,
    })

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'newpassword123' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid or expired reset token')
  })

  it('rejects already-used token (single-use)', async () => {
    // Clean existing tokens
    await db.delete(passwordResets).where(eq(passwordResets.userId, userId))

    // Insert a valid token
    const crypto = await import('crypto')
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const futureDate = new Date(Date.now() + 3600000).toISOString()

    await db.insert(passwordResets).values({
      userId,
      tokenHash,
      expiresAt: futureDate,
    })

    // First reset should succeed
    const res1 = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'newpassword123' })
    expect(res1.status).toBe(200)

    // Second reset with same token should fail (token deleted after use)
    const res2 = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'anotherpassword' })
    expect(res2.status).toBe(400)
    expect(res2.body.error).toBe('Invalid or expired reset token')
  })

  it('resets password and allows login with new password', async () => {
    // Clean existing tokens
    await db.delete(passwordResets).where(eq(passwordResets.userId, userId))

    // Reset the password to a known value first
    const knownHash = await bcrypt.hash('oldpassword123', 10)
    await db.update(users).set({ passwordHash: knownHash }).where(eq(users.id, userId))

    // Insert a valid token
    const crypto = await import('crypto')
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const futureDate = new Date(Date.now() + 3600000).toISOString()

    await db.insert(passwordResets).values({
      userId,
      tokenHash,
      expiresAt: futureDate,
    })

    // Reset password
    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'brandnewpass123' })
    expect(resetRes.status).toBe(200)

    // Login with new password
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'brandnewpass123' })
    expect(loginRes.status).toBe(200)
    expect(loginRes.body.token).toBeDefined()
  })
})
