import { Router } from 'express'
import { db, dayOffs, dayAssignments, projectAssignments, teamMembers } from '../db/index.js'
import { authenticate, AuthRequest } from '../middleware/auth.js'
import { eq, and, gte, lte, asc } from 'drizzle-orm'
import { dayOffSchema } from '../utils/validation.js'
import { handleRouteError } from '../utils/errorResponse.js'
import { parseIdParam } from '../utils/parseParams.js'

const router = Router()

// Get all day-offs (filtered by date range)
router.get('/', authenticate, async (req, res) => {
  try {
    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined

    const conditions = []
    if (startDate) {
      conditions.push(gte(dayOffs.date, startDate))
    }
    if (endDate) {
      conditions.push(lte(dayOffs.date, endDate))
    }

    const result = await db
      .select()
      .from(dayOffs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(dayOffs.date))

    res.json(result)
  } catch (error) {
    console.error('Get day-offs error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Create day-off (admin or own member)
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const data = dayOffSchema.parse(req.body)

    // Non-admins can only create day-offs for their own linked member
    if (req.user!.role !== 'admin') {
      const member = await db.query.teamMembers.findFirst({
        where: and(eq(teamMembers.id, data.teamMemberId), eq(teamMembers.userId, req.user!.userId)),
      })
      if (!member) {
        return res.status(403).json({ error: 'You can only manage your own day-offs' })
      }
    }

    // First, delete all day assignments for this member on this date
    // Get all project assignments for this member
    const memberProjectAssignments = await db
      .select()
      .from(projectAssignments)
      .where(eq(projectAssignments.teamMemberId, data.teamMemberId))

    const projectAssignmentIds = memberProjectAssignments.map(pa => pa.id)

    // Delete all day assignments for these project assignments on this date
    if (projectAssignmentIds.length > 0) {
      for (const paId of projectAssignmentIds) {
        await db
          .delete(dayAssignments)
          .where(
            and(
              eq(dayAssignments.date, data.date),
              eq(dayAssignments.projectAssignmentId, paId)
            )
          )
      }
    }

    // Now create the day-off
    const [dayOff] = await db.insert(dayOffs).values(data).returning()
    res.status(201).json(dayOff)
  } catch (error) {
    handleRouteError(res, error, 'Create day-off error', 400, 'Invalid request')
  }
})

// Delete day-off (admin or own member)
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const dayOffId = parseIdParam(req.params.id, res, 'day-off ID')
    if (dayOffId === null) return

    // Non-admins can only delete their own day-offs
    if (req.user!.role !== 'admin') {
      const dayOff = await db.query.dayOffs.findFirst({
        where: eq(dayOffs.id, dayOffId),
      })
      if (!dayOff) {
        return res.status(404).json({ error: 'Day-off not found' })
      }
      const member = await db.query.teamMembers.findFirst({
        where: and(eq(teamMembers.id, dayOff.teamMemberId), eq(teamMembers.userId, req.user!.userId)),
      })
      if (!member) {
        return res.status(403).json({ error: 'You can only manage your own day-offs' })
      }
    }

    await db.delete(dayOffs).where(eq(dayOffs.id, dayOffId))
    res.status(204).send()
  } catch (error) {
    console.error('Delete day-off error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
