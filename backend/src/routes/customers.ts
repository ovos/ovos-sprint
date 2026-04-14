import { Router } from 'express'
import { db, customers, projects, projectAssignments, dayAssignments, milestones } from '../db/index.js'
import { customerSchema } from '../utils/validation.js'
import { authenticate, requireAdminOrProjectManager, AuthRequest } from '../middleware/auth.js'
import { eq } from 'drizzle-orm'
import { handleRouteError } from '../utils/errorResponse.js'
import { parseIdParam } from '../utils/parseParams.js'

const router = Router()

// Get all customers
router.get('/', authenticate, async (_req, res) => {
  try {
    const allCustomers = await db.query.customers.findMany({
      orderBy: (customers, { asc }) => [asc(customers.name)],
      with: {
        manager: {
          columns: {
            id: true,
            email: true,
          },
        },
      },
    })
    res.json(allCustomers)
  } catch (error) {
    console.error('Get customers error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get cascade info for customer deletion (admin or project manager)
// MUST be before /:id route to avoid matching "cascade-info" as an ID
router.get('/:id/cascade-info', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const customerId = parseIdParam(req.params.id, res, 'customer ID')
    if (customerId === null) return

    const customerProjects = await db.query.projects.findMany({
      where: eq(projects.customerId, customerId),
    })

    let totalAssignments = 0
    let totalDayAssignments = 0
    let totalMilestones = 0

    for (const project of customerProjects) {
      const assignments = await db.query.projectAssignments.findMany({
        where: eq(projectAssignments.projectId, project.id),
      })
      totalAssignments += assignments.length

      for (const assignment of assignments) {
        const dayAssigns = await db.query.dayAssignments.findMany({
          where: eq(dayAssignments.projectAssignmentId, assignment.id),
        })
        totalDayAssignments += dayAssigns.length
      }

      const projectMilestones = await db.query.milestones.findMany({
        where: eq(milestones.projectId, project.id),
      })
      totalMilestones += projectMilestones.length
    }

    res.json({
      projects: customerProjects.length,
      assignments: totalAssignments,
      dayAssignments: totalDayAssignments,
      milestones: totalMilestones,
    })
  } catch (error) {
    console.error('Get cascade info error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get customer by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const customerId = parseIdParam(req.params.id, res, 'customer ID')
    if (customerId === null) return
    const customer = await db.query.customers.findFirst({
      where: (customers, { eq }) => eq(customers.id, customerId),
      with: {
        manager: {
          columns: {
            id: true,
            email: true,
          },
        },
      },
    })

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' })
    }

    res.json(customer)
  } catch (error) {
    console.error('Get customer error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Create customer (admin or project manager)
router.post('/', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const data = customerSchema.parse(req.body)

    // If project manager, automatically set self as manager
    let managerId = data.managerId
    if (req.user?.role === 'project_manager') {
      managerId = req.user.userId
    }

    const [customer] = await db.insert(customers).values({
      ...data,
      managerId,
    }).returning()
    res.status(201).json(customer)
  } catch (error) {
    handleRouteError(res, error, 'Create customer error', 400, 'Invalid request')
  }
})

// Update customer (admin or project manager for own customers)
router.put('/:id', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const customerId = parseIdParam(req.params.id, res, 'customer ID')
    if (customerId === null) return
    const data = customerSchema.parse(req.body)

    // Check ownership for project managers
    if (req.user?.role === 'project_manager') {
      const existing = await db.query.customers.findFirst({
        where: eq(customers.id, customerId),
      })
      if (!existing || existing.managerId !== req.user.userId) {
        return res.status(403).json({ error: 'You can only edit your own customers' })
      }
    }

    const [updated] = await db
      .update(customers)
      .set(data)
      .where(eq(customers.id, customerId))
      .returning()

    if (!updated) {
      return res.status(404).json({ error: 'Customer not found' })
    }

    res.json(updated)
  } catch (error) {
    handleRouteError(res, error, 'Update customer error', 400, 'Invalid request')
  }
})

// Delete customer (admin or project manager for own customers)
router.delete('/:id', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const customerId = parseIdParam(req.params.id, res, 'customer ID')
    if (customerId === null) return

    // Check ownership for project managers
    if (req.user?.role === 'project_manager') {
      const existing = await db.query.customers.findFirst({
        where: eq(customers.id, customerId),
      })
      if (!existing || existing.managerId !== req.user.userId) {
        return res.status(403).json({ error: 'You can only delete your own customers' })
      }
    }

    await db.delete(customers).where(eq(customers.id, customerId))
    res.status(204).send()
  } catch (error) {
    console.error('Delete customer error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
