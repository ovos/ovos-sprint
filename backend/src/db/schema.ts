import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  googleId: text('google_id').unique(),
  role: text('role', { enum: ['admin', 'project_manager', 'user'] }).notNull().default('user'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
})

export const teams = sqliteTable('teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
})

export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  icon: text('icon'),
  managerId: integer('manager_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
})

export const teamMembers = sqliteTable('team_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  avatarUrl: text('avatar_url'),
  workSchedule: text('work_schedule')
    .notNull()
    .default('{"sun":false,"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false}'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
})

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  customerId: integer('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: text('status', { enum: ['confirmed', 'tentative', 'archived'] }).notNull().default('tentative'),
  managerId: integer('manager_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
})

export const teamTeamMembers = sqliteTable('team_team_members', {
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  teamMemberId: integer('team_member_id')
    .notNull()
    .references(() => teamMembers.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.teamId, table.teamMemberId] }),
}))

export const projectAssignments = sqliteTable('project_assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  teamMemberId: integer('team_member_id')
    .notNull()
    .references(() => teamMembers.id, { onDelete: 'cascade' }),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => ({
  projectIdx: index('idx_project_assignments_project').on(table.projectId),
  memberIdx: index('idx_project_assignments_member').on(table.teamMemberId),
}))

export const dayAssignments = sqliteTable('day_assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectAssignmentId: integer('project_assignment_id')
    .notNull()
    .references(() => projectAssignments.id, { onDelete: 'cascade' }),
  date: text('date').notNull(), // ISO date string (YYYY-MM-DD)
  comment: text('comment'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => ({
  assignmentIdx: index('idx_day_assignments_assignment').on(table.projectAssignmentId),
  dateIdx: index('idx_day_assignments_date').on(table.date),
}))

export const assignmentGroups = sqliteTable('assignment_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectAssignmentId: integer('project_assignment_id')
    .notNull()
    .references(() => projectAssignments.id, { onDelete: 'cascade' }),
  startDate: text('start_date').notNull(), // ISO date string (YYYY-MM-DD)
  endDate: text('end_date').notNull(), // ISO date string (YYYY-MM-DD)
  priority: text('priority', { enum: ['high', 'normal', 'low'] })
    .notNull()
    .default('normal'),
  comment: text('comment'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
})

export const invitations = sqliteTable('invitations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  role: text('role').notNull().default('user'),
  token: text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
})

export const passwordResets = sqliteTable('password_resets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
})

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => ({
  userKeyIdx: uniqueIndex('idx_settings_user_key').on(table.userId, table.key),
}))

export const milestones = sqliteTable('milestones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  date: text('date').notNull(), // ISO date string (YYYY-MM-DD)
  name: text('name'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => ({
  projectIdx: index('idx_milestones_project').on(table.projectId),
}))

export const dayOffs = sqliteTable('day_offs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamMemberId: integer('team_member_id')
    .notNull()
    .references(() => teamMembers.id, { onDelete: 'cascade' }),
  date: text('date').notNull(), // ISO date string (YYYY-MM-DD)
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => ({
  memberIdx: index('idx_day_offs_member').on(table.teamMemberId),
}))

// Types
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Team = typeof teams.$inferSelect
export type NewTeam = typeof teams.$inferInsert
export type TeamMember = typeof teamMembers.$inferSelect
export type NewTeamMember = typeof teamMembers.$inferInsert
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type ProjectAssignment = typeof projectAssignments.$inferSelect
export type NewProjectAssignment = typeof projectAssignments.$inferInsert
export type DayAssignment = typeof dayAssignments.$inferSelect
export type NewDayAssignment = typeof dayAssignments.$inferInsert
export type Invitation = typeof invitations.$inferSelect
export type NewInvitation = typeof invitations.$inferInsert
export type PasswordReset = typeof passwordResets.$inferSelect
export type NewPasswordReset = typeof passwordResets.$inferInsert
export type Settings = typeof settings.$inferSelect
export type NewSettings = typeof settings.$inferInsert
export type Milestone = typeof milestones.$inferSelect
export type NewMilestone = typeof milestones.$inferInsert
export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert
export type DayOff = typeof dayOffs.$inferSelect
export type NewDayOff = typeof dayOffs.$inferInsert
export type AssignmentGroup = typeof assignmentGroups.$inferSelect
export type NewAssignmentGroup = typeof assignmentGroups.$inferInsert

// Relations
export const projectsRelations = relations(projects, ({ one }) => ({
  customer: one(customers, {
    fields: [projects.customerId],
    references: [customers.id],
  }),
  manager: one(users, {
    fields: [projects.managerId],
    references: [users.id],
  }),
}))

export const customersRelations = relations(customers, ({ many, one }) => ({
  projects: many(projects),
  manager: one(users, {
    fields: [customers.managerId],
    references: [users.id],
  }),
}))

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}))

export const projectAssignmentsRelations = relations(projectAssignments, ({ one, many }) => ({
  project: one(projects, {
    fields: [projectAssignments.projectId],
    references: [projects.id],
  }),
  teamMember: one(teamMembers, {
    fields: [projectAssignments.teamMemberId],
    references: [teamMembers.id],
  }),
  dayAssignments: many(dayAssignments),
}))

export const dayAssignmentsRelations = relations(dayAssignments, ({ one }) => ({
  projectAssignment: one(projectAssignments, {
    fields: [dayAssignments.projectAssignmentId],
    references: [projectAssignments.id],
  }),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  teamMember: one(teamMembers, {
    fields: [users.id],
    references: [teamMembers.userId],
  }),
  settings: many(settings),
  managedProjects: many(projects),
  managedCustomers: many(customers),
}))
