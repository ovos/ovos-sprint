import { Router } from 'express'
import { db, milestones } from '../db/index.js'
import { authenticate, requireAdminOrProjectManager, AuthRequest } from '../middleware/auth.js'
import { eq, and, gte, lte, asc } from 'drizzle-orm'
import { milestoneSchema } from '../utils/validation.js'
import { canModifyProject } from '../utils/authorization.js'
import { handleRouteError } from '../utils/errorResponse.js'
import { parseIdParam } from '../utils/parseParams.js'

const router = Router()

// Get all milestones (optionally filtered by project and date range)
router.get('/', authenticate, async (req, res) => {
  try {
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined
    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined

    const conditions = []
    if (projectId !== undefined) {
      conditions.push(eq(milestones.projectId, projectId))
    }
    if (startDate) {
      conditions.push(gte(milestones.date, startDate))
    }
    if (endDate) {
      conditions.push(lte(milestones.date, endDate))
    }

    const result = await db
      .select()
      .from(milestones)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(milestones.date))

    res.json(result)
  } catch (error) {
    console.error('Get milestones error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get milestone by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const milestoneId = parseIdParam(req.params.id, res, 'milestone ID')
    if (milestoneId === null) return
    const milestone = await db.query.milestones.findFirst({
      where: (milestones, { eq }) => eq(milestones.id, milestoneId),
    })

    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' })
    }

    res.json(milestone)
  } catch (error) {
    console.error('Get milestone error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Create milestone (admin or project manager for their own projects)
router.post('/', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const data = milestoneSchema.parse(req.body)

    // Check if user can modify this project
    if (!await canModifyProject(req.user!.userId, req.user!.role, data.projectId)) {
      return res.status(403).json({ error: 'You can only create milestones for your own projects' })
    }

    const [milestone] = await db.insert(milestones).values(data).returning()
    res.status(201).json(milestone)
  } catch (error) {
    handleRouteError(res, error, 'Create milestone error', 400, 'Invalid request')
  }
})

// Update milestone (admin or project manager for their own projects)
router.put('/:id', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const milestoneId = parseIdParam(req.params.id, res, 'milestone ID')
    if (milestoneId === null) return
    const data = milestoneSchema.partial().parse(req.body)

    // Get the milestone to check project ownership
    const existingMilestone = await db.query.milestones.findFirst({
      where: (m, { eq }) => eq(m.id, milestoneId),
    })

    if (!existingMilestone) {
      return res.status(404).json({ error: 'Milestone not found' })
    }

    // Check if user can modify this project
    if (!await canModifyProject(req.user!.userId, req.user!.role, existingMilestone.projectId)) {
      return res.status(403).json({ error: 'You can only update milestones for your own projects' })
    }

    const [updated] = await db
      .update(milestones)
      .set(data)
      .where(eq(milestones.id, milestoneId))
      .returning()

    res.json(updated)
  } catch (error) {
    handleRouteError(res, error, 'Update milestone error', 400, 'Invalid request')
  }
})

// Delete milestone (admin or project manager for their own projects)
router.delete('/:id', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const milestoneId = parseIdParam(req.params.id, res, 'milestone ID')
    if (milestoneId === null) return

    // Get the milestone to check project ownership
    const existingMilestone = await db.query.milestones.findFirst({
      where: (m, { eq }) => eq(m.id, milestoneId),
    })

    if (!existingMilestone) {
      return res.status(404).json({ error: 'Milestone not found' })
    }

    // Check if user can modify this project
    if (!await canModifyProject(req.user!.userId, req.user!.role, existingMilestone.projectId)) {
      return res.status(403).json({ error: 'You can only delete milestones for your own projects' })
    }

    await db.delete(milestones).where(eq(milestones.id, milestoneId))
    res.status(204).send()
  } catch (error) {
    console.error('Delete milestone error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
