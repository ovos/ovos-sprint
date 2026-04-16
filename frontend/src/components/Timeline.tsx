import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import type { Milestone, AssignmentGroup, AssignmentPriority } from '@/types'
import { isWeekend } from '@/lib/holidays'
import { TooltipProvider } from './ui/tooltip'
import { format, addDays, startOfDay } from 'date-fns'
import { enGB } from 'date-fns/locale'
import { WarningDialog } from './ui/warning-dialog'
import { AssignmentEditPopover } from './AssignmentEditPopover'
import { DragProvider, useDragContext } from '@/contexts/DragContext'
import { useDragAssignment } from '@/hooks/useDragAssignment'
import { useTimelineWarning } from '@/hooks/useTimelineWarning'
import { useEditPopover } from '@/hooks/useEditPopover'
import { useTimelineData } from '@/hooks/useTimelineData'
import { useTimelineMutations } from '@/hooks/useTimelineMutations'
import { TimelineViewContent } from './timeline/TimelineViewContent'
import {
  ZOOM_COLUMN_WIDTHS,
  DEFAULT_COLUMN_WIDTH,
  type ZoomLevel
} from '@/lib/timeline-constants'
import {
  getMemberAssignmentsOnDate,
  getProjectMembersOnDate
} from '@/lib/timeline-helpers'
import type { TimelineProps } from './types'

