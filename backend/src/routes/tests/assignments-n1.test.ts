import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../index.js'
import { db, users, customers, projects, teamMembers, projectAssignments, dayAssignments } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

describe('Assignment endpoints - eager loading (N+1 fix)', () => {
  let adminToken: string
  let customerId: number
  let projectId: number
  let memberId: number
  let paId: number // project assignment ID

  beforeAll(async () => {
    const hashedPassword = await bcrypt.hash('testpassword123', 10)
    const [adminUser] = await db.insert(users).values({
      email: 'n1-fix-admin@test.com',
      passwordHash: hashedPassword,
      role: 'admin',
    }).returning()
    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
      process.env.JWT_SECRET || 'test-secret'
    )

    const [customer] = await db.insert(customers).values({
      name: 'N1 Test Customer',
    }).returning()
    customerId = customer.id

    const [project] = await db.insert(projects).values({
      name: 'N1 Test Project',
      customerId,
      status: 'confirmed',
    }).returning()
    projectId = project.id

    const [member] = await db.insert(teamMembers).values({
      firstName: 'N1',
      lastName: 'Tester',
      email: 'n1-tester@test.com',
    }).returning()
    memberId = member.id

    const [pa] = await db.insert(projectAssignments).values({
      projectId,
      teamMemberId: memberId,
    }).returning()
    paId = pa.id

    await db.insert(dayAssignments).values([
      { projectAssignmentId: paId, date: '2026-04-14' },
      { projectAssignmentId: paId, date: '2026-04-15' },
    ])
  })

  afterAll(async () => {
    await db.delete(dayAssignments).where(eq(dayAssignments.projectAssignmentId, paId))
    await db.delete(projectAssignments).where(eq(projectAssignments.id, paId))
    await db.delete(projects).where(eq(projects.customerId, customerId))
    await db.delete(teamMembers).where(eq(teamMembers.id, memberId))
    await db.delete(customers).where(eq(customers.id, customerId))
    await db.delete(users).where(eq(users.email, 'n1-fix-admin@test.com'))
  })

  describe('GET /api/assignments/projects', () => {
    it('returns assignments with eagerly loaded project, member, and day assignments', async () => {
      const res = await request(app)
        .get('/api/assignments/projects')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      const ours = res.body.find((a: { id: number }) => a.id === paId)
      expect(ours).toBeDefined()
      expect(ours.project).toBeDefined()
      expect(ours.project.name).toBe('N1 Test Project')
      expect(ours.teamMember).toBeDefined()
      expect(ours.teamMember.firstName).toBe('N1')
      expect(ours.dayAssignments).toHaveLength(2)
    })
  })

  describe('GET /api/assignments/projects/:projectId', () => {
    it('returns assignments for a project with eagerly loaded member and days', async () => {
      const res = await request(app)
        .get(`/api/assignments/projects/${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].teamMember).toBeDefined()
      expect(res.body[0].teamMember.firstName).toBe('N1')
      expect(res.body[0].dayAssignments).toHaveLength(2)
    })
  })

  describe('GET /api/assignments/members/:memberId', () => {
    it('returns assignments for a member with eagerly loaded project and days', async () => {
      const res = await request(app)
        .get(`/api/assignments/members/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].project).toBeDefined()
      expect(res.body[0].project.name).toBe('N1 Test Project')
      expect(res.body[0].dayAssignments).toHaveLength(2)
    })
  })

  describe('GET /api/assignments/days', () => {
    it('returns day assignments with eagerly loaded relations', async () => {
      const res = await request(app)
        .get('/api/assignments/days?startDate=2026-04-14&endDate=2026-04-15')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      const ours = res.body.filter(
        (d: { projectAssignmentId: number }) => d.projectAssignmentId === paId
      )
      expect(ours).toHaveLength(2)
      expect(ours[0].projectAssignment).toBeDefined()
      expect(ours[0].project).toBeDefined()
      expect(ours[0].project.name).toBe('N1 Test Project')
      expect(ours[0].teamMember).toBeDefined()
      expect(ours[0].teamMember.firstName).toBe('N1')
    })

    it('returns all day assignments when no date range specified', async () => {
      const res = await request(app)
        .get('/api/assignments/days')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      const ours = res.body.filter(
        (d: { projectAssignmentId: number }) => d.projectAssignmentId === paId
      )
      expect(ours).toHaveLength(2)
      expect(ours[0].projectAssignment).toBeDefined()
      expect(ours[0].project).toBeDefined()
      expect(ours[0].teamMember).toBeDefined()
    })
  })
})
