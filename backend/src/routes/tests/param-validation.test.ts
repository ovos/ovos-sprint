import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../index.js'
import { db, users } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

describe('parseInt param validation - returns 400 for non-numeric IDs', () => {
  let adminToken: string
  let userToken: string

  beforeAll(async () => {
    const hashedPassword = await bcrypt.hash('testpassword123', 10)

    const [adminUser] = await db.insert(users).values({
      email: 'param-admin@test.com',
      passwordHash: hashedPassword,
      role: 'admin',
    }).returning()
    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
      process.env.JWT_SECRET || 'test-secret'
    )

    const [regularUser] = await db.insert(users).values({
      email: 'param-user@test.com',
      passwordHash: hashedPassword,
      role: 'user',
    }).returning()
    userToken = jwt.sign(
      { userId: regularUser.id, email: regularUser.email, role: regularUser.role },
      process.env.JWT_SECRET || 'test-secret'
    )
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, 'param-admin@test.com'))
    await db.delete(users).where(eq(users.email, 'param-user@test.com'))
  })

  describe('GET /api/teams/:id', () => {
    it('returns 400 for non-numeric id', async () => {
      const res = await request(app)
        .get('/api/teams/notanumber')
        .set('Authorization', `Bearer ${userToken}`)
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/invalid/i)
    })

    it('returns 400 for float id', async () => {
      const res = await request(app)
        .get('/api/teams/1.5')
        .set('Authorization', `Bearer ${userToken}`)
      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/customers/:id', () => {
    it('returns 400 for non-numeric id', async () => {
      const res = await request(app)
        .get('/api/customers/abc')
        .set('Authorization', `Bearer ${userToken}`)
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/invalid/i)
    })
  })

  describe('GET /api/members/:id', () => {
    it('returns 400 for non-numeric id', async () => {
      const res = await request(app)
        .get('/api/members/xyz')
        .set('Authorization', `Bearer ${userToken}`)
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/invalid/i)
    })
  })

  describe('GET /api/projects/:id', () => {
    it('returns 400 for non-numeric id', async () => {
      const res = await request(app)
        .get('/api/projects/abc')
        .set('Authorization', `Bearer ${userToken}`)
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/invalid/i)
    })
  })

  describe('GET /api/milestones/:id', () => {
    it('returns 400 for non-numeric id', async () => {
      const res = await request(app)
        .get('/api/milestones/abc')
        .set('Authorization', `Bearer ${userToken}`)
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/invalid/i)
    })
  })

  describe('DELETE /api/day-offs/:id', () => {
    it('returns 400 for non-numeric id', async () => {
      const res = await request(app)
        .delete('/api/day-offs/abc')
        .set('Authorization', `Bearer ${userToken}`)
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/invalid/i)
    })
  })

  describe('PUT /api/teams/:id', () => {
    it('returns 400 for non-numeric id', async () => {
      const res = await request(app)
        .put('/api/teams/notanumber')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test' })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/invalid/i)
    })
  })

  describe('DELETE /api/teams/:id', () => {
    it('returns 400 for non-numeric id', async () => {
      const res = await request(app)
        .delete('/api/teams/notanumber')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/invalid/i)
    })
  })
})
