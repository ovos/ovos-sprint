import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import app from '../index.js'
import { db, teams, teamMembers, teamTeamMembers, users } from '../db/index.js'
import { eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

describe('Teams Batch Operations', () => {
  let adminToken: string
  let testTeamId: number
  let testMemberIds: number[] = []

  beforeAll(async () => {
    // Create admin user
    const hashedPassword = await bcrypt.hash('testpassword123', 10)
    const [adminUser] = await db.insert(users).values({
      email: 'teams-admin@test.com',
      passwordHash: hashedPassword,
      role: 'admin',
    }).returning()

    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
      process.env.JWT_SECRET || 'test-secret'
    )
  })

  beforeEach(async () => {
    // Clean up test data
    await db.delete(teamTeamMembers)
    await db.delete(teamMembers)
    await db.delete(teams)

    // Create test team
    const [team] = await db.insert(teams).values({
      name: 'Test Team',
    }).returning()
    testTeamId = team.id

    // Create test members
    const memberData = [
      { firstName: 'Alice', lastName: 'Smith', email: 'teams-alice@test.com' },
      { firstName: 'Bob', lastName: 'Jones', email: 'teams-bob@test.com' },
      { firstName: 'Charlie', lastName: 'Brown', email: 'teams-charlie@test.com' },
    ]

    const createdMembers = await db.insert(teamMembers).values(memberData).returning()
    testMemberIds = createdMembers.map(m => m.id)
  })

  afterAll(async () => {
    // Final cleanup
    await db.delete(teamTeamMembers)
    await db.delete(teamMembers)
    await db.delete(teams)
    await db.delete(users).where(eq(users.email, 'teams-admin@test.com'))
  })

  describe('POST /api/teams/:id/members/batch', () => {
    it('should add multiple members to a team', async () => {
      const response = await request(app)
        .post(`/api/teams/${testTeamId}/members/batch`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ memberIds: testMemberIds })
        .expect(201)

      expect(response.body.added).toBe(3)
      expect(response.body.skipped).toBe(0)

      // Verify members were added
      const relationships = await db.query.teamTeamMembers.findMany({
        where: (ttm, { eq }) => eq(ttm.teamId, testTeamId)
      })
      expect(relationships).toHaveLength(3)
    })

    it('should skip already assigned members', async () => {
      // Add first member manually
      await db.insert(teamTeamMembers).values({
        teamId: testTeamId,
        teamMemberId: testMemberIds[0]
      })

      const response = await request(app)
        .post(`/api/teams/${testTeamId}/members/batch`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ memberIds: testMemberIds })
        .expect(201)

      expect(response.body.added).toBe(2)
      expect(response.body.skipped).toBe(1)

      // Verify all members are in team (no duplicates)
      const relationships = await db.query.teamTeamMembers.findMany({
        where: (ttm, { eq }) => eq(ttm.teamId, testTeamId)
      })
      expect(relationships).toHaveLength(3)
    })

    it('should return 400 if memberIds is not an array', async () => {
      await request(app)
        .post(`/api/teams/${testTeamId}/members/batch`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ memberIds: 'not-an-array' })
        .expect(400)
    })

    it('should return 404 if team does not exist', async () => {
      await request(app)
        .post(`/api/teams/99999/members/batch`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ memberIds: testMemberIds })
        .expect(404)
    })

    it('should return 404 if some members do not exist', async () => {
      await request(app)
        .post(`/api/teams/${testTeamId}/members/batch`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ memberIds: [testMemberIds[0], 99999] })
        .expect(404)
    })

    it('should require admin role', async () => {
      const regularToken = jwt.sign(
        { userId: 999, role: 'user' },
        process.env.JWT_SECRET || 'test-secret'
      )

      await request(app)
        .post(`/api/teams/${testTeamId}/members/batch`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ memberIds: testMemberIds })
        .expect(403)
    })

    it('should handle empty memberIds array', async () => {
      const response = await request(app)
        .post(`/api/teams/${testTeamId}/members/batch`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ memberIds: [] })
        .expect(201)

      expect(response.body.added).toBe(0)
      expect(response.body.skipped).toBe(0)
    })
  })

  describe('DELETE /api/teams/:id/members/batch', () => {
    beforeEach(async () => {
      // Add all members to the team
      await db.insert(teamTeamMembers).values(
        testMemberIds.map(memberId => ({
          teamId: testTeamId,
          teamMemberId: memberId
        }))
      )
    })

    it('should remove multiple members from a team', async () => {
      await request(app)
        .delete(`/api/teams/${testTeamId}/members/batch`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ memberIds: [testMemberIds[0], testMemberIds[1]] })
        .expect(204)

      // Verify members were removed
      const relationships = await db.query.teamTeamMembers.findMany({
        where: (ttm, { eq }) => eq(ttm.teamId, testTeamId)
      })
      expect(relationships).toHaveLength(1)
      expect(relationships[0].teamMemberId).toBe(testMemberIds[2])
    })

    it('should remove all members when all IDs provided', async () => {
      await request(app)
        .delete(`/api/teams/${testTeamId}/members/batch`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ memberIds: testMemberIds })
        .expect(204)

      // Verify all members were removed
      const relationships = await db.query.teamTeamMembers.findMany({
        where: (ttm, { eq }) => eq(ttm.teamId, testTeamId)
      })
      expect(relationships).toHaveLength(0)
    })

    it('should return 400 if memberIds is not an array', async () => {
      await request(app)
        .delete(`/api/teams/${testTeamId}/members/batch`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ memberIds: 'not-an-array' })
        .expect(400)
    })

    it('should handle non-existent member IDs gracefully', async () => {
      // This should not fail even if some IDs don't exist
      await request(app)
        .delete(`/api/teams/${testTeamId}/members/batch`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ memberIds: [testMemberIds[0], 99999] })
        .expect(204)

      // Verify only the existing member was removed
      const relationships = await db.query.teamTeamMembers.findMany({
        where: (ttm, { eq }) => eq(ttm.teamId, testTeamId)
      })
      expect(relationships).toHaveLength(2)
    })

    it('should require admin role', async () => {
      const regularToken = jwt.sign(
        { userId: 999, role: 'user' },
        process.env.JWT_SECRET || 'test-secret'
      )

      await request(app)
        .delete(`/api/teams/${testTeamId}/members/batch`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ memberIds: testMemberIds })
        .expect(403)
    })

    it('should handle empty memberIds array', async () => {
      await request(app)
        .delete(`/api/teams/${testTeamId}/members/batch`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ memberIds: [] })
        .expect(204)

      // Verify no members were removed
      const relationships = await db.query.teamTeamMembers.findMany({
        where: (ttm, { eq }) => eq(ttm.teamId, testTeamId)
      })
      expect(relationships).toHaveLength(3)
    })
  })
})