// Inner Timeline component that uses drag context
function TimelineInner({
  viewMode,
  prevDays,
  nextDays,
  isAdmin,
  currentUserId,
  currentUserRole,
  selectedTeamIds,
  zoomLevel,
  expandedItems: expandedItemsProp,
  onExpandedItemsChange,
  showTentative,
  showWeekends,
  showOverlaps,
  hideEmptyRows,
}: TimelineProps) {
  // Track if initial expansion has been done to prevent re-expanding when user collapses all
  const hasInitializedExpansion = useRef(false)

  // Convert expandedItems array to Set for easier manipulation (memoized to preserve reference stability)
  const expandedItemsSet = useMemo(() => new Set(expandedItemsProp), [expandedItemsProp])

  // Column width based on zoom level (1=extra narrow, 2=compact, 3=narrow, 4=normal)
  const columnWidth = ZOOM_COLUMN_WIDTHS[zoomLevel as ZoomLevel] || DEFAULT_COLUMN_WIDTH

  // Generate dates
  const today = startOfDay(new Date())
  const startDate = addDays(today, -prevDays)
  const allDates: Date[] = []
  for (let i = 0; i <= prevDays + nextDays; i++) {
    allDates.push(addDays(startDate, i))
  }

  // Filter out weekends if showWeekends is disabled
  const dates = showWeekends ? allDates : allDates.filter(date => !isWeekend(date))

  // Group dates by month for month labels
  const monthGroups: { month: string; count: number; firstDate: Date }[] = []
  let currentMonth = ''
  let currentCount = 0
  let currentFirstDate: Date | null = null

  dates.forEach((date) => {
    const monthKey = format(date, 'MMMM yyyy', { locale: enGB })
    if (monthKey !== currentMonth) {
      if (currentMonth) {
        monthGroups.push({ month: currentMonth, count: currentCount, firstDate: currentFirstDate! })
      }
      currentMonth = monthKey
      currentCount = 1
      currentFirstDate = date
    } else {
      currentCount++
    }
  })
  if (currentMonth) {
    monthGroups.push({ month: currentMonth, count: currentCount, firstDate: currentFirstDate! })
  }

  // Fetch timeline data using custom hook
  const {
    filteredProjects,
    filteredMembers: filteredMembersWithProjects,
    projectAssignments,
    dayAssignments,
    milestones,
    dayOffs,
    settings,
    assignmentGroups,
    isLoading,
  } = useTimelineData(
    startDate,
    dates[dates.length - 1],
    selectedTeamIds,
    showTentative,
    dates
  )

  // Get reference to data for helper functions
  const members = filteredMembersWithProjects
  const projects = filteredProjects

  // Memoize work schedule parsing to avoid repeated JSON.parse calls
  const workScheduleCache = useMemo(() => {
    const cache = new Map<number, any>()
    members.forEach(member => {
      try {
        cache.set(member.id, JSON.parse(member.workSchedule))
      } catch {
        cache.set(member.id, null)
      }
    })
    return cache
  }, [members])

  // Create lookup indexes for O(1) access (memoized)
  const dayAssignmentIndex = useMemo(() => {
    const index = new Map<string, any>() // key: "assignmentId-date"
    dayAssignments.forEach((da: any) => {
      if (da.projectAssignment?.id && da.date) {
        const key = `${da.projectAssignment.id}-${da.date}`
        index.set(key, da)
      }
    })
    return index
  }, [dayAssignments])

  const memberIndex = useMemo(() => {
    const index = new Map<number, any>()
    members.forEach(m => index.set(m.id, m))
    return index
  }, [members])

  const projectIndex = useMemo(() => {
    const index = new Map<number, any>()
    projects.forEach(p => index.set(p.id, p))
    return index
  }, [projects])

  const dayOffIndex = useMemo(() => {
    const index = new Set<string>() // key: "memberId-date"
    dayOffs.forEach((dayOff: any) => {
      if (dayOff.teamMemberId && dayOff.date) {
        const key = `${dayOff.teamMemberId}-${dayOff.date}`
        index.add(key)
      }
    })
    return index
  }, [dayOffs])

  // Helper function to check if a date is a day-off for a specific member
  const isDayOff = useCallback((memberId: number, date: Date): boolean => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const key = `${memberId}-${dateStr}`
    return dayOffIndex.has(key)
  }, [dayOffIndex])

  // Helper function to check if a date is a non-working day for a specific member
  const isNonWorkingDay = useCallback((memberId: number, date: Date): boolean => {
    // Check day-off first
    if (isDayOff(memberId, date)) return true

    const member = memberIndex.get(memberId)
    if (!member) return false

    // Use cached schedule instead of parsing every time
    const schedule = workScheduleCache.get(memberId)
    if (!schedule) {
      // If parsing failed, fall back to weekend check
      return isWeekend(date)
    }

    const dayOfWeek = date.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
    // Change from Sunday-first to Monday-first
    const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    const dayIndex = (dayOfWeek === 0) ? 6 : dayOfWeek - 1  // Convert Sun=0 to index 6
    return !schedule[dayKeys[dayIndex]]
  }, [memberIndex, isDayOff, workScheduleCache])

  // Helper function to check if current user can edit an assignment (by project assignment ID)
  const canEditAssignment = useCallback((projectAssignmentId: number): boolean => {
    if (!isAdmin) return false
    if (currentUserRole === 'admin') return true
    if (currentUserRole === 'project_manager' && currentUserId) {
      const assignment = projectAssignments.find((pa: any) => pa.id === projectAssignmentId)
      if (!assignment) return false
      const project = projects.find(p => p.id === assignment.projectId)
      return project?.managerId === currentUserId
    }
    return false
  }, [isAdmin, currentUserRole, currentUserId, projectAssignments, projects])

  // Get the assignment group for a specific date within an assignment
  const getGroupForDate = useCallback((assignmentId: number, date: Date): AssignmentGroup | null => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return assignmentGroups.find(g =>
      g.projectAssignmentId === assignmentId &&
      dateStr >= g.startDate &&
      dateStr <= g.endDate
    ) ?? null
  }, [assignmentGroups])

  // Use custom hooks for state management
  const { timelineWarning, setTimelineWarning } = useTimelineWarning()

  const { editPopover, setEditPopover, handleAssignmentClick } = useEditPopover(
    canEditAssignment,
    getGroupForDate
  )

  const {
    deleteDayAssignmentMutation,
    createBatchDayAssignmentsMutation,
    deleteBatchDayAssignmentsMutation,
    createMilestoneMutation,
    deleteMilestoneMutation,
    createDayOffMutation,
    deleteDayOffMutation,
    saveAssignmentGroupMutation,
    moveAssignmentMutation,
  } = useTimelineMutations()

  const getDayAssignmentId = useCallback((assignmentId: number, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const key = `${assignmentId}-${dateStr}`
    return dayAssignmentIndex.get(key)?.id
  }, [dayAssignmentIndex])

  const { handleMouseDown, handleMouseEnter, isDayInDragRange, getDragMode } = useDragAssignment(
    projectAssignments,
    filteredMembersWithProjects,
    settings,
    dayAssignments,
    dates,
    createBatchDayAssignmentsMutation,
    setTimelineWarning,
    isNonWorkingDay,
    getDayAssignmentId,
    deleteBatchDayAssignmentsMutation,
    moveAssignmentMutation
  )

  // Get drag state for visual feedback — subscribe so it's reactive during drags.
  // dragVersion state triggers re-renders; getDragState() reads the current ref value.
  const { getDragState, subscribe } = useDragContext()
  const [, setDragVersion] = useState(0)
  useEffect(() => {
    return subscribe(() => setDragVersion(v => v + 1))
  }, [subscribe])
  const dragState = getDragState()

  // Reset initialization flag when view mode changes
  useEffect(() => {
    hasInitializedExpansion.current = false
  }, [viewMode])

  // Initialize all items as expanded by default (when no saved preferences)
  useEffect(() => {
    // Only run once per view mode, and only if there are no saved preferences
    if (!hasInitializedExpansion.current && expandedItemsProp.length === 0 && (filteredProjects.length > 0 || filteredMembersWithProjects.length > 0)) {
      const allIds = viewMode === 'by-project'
        ? filteredProjects.map((p) => p.id)
        : filteredMembersWithProjects.map((m) => m.id)
      onExpandedItemsChange(allIds)
      hasInitializedExpansion.current = true
    }
  }, [filteredProjects, filteredMembersWithProjects, viewMode]) // Only run when data loads or view mode changes

  const toggleExpand = useCallback((id: number) => {
    const newExpandedSet = new Set(expandedItemsProp)
    if (newExpandedSet.has(id)) {
      newExpandedSet.delete(id)
    } else {
      newExpandedSet.add(id)
    }
    onExpandedItemsChange(Array.from(newExpandedSet))
  }, [expandedItemsProp, onExpandedItemsChange])

  // Helper function to check if current user can edit a specific project
  // Admins can edit all projects, PMs can only edit their own projects
  const canEditProject = useCallback((projectId: number): boolean => {
    if (!isAdmin) return false
    if (currentUserRole === 'admin') return true
    if (currentUserRole === 'project_manager' && currentUserId) {
      const project = projects.find(p => p.id === projectId)
      return project?.managerId === currentUserId
    }
    return false
  }, [isAdmin, currentUserRole, currentUserId, projects])

  const handleDeleteDayAssignment = useCallback((assignmentId: number, date: Date, event: React.MouseEvent) => {
    if (!canEditAssignment(assignmentId)) return

    event.preventDefault()
    event.stopPropagation()

    const dayAssignmentId = getDayAssignmentId(assignmentId, date)
    if (!dayAssignmentId) return

    deleteDayAssignmentMutation.mutate(dayAssignmentId)
  }, [canEditAssignment, getDayAssignmentId, deleteDayAssignmentMutation])

  // Get priority for a specific date within an assignment
  const getGroupPriority = useCallback((assignmentId: number, date: Date): AssignmentPriority => {
    const group = getGroupForDate(assignmentId, date)
    return group?.priority ?? 'normal'
  }, [getGroupForDate])

  // Milestone helper functions
  const getMilestoneId = useCallback((projectId: number, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const milestone = milestones.find(
      (m: Milestone) => m.projectId === projectId && m.date === dateStr
    )
    return milestone?.id
  }, [milestones])

  const handleProjectCellClick = useCallback((projectId: number, date: Date, _e: React.MouseEvent) => {
    if (!canEditProject(projectId) || viewMode !== 'by-project') return

    _e.preventDefault()
    _e.stopPropagation()

    // Check if there's already a milestone
    const milestoneId = getMilestoneId(projectId, date)
    if (milestoneId) {
      // Delete existing milestone if CTRL/CMD+click or right-click
      if (_e.ctrlKey || _e.metaKey || _e.button === 2) {
        deleteMilestoneMutation.mutate(milestoneId)
      }
    } else {
      // Create new milestone on normal click
      if (!_e.ctrlKey && !_e.metaKey && _e.button === 0) {
        createMilestoneMutation.mutate({
          projectId,
          date: format(date, 'yyyy-MM-dd'),
        })
      }
    }
  }, [canEditProject, viewMode, getMilestoneId, deleteMilestoneMutation, createMilestoneMutation])

  // Helper function to get day-off ID for deletion
  const getDayOffId = useCallback((memberId: number, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const dayOff = dayOffs.find(
      (d) => d.teamMemberId === memberId && d.date === dateStr
    )
    return dayOff?.id
  }, [dayOffs])

  // Handle member cell click for day-off management
  const handleMemberCellClick = useCallback((memberId: number, date: Date, _e: React.MouseEvent) => {
    if (!isAdmin || viewMode !== 'by-member') return

    _e.preventDefault()
    _e.stopPropagation()

    // Check if there's already a day-off
    const dayOffId = getDayOffId(memberId, date)
    if (dayOffId) {
      // Delete existing day-off if right-click
      if (_e.button === 2) {
        deleteDayOffMutation.mutate(dayOffId)
      }
    } else {
      // Create new day-off on normal click
      if (_e.button === 0) {
        createDayOffMutation.mutate({
          teamMemberId: memberId,
          date: format(date, 'yyyy-MM-dd'),
        })
      }
    }
  }, [isAdmin, viewMode, getDayOffId, deleteDayOffMutation, createDayOffMutation])

  const hasOverlap = useCallback((id: number, date: Date, mode: 'member' | 'project') => {
    if (!showOverlaps) return false

    const count = mode === 'member'
      ? getMemberAssignmentsOnDate(projectAssignments, dayAssignments, id, date)
      : getProjectMembersOnDate(projectAssignments, dayAssignments, id, date)

    return count > 1
  }, [showOverlaps, projectAssignments, dayAssignments])

  const content = viewMode === 'by-project' ? (
    <TimelineViewContent
      viewMode="by-project"
      items={filteredProjects}
      projects={projects}
      members={filteredMembersWithProjects}
      memberById={memberIndex}
      projectById={projectIndex}
      projectAssignments={projectAssignments}
      dayAssignments={dayAssignments}
      milestones={milestones}
      dayOffs={dayOffs}
      settings={settings}
      assignmentGroups={assignmentGroups}
      dates={dates}
      monthGroups={monthGroups}
      columnWidth={columnWidth}
      zoomLevel={zoomLevel}
      expandedItems={expandedItemsSet}
      onToggleExpand={toggleExpand}
      isAdmin={isAdmin}
      showOverlaps={showOverlaps}
      showTentative={showTentative}
      hideEmptyRows={hideEmptyRows}
      handleMouseDown={handleMouseDown}
      handleMouseEnter={handleMouseEnter}
      handleAssignmentClick={handleAssignmentClick}
      handleDeleteDayAssignment={handleDeleteDayAssignment}
      handleProjectCellClick={handleProjectCellClick}
      handleMemberCellClick={handleMemberCellClick}
      canEditProject={canEditProject}
      canEditAssignment={canEditAssignment}
      isDayOff={isDayOff}
      isNonWorkingDay={isNonWorkingDay}
      isDayInDragRange={isDayInDragRange}
      getDragMode={getDragMode}
      hasOverlap={hasOverlap}
      getGroupPriority={getGroupPriority}
      dragState={dragState}
    />
  ) : (
    <TimelineViewContent
      viewMode="by-member"
      items={filteredMembersWithProjects}
      projects={projects}
      members={filteredMembersWithProjects}
      memberById={memberIndex}
      projectById={projectIndex}
      projectAssignments={projectAssignments}
      dayAssignments={dayAssignments}
      milestones={milestones}
      dayOffs={dayOffs}
      settings={settings}
      assignmentGroups={assignmentGroups}
      dates={dates}
      monthGroups={monthGroups}
      columnWidth={columnWidth}
      zoomLevel={zoomLevel}
      expandedItems={expandedItemsSet}
      onToggleExpand={toggleExpand}
      isAdmin={isAdmin}
      showOverlaps={showOverlaps}
      showTentative={showTentative}
      hideEmptyRows={hideEmptyRows}
      handleMouseDown={handleMouseDown}
      handleMouseEnter={handleMouseEnter}
      handleAssignmentClick={handleAssignmentClick}
      handleDeleteDayAssignment={handleDeleteDayAssignment}
      handleProjectCellClick={handleProjectCellClick}
      handleMemberCellClick={handleMemberCellClick}
      canEditProject={canEditProject}
      canEditAssignment={canEditAssignment}
      isDayOff={isDayOff}
      isNonWorkingDay={isNonWorkingDay}
      isDayInDragRange={isDayInDragRange}
      getDragMode={getDragMode}
      hasOverlap={hasOverlap}
      getGroupPriority={getGroupPriority}
      dragState={dragState}
    />
  )

  // Show loading state until all data is ready
  // This prevents multiple re-renders with empty/partial data during React Query cascade
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading timeline data...</div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      {content}

      {/* Holiday/Non-Working Day Warning Dialog */}
      <WarningDialog
        open={!!timelineWarning}
        onOpenChange={() => setTimelineWarning(null)}
        title={timelineWarning?.type === 'holiday' ? 'Holiday Warning' : 'Non-Working Day'}
        message={timelineWarning?.message || ''}
        confirmLabel="Continue Anyway"
        skipLabel={timelineWarning?.onSkip ? "Skip Non-Working Days" : undefined}
        onConfirm={() => {
          timelineWarning?.onConfirm()
        }}
        onSkip={timelineWarning?.onSkip}
      />

      {/* Assignment Edit Popover */}
      {editPopover && (
        <AssignmentEditPopover
          open={editPopover.open}
          onOpenChange={(open) => {
            if (!open) setEditPopover(null)
          }}
          position={editPopover.position}
          group={editPopover.group}
          projectAssignmentId={editPopover.projectAssignmentId}
          dateRange={editPopover.dateRange}
          onSave={async (data) => {
            // If dates changed, move the assignment first
            if (data.startDate && data.endDate) {
              await moveAssignmentMutation.mutateAsync({
                projectAssignmentId: editPopover.projectAssignmentId,
                oldStartDate: editPopover.dateRange.start,
                oldEndDate: editPopover.dateRange.end,
                newStartDate: data.startDate,
                newEndDate: data.endDate,
              })
              // After move, save the group with new dates
              saveAssignmentGroupMutation.mutate({
                groupId: editPopover.group?.id,
                projectAssignmentId: editPopover.projectAssignmentId,
                startDate: data.startDate,
                endDate: data.endDate,
                priority: data.priority,
                comment: data.comment,
              })
            } else {
              // No date change, just save priority/comment
              saveAssignmentGroupMutation.mutate({
                groupId: editPopover.group?.id,
                projectAssignmentId: editPopover.projectAssignmentId,
                startDate: editPopover.dateRange.start,
                endDate: editPopover.dateRange.end,
                priority: data.priority,
                comment: data.comment,
              })
            }
            setEditPopover(null)
          }}
        />
      )}
    </TooltipProvider>
  )
}

// Outer Timeline component that provides drag context
export default function Timeline(props: TimelineProps) {
  return (
    <DragProvider>
      <TimelineInner {...props} />
    </DragProvider>
  )
}
