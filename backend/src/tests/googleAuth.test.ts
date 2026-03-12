import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { db, users, teamMembers } from '../db/index.js'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { verifyToken } from '../utils/jwt.js'
import { verifyGoogleToken } from '../utils/googleAuth.js'

// Mock the Google token verification
vi.mock('../utils/googleAuth.js', () => ({
  verifyGoogleToken: vi.fn(),
}))

const mockedVerifyGoogleToken = vi.mocked(verifyGoogleToken)

// Import app after mocking
const { default: app } = await import('../index.js')
import request from 'supertest'

describe('Google Auth - POST /api/auth/google', () => {
  const GOOGLE_USER = {
    sub: 'google-id-123456',
    email: 'googleuser@example.com',
    email_verified: true,
    name: 'Test Google User',
    hd: 'example.com',
  }

  // Store original env value loaded from .env to restore after domain tests
  const originalAllowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN

  beforeAll(async () => {
    // Clean up any leftover test data
    await db.delete(users).where(eq(users.email, GOOGLE_USER.email))
    await db.delete(users).where(eq(users.email, 'existing@example.com'))
    await db.delete(users).where(eq(users.email, 'member@example.com'))
  })

  beforeEach(() => {
    // Clear domain restriction so tests run without it by default
    delete process.env.GOOGLE_ALLOWED_DOMAIN
  })

  afterEach(async () => {
    vi.clearAllMocks()
    // Reset domain restriction
    delete process.env.GOOGLE_ALLOWED_DOMAIN
    // Clean up test users after each test
    await db.delete(users).where(eq(users.email, GOOGLE_USER.email))
    await db.delete(users).where(eq(users.email, 'existing@example.com'))
    await db.delete(users).where(eq(users.email, 'member@example.com'))
    await db.delete(teamMembers).where(eq(teamMembers.email, 'member@example.com'))
  })

  it('should create a new user with role "user" for valid Google token', async () => {
    mockedVerifyGoogleToken.mockResolvedValue(GOOGLE_USER)

    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'valid-google-token' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.user.email).toBe(GOOGLE_USER.email)
    expect(res.body.user.role).toBe('user')

    // Verify JWT is valid
    const decoded = verifyToken(res.body.token)
    expect(decoded.email).toBe(GOOGLE_USER.email)
    expect(decoded.role).toBe('user')

    // Verify user was created in DB with googleId and no passwordHash
    const dbUser = await db.query.users.findFirst({
      where: eq(users.email, GOOGLE_USER.email),
    })
    expect(dbUser).toBeDefined()
    expect(dbUser!.googleId).toBe(GOOGLE_USER.sub)
    expect(dbUser!.passwordHash).toBeNull()
  })

  it('should merge with existing user who has the same email (link googleId)', async () => {
    // Create existing user with password
    const passwordHash = await bcrypt.hash('existingpassword', 10)
    await db.insert(users).values({
      email: 'existing@example.com',
      passwordHash,
      role: 'project_manager',
    })

    mockedVerifyGoogleToken.mockResolvedValue({
      ...GOOGLE_USER,
      email: 'existing@example.com',
    })

    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'valid-google-token' })

    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('existing@example.com')
    // Should preserve existing role, not override to 'user'
    expect(res.body.user.role).toBe('project_manager')

    // Verify googleId was linked
    const dbUser = await db.query.users.findFirst({
      where: eq(users.email, 'existing@example.com'),
    })
    expect(dbUser!.googleId).toBe(GOOGLE_USER.sub)
    // Password should still be there
    expect(dbUser!.passwordHash).toBe(passwordHash)
  })

  it('should link to team member with matching email', async () => {
    // Create team member with matching email
    const [member] = await db.insert(teamMembers).values({
      firstName: 'Test',
      lastName: 'Member',
      email: 'member@example.com',
    }).returning()

    mockedVerifyGoogleToken.mockResolvedValue({
      ...GOOGLE_USER,
      email: 'member@example.com',
    })

    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'valid-google-token' })

    expect(res.status).toBe(200)

    // Verify team member was linked to the new user
    const updatedMember = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.id, member.id),
    })
    expect(updatedMember!.userId).toBe(res.body.user.id)
  })

  it('should return existing user on repeat Google login (find by googleId)', async () => {
    // Create user with googleId already set
    const [existingUser] = await db.insert(users).values({
      email: GOOGLE_USER.email,
      googleId: GOOGLE_USER.sub,
      role: 'user',
    }).returning()

    mockedVerifyGoogleToken.mockResolvedValue(GOOGLE_USER)

    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'valid-google-token' })

    expect(res.status).toBe(200)
    expect(res.body.user.id).toBe(existingUser.id)
    expect(res.body.user.email).toBe(GOOGLE_USER.email)
  })

  it('should return 401 for invalid Google token', async () => {
    mockedVerifyGoogleToken.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'invalid-token' })

    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/invalid/i)
  })

  it('should return 400 when idToken is missing', async () => {
    const res = await request(app)
      .post('/api/auth/google')
      .send({})

    expect(res.status).toBe(400)
  })

  it('should reject Google token from wrong domain when GOOGLE_ALLOWED_DOMAIN is set', async () => {
    // Set domain restriction
    const originalDomain = process.env.GOOGLE_ALLOWED_DOMAIN
    process.env.GOOGLE_ALLOWED_DOMAIN = 'mycompany.com'

    mockedVerifyGoogleToken.mockResolvedValue({
      ...GOOGLE_USER,
      hd: 'other.com',
    })

    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'valid-token-wrong-domain' })

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/mycompany\.com/)

    // Restore
    if (originalDomain) {
      process.env.GOOGLE_ALLOWED_DOMAIN = originalDomain
    } else {
      delete process.env.GOOGLE_ALLOWED_DOMAIN
    }
  })

  it('should allow any domain when GOOGLE_ALLOWED_DOMAIN is not set', async () => {
    const originalDomain = process.env.GOOGLE_ALLOWED_DOMAIN
    delete process.env.GOOGLE_ALLOWED_DOMAIN

    mockedVerifyGoogleToken.mockResolvedValue({
      ...GOOGLE_USER,
      hd: 'anydomain.com',
    })

    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'valid-google-token' })

    expect(res.status).toBe(200)

    // Restore
    if (originalDomain) {
      process.env.GOOGLE_ALLOWED_DOMAIN = originalDomain
    }
  })
})
