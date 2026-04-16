import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { format } from 'date-fns'
import api from '@/api/client'
import { applyProjectFilters, applyMemberFilters } from '@/lib/timeline-filters'
import {
  Project,
  TeamMember,
  Milestone,
  DayOff,
  AssignmentGroup,
} from '@/types'

// Stale-time tiers for React Query caching.
// Mutations in useTimelineMutations.ts use invalidateQueries/refetchQueries on success,
// which bypasses staleTime — so these values only affect remount/refocus behavior.
const STALE_TIME_STATIC = 5 * 60 * 1000   // 5 min — projects, members, settings, team relationships
const STALE_TIME_DATE_RANGE = 30 * 1000    // 30 sec — day assignments, milestones, day-offs, assignment groups
const STALE_TIME_ASSIGNMENTS = 60 * 1000   // 1 min — project assignments

/**
 * Custom hook for fetching all timeline data with queries
 *
 * Fetches all necessary data for the timeline view including:
 * - Projects
 * - Team members
 * - Project assignments
 * - Day assignments
 * - Milestones
 * - Day offs
 * - Settings
 * - Assignment groups
 * - Team member relationships
 *
 * Also applies filtering based on selected teams and tentative status.
 *
 * @param startDate - Start date for date-range queries
 * @param endDate - End date for date-range queries
 * @param selectedTeamIds - Array of selected team IDs for filtering
 * @param showTentative - Whether to show tentative projects
 * @param dates - Array of dates in the timeline
 * @returns Object with all data and loading state
 */
export function useTimelineData(
  startDate: Date,
  endDate: Date,
  selectedTeamIds: number[],
  showTentative: boolean,
  _dates: Date[]
) {
  // Fetch all projects
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get('/projects')
      return response.data as Project[]
    },
    staleTime: STALE_TIME_STATIC,
  })

  // Fetch all team members
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const response = await api.get('/members')
      return response.data as TeamMember[]
    },
    staleTime: STALE_TIME_STATIC,
  })

  // Fetch project assignments
  const { data: projectAssignments = [], isLoading: projectAssignmentsLoading } = useQuery({
    queryKey: ['assignments', 'projects'],
    queryFn: async () => {
      const response = await api.get('/assignments/projects')
      return response.data
    },
    staleTime: STALE_TIME_ASSIGNMENTS,
  })

  // Fetch day assignments for date range
  const { data: dayAssignments = [], isLoading: dayAssignmentsLoading } = useQuery({
    queryKey: [
      'assignments',
      'days',
      format(startDate, 'yyyy-MM-dd'),
      format(endDate, 'yyyy-MM-dd'),
    ],
    queryFn: async () => {
      const response = await api.get('/assignments/days', {
        params: {
          startDate: format(startDate, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
        },
      })
      return response.data
    },
    staleTime: STALE_TIME_DATE_RANGE,
  })

  // Fetch milestones for date range
  const { data: milestones = [], isLoading: milestonesLoading } = useQuery({
    queryKey: [
      'milestones',
      format(startDate, 'yyyy-MM-dd'),
      format(endDate, 'yyyy-MM-dd'),
    ],
    queryFn: async () => {
      const response = await api.get('/milestones', {
        params: {
          startDate: format(startDate, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
        },
      })
      return response.data as Milestone[]
    },
    staleTime: STALE_TIME_DATE_RANGE,
  })

  // Fetch day offs for date range
  const { data: dayOffs = [], isLoading: dayOffsLoading } = useQuery({
    queryKey: [
      'day-offs',
      format(startDate, 'yyyy-MM-dd'),
      format(endDate, 'yyyy-MM-dd'),
    ],
    queryFn: async () => {
      const response = await api.get('/day-offs', {
        params: {
          startDate: format(startDate, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
        },
      })
      return response.data as DayOff[]
    },
    staleTime: STALE_TIME_DATE_RANGE,
  })

  // Fetch settings
  const { data: settings = {}, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings')
      return response.data as Record<string, string>
    },
    staleTime: STALE_TIME_STATIC,
  })

  // Fetch team member relationships
  const { data: teamMemberRelationships = [], isLoading: relationshipsLoading } = useQuery({
    queryKey: ['teams', 'members', 'relationships'],
    queryFn: async () => {
      const response = await api.get('/teams/members/relationships')
      return response.data as { teamId: number; teamMemberId: number }[]
    },
    staleTime: STALE_TIME_STATIC,
  })

  // Fetch assignment groups for date range
  const { data: assignmentGroups = [], isLoading: assignmentGroupsLoading } = useQuery({
    queryKey: [
      'assignment-groups',
      format(startDate, 'yyyy-MM-dd'),
      format(endDate, 'yyyy-MM-dd'),
    ],
    queryFn: async () => {
      const response = await api.get('/assignments/groups', {
        params: {
          startDate: format(startDate, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
        },
      })
      return response.data as AssignmentGroup[]
    },
    staleTime: STALE_TIME_DATE_RANGE,
  })

  // Memoize filtered projects to avoid recalculating on every render
  const filteredProjects = useMemo(() => {
    const start = performance.now()

    if (!projects || !projectAssignments || !teamMemberRelationships) {
      return []
    }

    const result = applyProjectFilters(
      projects,
      projectAssignments,
      teamMemberRelationships,
      selectedTeamIds,
      showTentative
    )

    const duration = performance.now() - start
    if (duration > 50) {
      console.warn(`[Performance] Project filtering took ${duration.toFixed(2)}ms`)
    }

    return result
  }, [projects, projectAssignments, teamMemberRelationships, selectedTeamIds, showTentative])

  // Memoize filtered members to avoid recalculating on every render
  const filteredMembers = useMemo(() => {
    const start = performance.now()

    if (!members || !projectAssignments || !projects || !teamMemberRelationships) {
      return []
    }

    const result = applyMemberFilters(
      members,
      teamMemberRelationships,
      selectedTeamIds,
      projectAssignments,
      projects,
      showTentative
    )

    const duration = performance.now() - start
    if (duration > 50) {
      console.warn(`[Performance] Member filtering took ${duration.toFixed(2)}ms`)
    }

    return result
  }, [members, teamMemberRelationships, selectedTeamIds, projectAssignments, projects, showTentative])

  // Check if any data is still loading
  const isLoading =
    projectsLoading ||
    membersLoading ||
    projectAssignmentsLoading ||
    dayAssignmentsLoading ||
    milestonesLoading ||
    dayOffsLoading ||
    settingsLoading ||
    relationshipsLoading ||
    assignmentGroupsLoading

  return {
    // Raw data
    projects,
    members,
    projectAssignments,
    dayAssignments,
    milestones,
    dayOffs,
    settings,
    teamMemberRelationships,
    assignmentGroups,
    // Filtered data
    filteredProjects,
    filteredMembers,
    // Loading state
    isLoading,
  }
}
