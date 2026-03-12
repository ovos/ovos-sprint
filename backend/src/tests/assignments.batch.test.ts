import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import app from '../index.js'
import { db, projects, projectAssignments, teamMembers, users, customers } from '../db/index.js'
import { eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

describe('Project Assignments Batch Operations', () => {
  let adminToken: string
  let pmToken: string
  let adminUserId: number
  let pmUserId: number
  let testProjectId: number
  let testMemberIds: number[] = []
  let testCustomerId: number

  beforeAll(async () => {
    // Create admin user
    const hashedPassword = await bcrypt.hash('testpassword123', 10)
    const [adminUser] = await db.insert(users).values({
      email: 'assign-admin@test.com',
      passwordHash: hashedPassword,
      role: 'admin',
    }).returning()
    adminUserId = adminUser.id

    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
      process.env.JWT_SECRET || 'test-secret'
    )

    // Create project manager user
    const [pmUser] = await db.insert(users).values({
      email: 'assign-pm@test.com',
      passwordHash: hashedPassword,
      role: 'project_manager',
    }).returning()
    pmUserId = pmUser.id

    pmToken = jwt.sign(
      { userId: pmUser.id, email: pmUser.email, role: pmUser.role },
      process.env.JWT_SECRET || 'test-secret'
    )
  })

  beforeEach(async () => {
    // Clean up test data
    await db.delete(projectAssignments)
    await db.delete(projects)
    await db.delete(teamMembers)
    await db.delete(customers)

    // Create test customer
    const [customer] = await db.insert(customers).values({
      name: 'Test Customer',
      icon: '🏢',
    }).returning()
    testCustomerId = customer.id

    // Create test project owned by PM user
    const [project] = await db.insert(projects).values({
      name: 'Test Project',
      customerId: testCustomerId,
      status: 'confirmed',
      managerId: pmUserId,
    }).returning()
    testProjectId = project.id

    // Create test members
    const memberData = [
      { firstName: 'Alice', lastName: 'Smith', email: 'assign-alice@test.com' },
      { firstName: 'Bob', lastName: 'Jones', email: 'assign-bob@test.com' },
      { firstName: 'Charlie', lastName: 'Brown', email: 'assign-charlie@test.com' },
    ]

    const createdMembers = await db.insert(teamMembers).values(memberData).returning()
    testMemberIds = createdMembers.map(m => m.id)
  })

  afterAll(async () => {
    // Final cleanup
    await db.delete(projectAssignments)
    await db.delete(projects)
    await db.delete(teamMembers)
    await db.delete(customers)
    await db.delete(users).where(eq(users.email, 'assign-admin@test.com'))
    await db.delete(users).where(eq(users.email, 'assign-pm@test.com'))
  })

  describe('POST /api/assignments/projects/batch', () => {
    it('should assign multiple members to a project (admin)', async () => {
      const response = await request(app)
        .post('/api/assignments/projects/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          projectId: testProjectId,
          memberIds: testMemberIds
        })
        .expect(201)

      expect(response.body.added).toBe(3)
      expect(response.body.skipped).toBe(0)
      expect(response.body.assignments).toHaveLength(3)

      // Verify assignments were created
      const assignments = await db.query.projectAssignments.findMany({
        where: (pa, { eq }) => eq(pa.projectId, testProjectId)
      })
      expect(assignments).toHaveLength(3)
    })

    it('should assign multiple members to own project (project manager)', async () => {
      const response = await request(app)
        .post('/api/assignments/projects/batch')
        .set('Authorization', `Bearer ${pmToken}`)
        .send({
          projectId: testProjectId,
          memberIds: testMemberIds
        })
        .expect(201)

      expect(response.body.added).toBe(3)
      expect(response.body.skipped).toBe(0)
    })

    it('should skip already assigned members', async () => {
      // Assign first member manually
      await db.insert(projectAssignments).values({
        projectId: testProjectId,
        teamMemberId: testMemberIds[0]
      })

      const response = await request(app)
        .post('/api/assignments/projects/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          projectId: testProjectId,
          memberIds: testMemberIds
        })
        .expect(201)

      expect(response.body.added).toBe(2)
      expect(response.body.skipped).toBe(1)

      // Verify all members are assigned (no duplicates)
      const assignments = await db.query.projectAssignments.findMany({
        where: (pa, { eq }) => eq(pa.projectId, testProjectId)
      })
      expect(assignments).toHaveLength(3)
    })

    it('should return 400 if projectId is missing', async () => {
      await request(app)
        .post('/api/assignments/projects/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ memberIds: testMemberIds })
        .expect(400)
    })

    it('should return 400 if memberIds is not an array', async () => {
      await request(app)
        .post('/api/assignments/projects/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          projectId: testProjectId,
          memberIds: 'not-an-array'
        })
        .expect(400)
    })

    it('should return 403 if PM tries to assign to project they do not own', async () => {
      // Create a project owned by admin
      const [otherProject] = await db.insert(projects).values({
        name: 'Admin Project',
        customerId: testCustomerId,
        status: 'confirmed',
        managerId: adminUserId,
      }).returning()

      await request(app)
        .post('/api/assignments/projects/batch')
        .set('Authorization', `Bearer ${pmToken}`)
        .send({
          projectId: otherProject.id,
          memberIds: testMemberIds
        })
        .expect(403)
    })

    it('should handle empty memberIds array', async () => {
      const response = await request(app)
        .post('/api/assignments/projects/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          projectId: testProjectId,
          memberIds: []
        })
        .expect(201)

      expect(response.body.added).toBe(0)
      expect(response.body.skipped).toBe(0)
      expect(response.body.assignments).toHaveLength(0)
    })

    it('should require authentication', async () => {
      await request(app)
        .post('/api/assignments/projects/batch')
        .send({
          projectId: testProjectId,
          memberIds: testMemberIds
        })
        .expect(401)
    })
  })

  describe('DELETE /api/assignments/projects/batch', () => {
    let assignmentIds: number[] = []

    beforeEach(async () => {
      // Create assignments for all members
      const createdAssignments = await db.insert(projectAssignments).values(
        testMemberIds.map(memberId => ({
          projectId: testProjectId,
          teamMemberId: memberId
        }))
      ).returning()
      assignmentIds = createdAssignments.map(a => a.id)
    })

    it('should unassign multiple members from a project (admin)', async () => {
      await request(app)
        .delete('/api/assignments/projects/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [assignmentIds[0], assignmentIds[1]] })
        .expect(204)

      // Verify assignments were deleted
      const assignments = await db.query.projectAssignments.findMany({
        where: (pa, { eq }) => eq(pa.projectId, testProjectId)
      })
      expect(assignments).toHaveLength(1)
      expect(assignments[0].id).toBe(assignmentIds[2])
    })

    it('should unassign multiple members from own project (project manager)', async () => {
      await request(app)
        .delete('/api/assignments/projects/batch')
        .set('Authorization', `Bearer ${pmToken}`)
        .send({ ids: [assignmentIds[0], assignmentIds[1]] })
        .expect(204)

      // Verify assignments were deleted
      const assignments = await db.query.projectAssignments.findMany({
        where: (pa, { eq }) => eq(pa.projectId, testProjectId)
      })
      expect(assignments).toHaveLength(1)
    })

    it('should unassign all members when all IDs provided', async () => {
      await request(app)
        .delete('/api/assignments/projects/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: assignmentIds })
        .expect(204)

      // Verify all assignments were deleted
      const assignments = await db.query.projectAssignments.findMany({
        where: (pa, { eq }) => eq(pa.projectId, testProjectId)
      })
      expect(assignments).toHaveLength(0)
    })

    it('should return 400 if ids is not an array', async () => {
      await request(app)
        .delete('/api/assignments/projects/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: 'not-an-array' })
        .expect(400)
    })

    it('should return 404 if some assignment IDs do not exist', async () => {
      await request(app)
        .delete('/api/assignments/projects/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [assignmentIds[0], 99999] })
        .expect(404)
    })

    it('should return 403 if PM tries to unassign from project they do not own', async () => {
      // Create a project owned by admin with assignments
      const [otherProject] = await db.insert(projects).values({
        name: 'Admin Project',
        customerId: testCustomerId,
        status: 'confirmed',
        managerId: adminUserId,
      }).returning()

      const [otherAssignment] = await db.insert(projectAssignments).values({
        projectId: otherProject.id,
        teamMemberId: testMemberIds[0]
      }).returning()

      await request(app)
        .delete('/api/assignments/projects/batch')
        .set('Authorization', `Bearer ${pmToken}`)
        .send({ ids: [otherAssignment.id] })
        .expect(403)
    })

    it('should handle empty ids array', async () => {
      await request(app)
        .delete('/api/assignments/projects/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [] })
        .expect(204)

      // Verify no assignments were deleted
      const assignments = await db.query.projectAssignments.findMany({
        where: (pa, { eq }) => eq(pa.projectId, testProjectId)
      })
      expect(assignments).toHaveLength(3)
    })

    it('should require authentication', async () => {
      await request(app)
        .delete('/api/assignments/projects/batch')
        .send({ ids: assignmentIds })
        .expect(401)
    })
  })
})
