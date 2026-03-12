import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { db, users, invitations, teamMembers, teamTeamMembers, passwordResets } from '../db/index.js'
import { generateToken } from '../utils/jwt.js'
import { loginSchema, registerSchema, inviteSchema, googleAuthSchema, forgotPasswordSchema, resetPasswordSchema } from '../utils/validation.js'
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js'
import { eq } from 'drizzle-orm'
import { emailService } from '../services/email/emailService.js'
import {
  generatePasswordResetToken,
  verifyPasswordResetToken,
  getPasswordResetExpiry
} from '../utils/passwordReset.js'
import { rateLimiter } from '../middleware/rateLimiter.js'
import { verifyGoogleToken } from '../utils/googleAuth.js'

const router = Router()

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body)

    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, email),
    })

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    if (!user.passwordHash) {
      return res.status(401).json({ error: 'This account uses Google Sign-In. Please log in with Google.' })
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash)
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(400).json({ error: 'Invalid request' })
  }
})

// Google Sign-In
router.post('/google', async (req, res) => {
  try {
    const { idToken } = googleAuthSchema.parse(req.body)

    const payload = await verifyGoogleToken(idToken)
    if (!payload) {
      return res.status(401).json({ error: 'Invalid Google token' })
    }

    // Check domain restriction
    const allowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN
    if (allowedDomain && payload.hd !== allowedDomain) {
      return res.status(403).json({
        error: `Only ${allowedDomain} accounts are allowed`
      })
    }

    // Try to find user by googleId first, then by email
    let user = await db.query.users.findFirst({
      where: eq(users.googleId, payload.sub),
    })

    if (!user) {
      // Check if a user with this email already exists (account merge)
      user = await db.query.users.findFirst({
        where: eq(users.email, payload.email),
      })

      if (user) {
        // Link Google ID to existing account
        await db.update(users)
          .set({ googleId: payload.sub })
          .where(eq(users.id, user.id))
        user = { ...user, googleId: payload.sub }
      } else {
        // Create new user
        const [newUser] = await db.insert(users).values({
          email: payload.email,
          googleId: payload.sub,
          role: 'user',
        }).returning()
        user = newUser

        // Link to team member if one exists with this email
        const member = await db.query.teamMembers.findFirst({
          where: eq(teamMembers.email, payload.email),
        })
        if (member) {
          await db.update(teamMembers)
            .set({ userId: newUser.id })
            .where(eq(teamMembers.id, member.id))
        }
      }
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    console.error('Google auth error:', error)
    res.status(400).json({ error: 'Invalid request' })
  }
})

// Register (complete invitation)
router.post('/register', async (req, res) => {
  try {
    const { email, password, token } = registerSchema.parse(req.body)

    // Verify invitation
    const invitation = await db.query.invitations.findFirst({
      where: (invitations, { and, eq, isNull }) =>
        and(
          eq(invitations.email, email),
          eq(invitations.token, token),
          isNull(invitations.usedAt)
        ),
    })

    if (!invitation) {
      return res.status(400).json({ error: 'Invalid invitation' })
    }

    // Check if invitation expired
    if (new Date(invitation.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'Invitation expired' })
    }

    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, email),
    })

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' })
    }

    // Create user with role from invitation
    const passwordHash = await bcrypt.hash(password, 10)
    const [newUser] = await db.insert(users).values({
      email,
      passwordHash,
      role: (invitation.role as 'admin' | 'user') || 'user',
    }).returning()

    // Mark invitation as used
    await db.update(invitations)
      .set({ usedAt: new Date().toISOString() })
      .where(eq(invitations.id, invitation.id))

    // Link user to member if member exists with this email
    const member = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.email, email),
    })

    if (member) {
      await db.update(teamMembers)
        .set({ userId: newUser.id })
        .where(eq(teamMembers.id, member.id))
    }

    const authToken = generateToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
    })

    res.json({
      token: authToken,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.createdAt,
      },
    })
  } catch (error) {
    console.error('Register error:', error)
    res.status(400).json({ error: 'Invalid request' })
  }
})

