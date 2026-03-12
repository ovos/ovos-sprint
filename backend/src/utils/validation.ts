import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  token: z.string(),
})

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['user', 'project_manager', 'admin']).default('user'),
})

export const teamSchema = z.object({
  name: z.string().min(1),
})

export const customerSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional().nullable(),
  managerId: z.number().int().positive().optional().nullable(),
})

export const teamMemberSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  workSchedule: z.string().optional(),
})

export const projectSchema = z.object({
  customerId: z.number().int().positive(),
  name: z.string().min(1),
  status: z.enum(['confirmed', 'tentative', 'archived']),
  managerId: z.number().int().positive().optional().nullable(),
})

export const projectAssignmentSchema = z.object({
  projectId: z.number().int().positive(),
  teamMemberId: z.number().int().positive(),
})

export const dayAssignmentSchema = z.object({
  projectAssignmentId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comment: z.string().optional().nullable(),
})

export const settingsSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
})

export const TIMELINE_SETTINGS_CONSTRAINTS = {
  timelinePrevDays: { min: 0, max: 999 },
  timelineNextDays: { min: 0, max: 999 },
} as const

export const timelineSettingsSchema = z.object({
  key: z.enum(['timelinePrevDays', 'timelineNextDays']),
  value: z.string().refine(
    (val) => {
      const num = parseInt(val, 10)
      return !isNaN(num) && num >= 0 && num <= 999
    },
    { message: 'Value must be a number between 0 and 999' }
  ),
})

export function validateSettingByKey(key: string) {
  if (key === 'timelinePrevDays' || key === 'timelineNextDays') {
    return timelineSettingsSchema
  }
  return settingsSchema
}

export const updateUserRoleSchema = z.object({
  role: z.enum(['user', 'project_manager', 'admin']),
})

export const assignmentGroupSchema = z.object({
  projectAssignmentId: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
  comment: z.string().optional().nullable(),
})

export const updateAssignmentGroupSchema = z.object({
  priority: z.enum(['high', 'normal', 'low']).optional(),
  comment: z.string().optional().nullable(),
})

export const googleAuthSchema = z.object({
  idToken: z.string().min(1),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})
