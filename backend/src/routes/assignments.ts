import { Router } from 'express'
import { db, projectAssignments, dayAssignments, assignmentGroups } from '../db/index.js'
import { projectAssignmentSchema, dayAssignmentSchema, assignmentGroupSchema, updateAssignmentGroupSchema } from '../utils/validation.js'
import { authenticate, requireAdminOrProjectManager, AuthRequest } from '../middleware/auth.js'
import { eq, and, gte, lte, inArray } from 'drizzle-orm'
import { handleGroupMergeOnDayAdd, handleGroupSplitOnDayDelete, cleanupOrphanedGroups, handleBatchGroupMerge } from '../utils/groupMerge.js'
import { canModifyProject } from '../utils/authorization.js'
import { handleRouteError } from '../utils/errorResponse.js'
import { parseIdParam } from '../utils/parseParams.js'

const router = Router()

// Helper to get projectId from a project assignment
async function getProjectIdFromAssignment(projectAssignmentId: number): Promise<number | null> {
  const assignment = await db.query.projectAssignments.findFirst({
    where: (pa, { eq }) => eq(pa.id, projectAssignmentId),
  })
  return assignment?.projectId ?? null
}

// Get all project assignments
router.get('/projects', authenticate, async (_req, res) => {
  try {
    const assignments = await db.select().from(projectAssignments)

    const assignmentsWithDetails = await Promise.all(
      assignments.map(async (assignment) => {
        const project = await db.query.projects.findFirst({
          where: (projects, { eq }) => eq(projects.id, assignment.projectId),
        })

        const member = await db.query.teamMembers.findFirst({
          where: (teamMembers, { eq }) => eq(teamMembers.id, assignment.teamMemberId),
        })

        const days = await db.query.dayAssignments.findMany({
          where: (dayAssignments, { eq }) => eq(dayAssignments.projectAssignmentId, assignment.id),
        })

        return {
          ...assignment,
          project,
          teamMember: member,
          dayAssignments: days,
        }
      })
    )

    res.json(assignmentsWithDetails)
  } catch (error) {
    console.error('Get project assignments error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get project assignments for a specific project
router.get('/projects/:projectId', authenticate, async (req, res) => {
  try {
    const projectId = parseIdParam(req.params.projectId, res, 'project ID')
    if (projectId === null) return
    const assignments = await db
      .select()
      .from(projectAssignments)
      .where(eq(projectAssignments.projectId, projectId))

    const assignmentsWithDetails = await Promise.all(
      assignments.map(async (assignment) => {
        const member = await db.query.teamMembers.findFirst({
          where: (teamMembers, { eq }) => eq(teamMembers.id, assignment.teamMemberId),
        })

        const days = await db.query.dayAssignments.findMany({
          where: (dayAssignments, { eq }) => eq(dayAssignments.projectAssignmentId, assignment.id),
        })

        return {
          ...assignment,
          teamMember: member,
          dayAssignments: days,
        }
      })
    )

    res.json(assignmentsWithDetails)
  } catch (error) {
    console.error('Get project assignments error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get project assignments for a specific team member
router.get('/members/:memberId', authenticate, async (req, res) => {
  try {
    const memberId = parseIdParam(req.params.memberId, res, 'member ID')
    if (memberId === null) return
    const assignments = await db
      .select()
      .from(projectAssignments)
      .where(eq(projectAssignments.teamMemberId, memberId))

    const assignmentsWithDetails = await Promise.all(
      assignments.map(async (assignment) => {
        const project = await db.query.projects.findFirst({
          where: (projects, { eq }) => eq(projects.id, assignment.projectId),
        })

        const days = await db.query.dayAssignments.findMany({
          where: (dayAssignments, { eq }) => eq(dayAssignments.projectAssignmentId, assignment.id),
        })

        return {
          ...assignment,
          project,
          dayAssignments: days,
        }
      })
    )

    res.json(assignmentsWithDetails)
  } catch (error) {
    console.error('Get member assignments error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get contiguous date range for a project assignment around a specific date
// This returns only the continuous segment containing the specified date,
// not the full range if there are gaps (deleted days)
router.get('/projects/:id/date-range', authenticate, async (req, res) => {
  try {
    const projectAssignmentId = parseIdParam(req.params.id, res, 'project assignment ID')
    if (projectAssignmentId === null) return
    const dateParam = req.query.date as string | undefined

    const days = await db.query.dayAssignments.findMany({
      where: (dayAssignments, { eq }) => eq(dayAssignments.projectAssignmentId, projectAssignmentId),
      orderBy: (dayAssignments, { asc }) => [asc(dayAssignments.date)],
    })

    if (days.length === 0) {
      return res.json({ start: null, end: null })
    }

    // If no date specified, return full range (min to max)
    if (!dateParam) {
      return res.json({
        start: days[0].date,
        end: days[days.length - 1].date,
      })
    }

    // Find contiguous range around the specified date
    const allDates = days.map(d => d.date).sort()

    // Check if the specified date exists in the assignments
    if (!allDates.includes(dateParam)) {
      return res.status(404).json({ error: 'Date not found in assignment' })
    }

    // Find the contiguous segment containing this date
    const dateIndex = allDates.indexOf(dateParam)
    let startIndex = dateIndex
    let endIndex = dateIndex

    // Helper to check if two dates are consecutive
    const isNextDay = (date1: string, date2: string): boolean => {
      const d1 = new Date(date1)
      const d2 = new Date(date2)
      const diff = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)
      return Math.abs(diff) === 1
    }

    // Expand backwards to find start of contiguous range
    while (startIndex > 0 && isNextDay(allDates[startIndex - 1], allDates[startIndex])) {
      startIndex--
    }

    // Expand forwards to find end of contiguous range
    while (endIndex < allDates.length - 1 && isNextDay(allDates[endIndex], allDates[endIndex + 1])) {
      endIndex++
    }

    res.json({
      start: allDates[startIndex],
      end: allDates[endIndex],
    })
  } catch (error) {
    console.error('Get assignment date range error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Batch assign multiple members to a project - MUST come before /projects/:id
router.post('/projects/batch', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const data = req.body as { projectId: number; memberIds: number[] }

    if (!data.projectId || !Array.isArray(data.memberIds)) {
      return res.status(400).json({ error: 'Invalid request: projectId and memberIds array required' })
    }

    // Check if user can modify this project
    if (!await canModifyProject(req.user!.userId, req.user!.role, data.projectId)) {
      return res.status(403).json({ error: 'You can only assign members to your own projects' })
    }

    // Get existing assignments to avoid duplicates
    const existing = await db.query.projectAssignments.findMany({
      where: (pa, { eq }) => eq(pa.projectId, data.projectId)
    })
    const existingIds = new Set(existing.map(e => e.teamMemberId))

    // Filter to only new members
    const newMemberIds = data.memberIds.filter(id => !existingIds.has(id))

    // Insert new assignments
    const results = []
    if (newMemberIds.length > 0) {
      for (const memberId of newMemberIds) {
        const [assignment] = await db
          .insert(projectAssignments)
          .values({
            projectId: data.projectId,
            teamMemberId: memberId
          })
          .returning()
        results.push(assignment)
      }
    }

    res.status(201).json({
      added: newMemberIds.length,
      skipped: data.memberIds.length - newMemberIds.length,
      assignments: results
    })
  } catch (error) {
    console.error('Batch assign members to project error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Batch unassign multiple members from a project - MUST come before /projects/:id
router.delete('/projects/batch', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const data = req.body as { ids: number[] }

    if (!Array.isArray(data.ids)) {
      return res.status(400).json({ error: 'Invalid request: ids array required' })
    }

    // Get assignments to check permissions
    const assignments = await db.query.projectAssignments.findMany({
      where: (pa, { inArray }) => inArray(pa.id, data.ids)
    })

    if (assignments.length !== data.ids.length) {
      return res.status(404).json({ error: 'Some assignments not found' })
    }

    // Check project ownership for all assignments
    for (const assignment of assignments) {
      if (!await canModifyProject(req.user!.userId, req.user!.role, assignment.projectId)) {
        return res.status(403).json({ error: 'You can only unassign members from your own projects' })
      }
    }

    // Delete assignments
    await db.delete(projectAssignments).where(
      inArray(projectAssignments.id, data.ids)
    )

    res.status(204).send()
  } catch (error) {
    console.error('Batch unassign members from project error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Create project assignment (admin or project manager for their own projects)
router.post('/projects', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const data = projectAssignmentSchema.parse(req.body)

    // Check if user can modify this project
    if (!await canModifyProject(req.user!.userId, req.user!.role, data.projectId)) {
      return res.status(403).json({ error: 'You can only assign members to your own projects' })
    }

    // Check if assignment already exists
    const existing = await db.query.projectAssignments.findFirst({
      where: (projectAssignments, { and, eq }) =>
        and(
          eq(projectAssignments.projectId, data.projectId),
          eq(projectAssignments.teamMemberId, data.teamMemberId)
        ),
    })

    if (existing) {
      return res.status(400).json({ error: 'Assignment already exists' })
    }

    const [assignment] = await db.insert(projectAssignments).values(data).returning()
    res.status(201).json(assignment)
  } catch (error) {
    handleRouteError(res, error, 'Create project assignment error', 400, 'Invalid request')
  }
})

// Delete project assignment (admin or project manager for their own projects)
router.delete('/projects/:id', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const assignmentId = parseIdParam(req.params.id, res, 'assignment ID')
    if (assignmentId === null) return

    // Get the assignment to check project ownership
    const assignment = await db.query.projectAssignments.findFirst({
      where: (pa, { eq }) => eq(pa.id, assignmentId),
    })

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' })
    }

    // Check if user can modify this project
    if (!await canModifyProject(req.user!.userId, req.user!.role, assignment.projectId)) {
      return res.status(403).json({ error: 'You can only remove assignments from your own projects' })
    }

    await db.delete(projectAssignments).where(eq(projectAssignments.id, assignmentId))
    res.status(204).send()
  } catch (error) {
    console.error('Delete assignment error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get day assignments in date range
router.get('/days', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    let days
    if (startDate && endDate) {
      days = await db
        .select()
        .from(dayAssignments)
        .where(
          and(
            gte(dayAssignments.date, startDate as string),
            lte(dayAssignments.date, endDate as string)
          )
        )
    } else {
      days = await db.select().from(dayAssignments)
    }

    const daysWithDetails = await Promise.all(
      days.map(async (day) => {
        const assignment = await db.query.projectAssignments.findFirst({
          where: (projectAssignments, { eq }) => eq(projectAssignments.id, day.projectAssignmentId),
        })

        if (!assignment) return null

        const project = await db.query.projects.findFirst({
          where: (projects, { eq }) => eq(projects.id, assignment.projectId),
        })

        const member = await db.query.teamMembers.findFirst({
          where: (teamMembers, { eq }) => eq(teamMembers.id, assignment.teamMemberId),
        })

        return {
          ...day,
          projectAssignment: assignment,
          project,
          teamMember: member,
        }
      })
    )

    res.json(daysWithDetails.filter(Boolean))
  } catch (error) {
    console.error('Get day assignments error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Create day assignment (admin or project manager for their own projects)
router.post('/days', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const data = dayAssignmentSchema.parse(req.body)

    // Check project ownership via project assignment
    const projectId = await getProjectIdFromAssignment(data.projectAssignmentId)
    if (!projectId || !await canModifyProject(req.user!.userId, req.user!.role, projectId)) {
      return res.status(403).json({ error: 'You can only create day assignments for your own projects' })
    }

    // Check if this day assignment already exists (avoid duplicates)
    const existing = await db.query.dayAssignments.findFirst({
      where: (da, { and, eq }) => and(
        eq(da.projectAssignmentId, data.projectAssignmentId),
        eq(da.date, data.date)
      )
    })

    let dayAssignment
    if (existing) {
      // Day already exists, just return it (and still run merge logic below)
      dayAssignment = existing
    } else {
      // Create new day assignment
      const [created] = await db.insert(dayAssignments).values(data).returning()
      dayAssignment = created
    }

    // Handle potential group merges when adding a day
    const mergeResult = await handleGroupMergeOnDayAdd(data.projectAssignmentId, data.date)

    res.status(existing ? 200 : 201).json({
      ...dayAssignment,
      groupMerge: mergeResult.merged ? mergeResult : undefined
    })
  } catch (error) {
    handleRouteError(res, error, 'Create day assignment error', 400, 'Invalid request')
  }
})

// Update day assignment (admin or project manager for their own projects)
router.put('/days/:id', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const id = parseIdParam(req.params.id, res, 'day assignment ID')
    if (id === null) return
    const { comment } = req.body

    // Get the day assignment to check ownership
    const dayAssignment = await db.query.dayAssignments.findFirst({
      where: (da, { eq }) => eq(da.id, id)
    })

    if (!dayAssignment) {
      return res.status(404).json({ error: 'Day assignment not found' })
    }

    // Check project ownership via project assignment
    const projectId = await getProjectIdFromAssignment(dayAssignment.projectAssignmentId)
    if (!projectId || !await canModifyProject(req.user!.userId, req.user!.role, projectId)) {
      return res.status(403).json({ error: 'You can only update day assignments for your own projects' })
    }

    const [updated] = await db
      .update(dayAssignments)
      .set({ comment })
      .where(eq(dayAssignments.id, id))
      .returning()

    res.json(updated)
  } catch (error) {
    handleRouteError(res, error, 'Update day assignment error', 400, 'Invalid request')
  }
})

// Batch delete multiple day assignments at once - MUST come before /days/:id
router.delete('/days/batch', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const data = req.body as { ids: number[] }

    if (!Array.isArray(data.ids)) {
      return res.status(400).json({ error: 'Invalid request: ids array required' })
    }

    // Get all assignments to check ownership
    const assignments = await db.query.dayAssignments.findMany({
      where: (da, { inArray }) => inArray(da.id, data.ids)
    })

    if (assignments.length !== data.ids.length) {
      return res.status(404).json({ error: 'Some assignments not found' })
    }

    // Check project ownership for all assignments
    for (const assignment of assignments) {
      const projectId = await getProjectIdFromAssignment(assignment.projectAssignmentId)
      if (!projectId || !await canModifyProject(req.user!.userId, req.user!.role, projectId)) {
        return res.status(403).json({ error: 'You can only delete day assignments for your own projects' })
      }
    }

    // Delete all assignments
    await db.delete(dayAssignments).where(inArray(dayAssignments.id, data.ids))

    // Run group split once for each affected project assignment
    const uniqueProjectAssignments = [...new Set(assignments.map(a => a.projectAssignmentId))]
    for (const paId of uniqueProjectAssignments) {
      // Get all remaining day assignments for this project assignment to run merge logic
      const remainingDays = await db.query.dayAssignments.findMany({
        where: (da, { eq }) => eq(da.projectAssignmentId, paId)
      })

      if (remainingDays.length > 0) {
        await handleGroupSplitOnDayDelete(paId, assignments[0].date)
      }

      // Clean up any orphaned groups (groups with no day assignments)
      await cleanupOrphanedGroups(paId)
    }

    res.status(204).send()
  } catch (error) {
    console.error('Error deleting batch day assignments:', error)
    res.status(500).json({ error: 'Failed to delete batch day assignments' })
  }
})

// Delete day assignment (admin or project manager for their own projects)
router.delete('/days/:id', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const id = parseIdParam(req.params.id, res, 'day assignment ID')
    if (id === null) return

    // Get the day assignment first so we know its date and projectAssignmentId
    const dayAssignment = await db.query.dayAssignments.findFirst({
      where: (da, { eq }) => eq(da.id, id)
    })

    if (!dayAssignment) {
      return res.status(404).json({ error: 'Day assignment not found' })
    }

    // Check project ownership via project assignment
    const projectId = await getProjectIdFromAssignment(dayAssignment.projectAssignmentId)
    if (!projectId || !await canModifyProject(req.user!.userId, req.user!.role, projectId)) {
      return res.status(403).json({ error: 'You can only delete day assignments for your own projects' })
    }

    // Delete the day assignment
    await db.delete(dayAssignments).where(eq(dayAssignments.id, id))

    // Handle potential group splits when deleting a day
    await handleGroupSplitOnDayDelete(
      dayAssignment.projectAssignmentId,
      dayAssignment.date
    )

    // Clean up any orphaned groups (groups with no day assignments)
    await cleanupOrphanedGroups(dayAssignment.projectAssignmentId)

    res.status(204).send()
  } catch (error) {
    console.error('Delete day assignment error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Batch create multiple day assignments at once
router.post('/days/batch', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const data = req.body as { projectAssignmentId: number; dates: string[] }

    if (!data.projectAssignmentId || !Array.isArray(data.dates)) {
      return res.status(400).json({ error: 'Invalid request: projectAssignmentId and dates array required' })
    }

    // Validate all dates match YYYY-MM-DD format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!data.dates.every(date => dateRegex.test(date))) {
      return res.status(400).json({ error: 'Invalid date format: use YYYY-MM-DD' })
    }

    // Check project ownership via project assignment
    const projectId = await getProjectIdFromAssignment(data.projectAssignmentId)
    if (!projectId || !await canModifyProject(req.user!.userId, req.user!.role, projectId)) {
      return res.status(403).json({ error: 'You can only create day assignments for your own projects' })
    }

    // Create all day assignments
    const createdAssignments = []
    for (const date of data.dates) {
      // Check if assignment already exists
      const existing = await db.query.dayAssignments.findFirst({
        where: (da, { and, eq }) => and(
          eq(da.projectAssignmentId, data.projectAssignmentId),
          eq(da.date, date)
        )
      })

      if (!existing) {
        const [created] = await db.insert(dayAssignments).values({
          projectAssignmentId: data.projectAssignmentId,
          date,
        }).returning()
        createdAssignments.push(created)
      }
    }

    // Run comprehensive group merge - finds all contiguous ranges and ensures
    // each is covered by exactly one group, merging any touching/overlapping groups
    if (createdAssignments.length > 0) {
      await handleBatchGroupMerge(data.projectAssignmentId)
    }

    res.json(createdAssignments)
  } catch (error) {
    console.error('Error creating batch day assignments:', error)
    res.status(500).json({ error: 'Failed to create batch day assignments' })
  }
})

// ============== Assignment Groups ==============

// Get all assignment groups (optionally filtered by date range)
router.get('/groups', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    let groups
    // Filter groups that overlap with the date range
    if (startDate && endDate) {
      groups = await db
        .select()
        .from(assignmentGroups)
        .where(
          and(
            lte(assignmentGroups.startDate, endDate as string),
            gte(assignmentGroups.endDate, startDate as string)
          )
        )
    } else {
      groups = await db.select().from(assignmentGroups)
    }

    res.json(groups)
  } catch (error) {
    console.error('Get assignment groups error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Create assignment group (admin or project manager for their own projects)
router.post('/groups', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const data = assignmentGroupSchema.parse(req.body)

    // Check project ownership via project assignment
    const projectId = await getProjectIdFromAssignment(data.projectAssignmentId)
    if (!projectId || !await canModifyProject(req.user!.userId, req.user!.role, projectId)) {
      return res.status(403).json({ error: 'You can only create assignment groups for your own projects' })
    }

    // Validate that endDate >= startDate
    if (data.endDate < data.startDate) {
      return res.status(400).json({ error: 'endDate must be >= startDate' })
    }

    // Check for overlapping groups with the same projectAssignmentId
    const overlapping = await db
      .select()
      .from(assignmentGroups)
      .where(
        and(
          eq(assignmentGroups.projectAssignmentId, data.projectAssignmentId),
          lte(assignmentGroups.startDate, data.endDate),
          gte(assignmentGroups.endDate, data.startDate)
        )
      )

    if (overlapping.length > 0) {
      return res.status(400).json({
        error: 'Overlapping group exists',
        existingGroupId: overlapping[0].id
      })
    }

    const [group] = await db.insert(assignmentGroups).values(data).returning()
    res.status(201).json(group)
  } catch (error) {
    handleRouteError(res, error, 'Create assignment group error', 400, 'Invalid request')
  }
})

// Update assignment group (admin or project manager for their own projects)
router.put('/groups/:id', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const id = parseIdParam(req.params.id, res, 'assignment group ID')
    if (id === null) return
    const data = updateAssignmentGroupSchema.parse(req.body)

    // Get the group to check ownership
    const group = await db.query.assignmentGroups.findFirst({
      where: (ag, { eq }) => eq(ag.id, id)
    })

    if (!group) {
      return res.status(404).json({ error: 'Assignment group not found' })
    }

    // Check project ownership via project assignment
    const projectId = await getProjectIdFromAssignment(group.projectAssignmentId)
    if (!projectId || !await canModifyProject(req.user!.userId, req.user!.role, projectId)) {
      return res.status(403).json({ error: 'You can only update assignment groups for your own projects' })
    }

    const updateData: { priority?: 'high' | 'normal' | 'low'; comment?: string | null } = {}
    if (data.priority !== undefined) updateData.priority = data.priority
    if (data.comment !== undefined) updateData.comment = data.comment

    const [updated] = await db
      .update(assignmentGroups)
      .set(updateData)
      .where(eq(assignmentGroups.id, id))
      .returning()

    res.json(updated)
  } catch (error) {
    handleRouteError(res, error, 'Update assignment group error', 400, 'Invalid request')
  }
})

// Delete assignment group (admin or project manager for their own projects)
router.delete('/groups/:id', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const id = parseIdParam(req.params.id, res, 'assignment group ID')
    if (id === null) return

    // Get the group to check ownership
    const group = await db.query.assignmentGroups.findFirst({
      where: (ag, { eq }) => eq(ag.id, id)
    })

    if (!group) {
      return res.status(404).json({ error: 'Assignment group not found' })
    }

    // Check project ownership via project assignment
    const projectId = await getProjectIdFromAssignment(group.projectAssignmentId)
    if (!projectId || !await canModifyProject(req.user!.userId, req.user!.role, projectId)) {
      return res.status(403).json({ error: 'You can only delete assignment groups for your own projects' })
    }

    await db.delete(assignmentGroups).where(eq(assignmentGroups.id, id))
    res.status(204).send()
  } catch (error) {
    console.error('Delete assignment group error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Move project assignment to new date range with merge support
router.post('/projects/:id/move', authenticate, requireAdminOrProjectManager, async (req: AuthRequest, res) => {
  try {
    const projectAssignmentId = parseIdParam(req.params.id, res, 'project assignment ID')
    if (projectAssignmentId === null) return
    const { oldStartDate: providedOldStartDate, oldEndDate: providedOldEndDate, newStartDate, newEndDate } = req.body

    // Validate dates
    if (!newStartDate || !newEndDate) {
      return res.status(400).json({ error: 'newStartDate and newEndDate are required' })
    }

    if (new Date(newStartDate) > new Date(newEndDate)) {
      return res.status(400).json({ error: 'Invalid date range: start date must be before or equal to end date' })
    }

    // Get the project assignment
    const projectAssignment = await db.query.projectAssignments.findFirst({
      where: (pa, { eq }) => eq(pa.id, projectAssignmentId)
    })

    if (!projectAssignment) {
      return res.status(404).json({ error: 'Assignment not found' })
    }

    // Check project ownership
    const projectId = projectAssignment.projectId
    if (!await canModifyProject(req.user!.userId, req.user!.role, projectId)) {
      return res.status(403).json({ error: 'You can only move assignments for your own projects' })
    }

    // Get existing day assignments for this project assignment
    // If oldStartDate/oldEndDate are provided, only get days in that contiguous block
    // Otherwise, get all days (for ALT+drag move operations)
    const existingDays = providedOldStartDate && providedOldEndDate
      ? await db.query.dayAssignments.findMany({
          where: (da, { and, eq, gte, lte }) => and(
            eq(da.projectAssignmentId, projectAssignmentId),
            gte(da.date, providedOldStartDate),
            lte(da.date, providedOldEndDate)
          ),
        })
      : await db.query.dayAssignments.findMany({
          where: (da, { eq }) => eq(da.projectAssignmentId, projectAssignmentId),
        })

    if (existingDays.length === 0) {
      return res.status(400).json({ error: 'No day assignments to move' })
    }

    // Sort existing days and get old date range
    const sortedDays = existingDays.map(d => d.date).sort()
    const oldStartDate = providedOldStartDate || sortedDays[0]
    const oldEndDate = providedOldEndDate || sortedDays[sortedDays.length - 1]

    // Generate date range for new position
    const generateDateRange = (start: string, end: string): string[] => {
      const dates: string[] = []
      const startDate = new Date(start)
      const endDate = new Date(end)
      const current = new Date(startDate)

      while (current <= endDate) {
        dates.push(current.toISOString().split('T')[0])
        current.setDate(current.getDate() + 1)
      }

      return dates
    }

    const oldDates = sortedDays
    const newDates = generateDateRange(newStartDate, newEndDate)

    // Calculate what dates to add/remove
    const datesToAdd = newDates.filter(d => !oldDates.includes(d))
    const datesToRemove = oldDates.filter(d => !newDates.includes(d))

    // Get assignment group metadata to preserve
    const assignmentGroup = await db.query.assignmentGroups.findFirst({
      where: (ag, { and, eq }) => and(
        eq(ag.projectAssignmentId, projectAssignmentId),
        eq(ag.startDate, oldStartDate),
        eq(ag.endDate, oldEndDate)
      )
    })

    // STEP 1: Remove dates from old range
    if (datesToRemove.length > 0) {
      const idsToDelete = existingDays
        .filter(d => datesToRemove.includes(d.date))
        .map(d => d.id)
      if (idsToDelete.length > 0) {
        await db.delete(dayAssignments).where(inArray(dayAssignments.id, idsToDelete))
      }
    }

    // STEP 2: Add dates to new range
    if (datesToAdd.length > 0) {
      await db.insert(dayAssignments).values(
        datesToAdd.map(date => ({
          projectAssignmentId,
          date,
          comment: null
        }))
      )
    }

    // STEP 3: Update assignment group to new range
    if (assignmentGroup) {
      await db
        .update(assignmentGroups)
        .set({
          startDate: newStartDate,
          endDate: newEndDate
        })
        .where(eq(assignmentGroups.id, assignmentGroup.id))
    }

    // STEP 4: Apply comprehensive merge logic (handles all edge cases)
    const { handleAssignmentMerge } = await import('../utils/groupMerge.js')
    await handleAssignmentMerge(projectAssignmentId, newDates, {
      expandSearchForAdjacent: true // Look for adjacent blocks in other ProjectAssignments
    })

    // Get updated day assignments
    const updatedDays = await db.query.dayAssignments.findMany({
      where: (da, { eq }) => eq(da.projectAssignmentId, projectAssignmentId),
    })

    res.json({
      projectAssignmentId,
      dayAssignments: updatedDays,
    })
  } catch (error) {
    console.error('Move assignment error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