// Forgot password
router.post('/forgot-password', rateLimiter(3, 15 * 60 * 1000), async (req, res) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body)

    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, email),
    })

    // Always return success (don't reveal if email exists - security)
    if (!user) {
      console.log(`Password reset requested for non-existent email: ${email}`)
      return res.json({
        message: 'If that email exists, a password reset link has been sent'
      })
    }

    const { token, tokenHash } = generatePasswordResetToken()
    const expiresAt = getPasswordResetExpiry()

    // Delete existing tokens for this user
    await db.delete(passwordResets)
      .where(eq(passwordResets.userId, user.id))

    // Create new token
    await db.insert(passwordResets).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    })

    // Send email
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`

    await emailService.sendPasswordReset(email, {
      userName: email.split('@')[0],
      resetLink,
      expiresInHours: 1,
    })

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔐 Password reset email sent to:', email)
    console.log('🔗 Reset link:', resetLink)
    console.log('⏰ Expires at:', expiresAt)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    res.json({
      message: 'If that email exists, a password reset link has been sent'
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    res.status(400).json({ error: 'Invalid request' })
  }
})

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body)

    // Find all non-expired tokens
    const now = new Date().toISOString()
    const allResets = await db.query.passwordResets.findMany({
      where: (passwordResets, { gt }) => gt(passwordResets.expiresAt, now),
    })

    // Find matching token by verifying hash
    let matchingReset = null
    for (const reset of allResets) {
      if (verifyPasswordResetToken(token, reset.tokenHash)) {
        matchingReset = reset
        break
      }
    }

    if (!matchingReset) {
      return res.status(400).json({
        error: 'Invalid or expired reset token'
      })
    }

    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, matchingReset.userId),
    })

    if (!user) {
      return res.status(400).json({ error: 'User not found' })
    }

    // Update password
    const passwordHash = await bcrypt.hash(password, 10)
    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, user.id))

    // Delete the used token (single-use)
    await db.delete(passwordResets)
      .where(eq(passwordResets.id, matchingReset.id))

    console.log(`✅ Password reset successful for user: ${user.email}`)

    res.json({
      message: 'Password reset successful. You can now log in with your new password.'
    })
  } catch (error) {
    console.error('Reset password error:', error)
    res.status(400).json({ error: 'Invalid request' })
  }
})

// Invite user (admin only)
router.post('/invite', authenticate, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const body = _req.body; // Explicitly assign _req.body to a variable
    const { email, role } = inviteSchema.parse(body); // Use the variable

    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, email),
    })

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' })
    }

    // Create invitation
    const token = uuidv4()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // Expires in 7 days

    await db.insert(invitations).values({
      email,
      role,
      token,
      expiresAt: expiresAt.toISOString(),
    }).returning()

    // Send invitation email
    const invitationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/register?token=${token}&email=${encodeURIComponent(email)}`

    const inviterUser = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, _req.user!.userId),
    })

    const inviterName = inviterUser?.email || 'Admin'

    // Send email
    await emailService.sendUserInvite(email, {
      inviterName,
      inviteLink: invitationLink,
      expiresInDays: 7,
      role: role as 'admin' | 'user',
    })

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📧 Invitation sent to:', email)
    console.log('🔗 Invitation link:', invitationLink)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    res.json({
      message: 'Invitation sent successfully',
      invitationLink,
    })
  } catch (error) {
    console.error('Invite error:', error)
    res.status(400).json({ error: 'Invalid request' })
  }
})

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const includeTeams = req.query.include === 'teams'

    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    }

    // Optionally include team member and teams for first-time filter initialization
    if (includeTeams) {
      // Find linked team member
      const member = await db.query.teamMembers.findFirst({
        where: eq(teamMembers.userId, userId)
      })

      if (member) {
        // Get teams for this member
        const teamLinks = await db.query.teamTeamMembers.findMany({
          where: eq(teamTeamMembers.teamMemberId, member.id)
        })
        const teamIds = teamLinks.map(link => link.teamId)

        // Return enhanced data with team member and teams
        return res.json({
          ...safeUser,
          teamMember: {
            id: member.id,
            firstName: member.firstName,
            lastName: member.lastName,
            email: member.email
          },
          teams: teamIds
        })
      }
    }

    res.json(safeUser)
  } catch (error) {
    console.error('Get me error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
