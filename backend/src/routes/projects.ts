import { Router } from 'express'
import { db, projects, projectAssignments, dayAssignments, milestones } from '../db/index.js'
import { projectSchema } from '../utils/validation.js'
import { authenticate, requireAdminOrProjectManager, AuthRequest } from '../middleware/auth.js'
import { eq } from 'drizzle-orm'
import { handleRouteError } from '../utils/errorResponse.js'
import { parseIdParam } from '../utils/parseParams.js'

const router = Router()

// Get all projects
router.get('/', authenticate, async (_req, res) => {
  try {
    const allProjects = await db.query.projects.findMany({
      orderBy: (projects, { desc }) => [desc(projects.createdAt)],
      with: {
        customer: true,
        manager: {
          columns: {
            id: true,
            email: true,
          },
        },
      },
    })
    res.json(allProjects)
  } catch (error) {
    console.error('Get projects error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get cascade info for project deletion (admin or project manager)
// MUST be before /:id route to avoid matching "cascade-info" as an ID
router.get('/:id/cascade-info', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const projectId = parseIdParam(req.params.id, res, 'project ID')
    if (projectId === null) return

    // Get project assignments
    const assignments = await db.query.projectAssignments.findMany({
      where: eq(projectAssignments.projectId, projectId),
    })

    // Count day assignments for all project assignments
    let totalDayAssignments = 0
    for (const assignment of assignments) {
      const dayAssigns = await db.query.dayAssignments.findMany({
        where: eq(dayAssignments.projectAssignmentId, assignment.id),
      })
      totalDayAssignments += dayAssigns.length
    }

    // Get milestones
    const projectMilestones = await db.query.milestones.findMany({
      where: eq(milestones.projectId, projectId),
    })

    res.json({
      assignments: assignments.length,
      dayAssignments: totalDayAssignments,
      milestones: projectMilestones.length,
    })
  } catch (error) {
    console.error('Get cascade info error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get project by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const projectId = parseIdParam(req.params.id, res, 'project ID')
    if (projectId === null) return
    const project = await db.query.projects.findFirst({
      where: (projects, { eq }) => eq(projects.id, projectId),
      with: {
        customer: true,
        manager: {
          columns: {
            id: true,
            email: true,
          },
        },
      },
    })

    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }

    res.json(project)
  } catch (error) {
    console.error('Get project error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Create project (admin or project manager)
router.post('/', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const data = projectSchema.parse(req.body)

    // If project manager, automatically set self as manager
    let managerId = data.managerId
    if (req.user?.role === 'project_manager') {
      managerId = req.user.userId
    }

    const [project] = await db.insert(projects).values({
      ...data,
      managerId,
    }).returning()
    res.status(201).json(project)
  } catch (error) {
    handleRouteError(res, error, 'Create project error', 400, 'Invalid request')
  }
})

// Update project (admin or project manager for own projects)
router.put('/:id', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const projectId = parseIdParam(req.params.id, res, 'project ID')
    if (projectId === null) return
    const data = projectSchema.parse(req.body)

    // Check ownership for project managers
    if (req.user?.role === 'project_manager') {
      const existing = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      })
      if (!existing || existing.managerId !== req.user.userId) {
        return res.status(403).json({ error: 'You can only edit your own projects' })
      }
    }

    const [updated] = await db
      .update(projects)
      .set(data)
      .where(eq(projects.id, projectId))
      .returning()

    if (!updated) {
      return res.status(404).json({ error: 'Project not found' })
    }

    res.json(updated)
  } catch (error) {
    handleRouteError(res, error, 'Update project error', 400, 'Invalid request')
  }
})

// Delete project (admin or project manager for own projects)
router.delete('/:id', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const projectId = parseIdParam(req.params.id, res, 'project ID')
    if (projectId === null) return

    // Check ownership for project managers
    if (req.user?.role === 'project_manager') {
      const existing = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      })
      if (!existing || existing.managerId !== req.user.userId) {
        return res.status(403).json({ error: 'You can only delete your own projects' })
      }
    }

    await db.delete(projects).where(eq(projects.id, projectId))
    res.status(204).send()
  } catch (error) {
    console.error('Delete project error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
