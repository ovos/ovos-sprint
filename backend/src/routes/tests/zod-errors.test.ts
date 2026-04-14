import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../index.js'
import { db, users } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

describe('Zod validation error details in API responses', () => {
  let adminToken: string

  beforeAll(async () => {
    const hashedPassword = await bcrypt.hash('testpassword123', 10)
    const [adminUser] = await db.insert(users).values({
      email: 'zod-errors-admin@test.com',
      passwordHash: hashedPassword,
      role: 'admin',
    }).returning()
    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
      process.env.JWT_SECRET || 'test-secret'
    )
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, 'zod-errors-admin@test.com'))
  })

  describe('POST /api/teams (teamSchema)', () => {
    it('returns validation details when body is invalid', async () => {
      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({}) // missing required 'name' field

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
      expect(res.body.details).toBeDefined()
      expect(Array.isArray(res.body.details)).toBe(true)
      expect(res.body.details.length).toBeGreaterThan(0)
    })
  })

  describe('POST /api/customers (customerSchema)', () => {
    it('returns validation details when body is invalid', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ managerId: 'not-a-number' }) // missing 'name', bad 'managerId'

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
      expect(res.body.details).toBeDefined()
      expect(Array.isArray(res.body.details)).toBe(true)
    })
  })

  describe('POST /api/milestones (milestoneSchema)', () => {
    it('returns validation details when body is invalid', async () => {
      const res = await request(app)
        .post('/api/milestones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ projectId: 'abc', date: 'not-a-date' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
      expect(res.body.details).toBeDefined()
    })
  })

  describe('POST /api/auth/login (loginSchema)', () => {
    it('returns validation details for missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({}) // missing email and password

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
      expect(res.body.details).toBeDefined()
      expect(Array.isArray(res.body.details)).toBe(true)
    })
  })

  describe('Non-Zod errors', () => {
    it('does not leak internal error details for non-validation errors', async () => {
      // A request that passes Zod but fails for other reasons should NOT
      // expose internal details. Login with valid schema but wrong credentials
      // returns a specific auth error, not a generic leak.
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@test.com', password: 'wrongpassword' })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid credentials')
      expect(res.body.details).toBeUndefined()
    })
  })
})
