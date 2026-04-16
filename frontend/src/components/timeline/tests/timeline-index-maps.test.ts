/**
 * Tests for Phase 3: Memoized index Maps for member/project lookups
 *
 * Verifies that:
 * 1. memberById Map contains all members indexed by id
 * 2. projectById Map contains all projects indexed by id
 * 3. Map.get() returns the same object as Array.find() for all assignments
 * 4. Missing IDs return undefined (same as find returning undefined)
 */
import { describe, it, expect } from 'vitest'
import type { Project, TeamMember, ProjectAssignment } from '@/types'

// Helper to build index maps (same logic that will be used in Timeline.tsx)
function buildMemberIndex(members: TeamMember[]): Map<number, TeamMember> {
  const index = new Map<number, TeamMember>()
  members.forEach(m => index.set(m.id, m))
  return index
}

function buildProjectIndex(projects: Project[]): Map<number, Project> {
  const index = new Map<number, Project>()
  projects.forEach(p => index.set(p.id, p))
  return index
}

// Test fixtures
const members: TeamMember[] = [
  { id: 1, firstName: 'Alice', lastName: 'A', avatarUrl: null, workSchedule: '{}', createdAt: '2026-01-01' },
  { id: 2, firstName: 'Bob', lastName: 'B', avatarUrl: null, workSchedule: '{}', createdAt: '2026-01-01' },
  { id: 3, firstName: 'Carol', lastName: 'C', avatarUrl: null, workSchedule: '{}', createdAt: '2026-01-01' },
]

const projects: Project[] = [
  { id: 10, customerId: 1, name: 'Project Alpha', status: 'confirmed', managerId: null, createdAt: '2026-01-01' },
  { id: 20, customerId: 1, name: 'Project Beta', status: 'tentative', managerId: null, createdAt: '2026-01-01' },
  { id: 30, customerId: 2, name: 'Project Gamma', status: 'confirmed', managerId: null, createdAt: '2026-01-01' },
]

const assignments: ProjectAssignment[] = [
  { id: 100, projectId: 10, teamMemberId: 1, createdAt: '2026-01-01' },
  { id: 101, projectId: 10, teamMemberId: 2, createdAt: '2026-01-01' },
  { id: 102, projectId: 20, teamMemberId: 3, createdAt: '2026-01-01' },
  { id: 103, projectId: 30, teamMemberId: 1, createdAt: '2026-01-01' },
]

describe('Timeline index maps', () => {
  describe('buildMemberIndex', () => {
    it('creates a Map with all members indexed by id', () => {
      const index = buildMemberIndex(members)
      expect(index.size).toBe(3)
      expect(index.get(1)).toBe(members[0])
      expect(index.get(2)).toBe(members[1])
      expect(index.get(3)).toBe(members[2])
    })

    it('returns undefined for missing IDs', () => {
      const index = buildMemberIndex(members)
      expect(index.get(999)).toBeUndefined()
    })

    it('handles empty array', () => {
      const index = buildMemberIndex([])
      expect(index.size).toBe(0)
    })
  })

  describe('buildProjectIndex', () => {
    it('creates a Map with all projects indexed by id', () => {
      const index = buildProjectIndex(projects)
      expect(index.size).toBe(3)
      expect(index.get(10)).toBe(projects[0])
      expect(index.get(20)).toBe(projects[1])
      expect(index.get(30)).toBe(projects[2])
    })

    it('returns undefined for missing IDs', () => {
      const index = buildProjectIndex(projects)
      expect(index.get(999)).toBeUndefined()
    })

    it('handles empty array', () => {
      const index = buildProjectIndex([])
      expect(index.size).toBe(0)
    })
  })

  describe('Map.get() matches Array.find() for all assignments', () => {
    it('memberById.get(id) returns same object as members.find() for every assignment', () => {
      const memberById = buildMemberIndex(members)

      for (const assignment of assignments) {
        const fromMap = memberById.get(assignment.teamMemberId)
        const fromFind = members.find(m => m.id === assignment.teamMemberId)
        expect(fromMap).toBe(fromFind)
      }
    })

    it('projectById.get(id) returns same object as projects.find() for every assignment', () => {
      const projectById = buildProjectIndex(projects)

      for (const assignment of assignments) {
        const fromMap = projectById.get(assignment.projectId)
        const fromFind = projects.find(p => p.id === assignment.projectId)
        expect(fromMap).toBe(fromFind)
      }
    })

    it('both return undefined for assignments referencing non-existent entities', () => {
      const memberById = buildMemberIndex(members)
      const projectById = buildProjectIndex(projects)

      const orphanAssignment: ProjectAssignment = {
        id: 999, projectId: 999, teamMemberId: 999, createdAt: '2026-01-01',
      }

      expect(memberById.get(orphanAssignment.teamMemberId)).toBeUndefined()
      expect(members.find(m => m.id === orphanAssignment.teamMemberId)).toBeUndefined()

      expect(projectById.get(orphanAssignment.projectId)).toBeUndefined()
      expect(projects.find(p => p.id === orphanAssignment.projectId)).toBeUndefined()
    })
  })
})
