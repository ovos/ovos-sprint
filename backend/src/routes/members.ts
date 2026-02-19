import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import sharp from 'sharp'
import crypto from 'crypto'
import { db, teamMembers, invitations, users, projectAssignments, dayAssignments, dayOffs, teamTeamMembers } from '../db/index.js'
import { teamMemberSchema } from '../utils/validation.js'
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js'
import { eq, and, isNull } from 'drizzle-orm'
import { emailService } from '../services/email/emailService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = Router()

// Configure multer for avatar uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, './data/avatars')
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname))
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)

    if (mimetype && extname) {
      return cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'))
    }
  },
})

// Get all team members
router.get('/', authenticate, async (_req, res) => {
  try {
    const members = await db.query.teamMembers.findMany({
      orderBy: (teamMembers, { asc }) => [asc(teamMembers.lastName), asc(teamMembers.firstName)],
    })
    res.json(members)
  } catch (error) {
    console.error('Get members error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get cascade info for member deletion (admin only)
// MUST be before /:id route to avoid matching "cascade-info" as an ID
router.get('/:id/cascade-info', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const memberId = parseInt(req.params.id)

    const assignments = await db.query.projectAssignments.findMany({
      where: eq(projectAssignments.teamMemberId, memberId),
    })

    let totalDayAssignments = 0
    for (const assignment of assignments) {
      const dayAssigns = await db.query.dayAssignments.findMany({
        where: eq(dayAssignments.projectAssignmentId, assignment.id),
      })
      totalDayAssignments += dayAssigns.length
    }

    const memberDayOffs = await db.query.dayOffs.findMany({
      where: eq(dayOffs.teamMemberId, memberId),
    })

    const teamLinks = await db.query.teamTeamMembers.findMany({
      where: eq(teamTeamMembers.teamMemberId, memberId),
    })

    res.json({
      assignments: assignments.length,
      dayAssignments: totalDayAssignments,
      dayOffs: memberDayOffs.length,
      teamLinks: teamLinks.length,
    })
  } catch (error) {
    console.error('Get cascade info error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get team member by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const memberId = parseInt(req.params.id)
    const member = await db.query.teamMembers.findFirst({
      where: (teamMembers, { eq }) => eq(teamMembers.id, memberId),
    })

    if (!member) {
      return res.status(404).json({ error: 'Team member not found' })
    }

    res.json(member)
  } catch (error) {
    console.error('Get member error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Create team member (admin only)
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const data = teamMemberSchema.parse(req.body)
    const [member] = await db.insert(teamMembers).values(data).returning()
    res.status(201).json(member)
  } catch (error) {
    console.error('Create member error:', error)
    res.status(400).json({ error: 'Invalid request' })
  }
})

// Update team member (admin only)
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const memberId = parseInt(req.params.id)
    const data = teamMemberSchema.parse(req.body)

    const [updated] = await db
      .update(teamMembers)
      .set(data)
      .where(eq(teamMembers.id, memberId))
      .returning()

    if (!updated) {
      return res.status(404).json({ error: 'Team member not found' })
    }

    res.json(updated)
  } catch (error) {
    console.error('Update member error:', error)
    res.status(400).json({ error: 'Invalid request' })
  }
})

// Delete team member (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const memberId = parseInt(req.params.id)
    await db.delete(teamMembers).where(eq(teamMembers.id, memberId))
    res.status(204).send()
  } catch (error) {
    console.error('Delete member error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Upload avatar (admin only)
router.post('/:id/avatar', authenticate, requireAdmin, upload.single('avatar'), async (req: AuthRequest, res) => {
  try {
    const memberId = parseInt(req.params.id)

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    // Process image: resize to 256x256, crop to center, convert to PNG
    const processedFilename = `avatar-${Date.now()}-${Math.floor(Math.random() * 1000000000)}.png`
    const outputPath = path.join(__dirname, '../../data/avatars', processedFilename)

    await sharp(req.file.path)
      .resize(256, 256, {
        fit: 'cover',
        position: 'center'
      })
      .png({ quality: 90 })
      .toFile(outputPath)

    // Delete original uploaded file
    fs.unlinkSync(req.file.path)

    // Update database with new avatar URL
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`
    const avatarUrl = `${backendUrl}/avatars/${processedFilename}`

    const [updated] = await db
      .update(teamMembers)
      .set({ avatarUrl })
      .where(eq(teamMembers.id, memberId))
      .returning()

    if (!updated) {
      return res.status(404).json({ error: 'Team member not found' })
    }

    res.json(updated)
  } catch (error) {
    console.error('Upload avatar error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Invite member as user (admin only)
router.post('/:id/invite', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const memberId = parseInt(req.params.id)

    // Get member details
    const member = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.id, memberId),
    })

    if (!member) {
      return res.status(404).json({ error: 'Member not found' })
    }

    if (!member.email) {
      return res.status(400).json({ error: 'Member has no email address' })
    }

    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, member.email),
    })

    if (existingUser) {
      // User exists - link them to this member
      await db.update(teamMembers)
        .set({ userId: existingUser.id })
        .where(eq(teamMembers.id, member.id))

      return res.json({
        message: 'User linked successfully',
        email: member.email,
        linked: true
      })
    }

    // Check if invitation already exists
    const existingInvitation = await db.query.invitations.findFirst({
      where: and(
        eq(invitations.email, member.email),
        isNull(invitations.usedAt)
      ),
    })

    if (existingInvitation) {
      const now = new Date()
      const expiresAt = new Date(existingInvitation.expiresAt)

      if (expiresAt > now) {
        // Still valid — block resend with helpful message
        const expiresFormatted = expiresAt.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        })
        return res.status(400).json({
          error: `Invitation already pending (expires ${expiresFormatted})`
        })
      }

      // Expired — delete old invitation so a fresh one can be created
      await db.delete(invitations).where(eq(invitations.id, existingInvitation.id))
    }

    // Create invitation
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await db.insert(invitations).values({
      email: member.email,
      role: 'user',
      token,
      expiresAt,
    })

    // Send invitation email
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const inviteLink = `${frontendUrl}/register?token=${token}&email=${encodeURIComponent(member.email)}`

    const inviterUser = await db.query.users.findFirst({
      where: eq(users.id, req.user!.userId),
    })

    const inviterName = inviterUser?.email || 'Admin'
    const teamMemberName = `${member.firstName} ${member.lastName}`

    // Send team invite email
    await emailService.sendTeamInvite(member.email, {
      teamMemberName,
      inviterName,
      inviteLink,
      expiresInDays: 7,
    })

    console.log(`Invitation sent to ${member.email}: ${inviteLink}`)

    res.json({
      message: 'Invitation sent successfully',
      email: member.email,
      inviteLink
    })
  } catch (error) {
    console.error('Failed to create invitation:', error)
    res.status(500).json({ error: 'Failed to create invitation' })
  }
})

export default router
