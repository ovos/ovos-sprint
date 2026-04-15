import { useEffect, useCallback } from 'react'
import { UseMutationResult } from '@tanstack/react-query'
import { format, addDays } from 'date-fns'
import { isHoliday, getHolidayName } from '@/lib/holidays'
import { useDragContext } from '@/contexts/DragContext'
import { getContiguousRangeForDate, addDaysToDateString, daysDifference } from '@/lib/timeline-helpers'
import type { TimelineWarning } from '@/components/timeline/types'

/**
 * Custom hook for managing drag-to-assign functionality in the timeline
 *
 * Handles:
 * - Drag state tracking (start/end dates)
 * - Mouse event handlers for drag interaction
 * - Warning checks for holidays and non-working days
 * - Global mouseup event listener
 *
 * @param projectAssignments - Array of project assignments
 * @param members - Array of team members
 * @param settings - Settings object with configuration
 * @param _dayAssignments - Array of day assignments (unused, kept for API compatibility)
 * @param _dates - Array of dates in the timeline (unused, kept for API compatibility)
 * @param createBatchDayAssignmentsMutation - Mutation for creating batch day assignments
 * @param setTimelineWarning - Function to set timeline warning state
 * @param isNonWorkingDay - Function to check if a date is a non-working day for a member
 * @param getDayAssignmentId - Function to get day assignment ID for a specific date
 * @param deleteBatchDayAssignmentsMutation - Mutation for deleting batch day assignments
 * @returns Object with drag state and handler functions
 */
export function useDragAssignment(
  projectAssignments: any[],
  members: any[],
  settings: Record<string, string>,
  dayAssignments: any[],
  _dates: Date[],
  createBatchDayAssignmentsMutation: UseMutationResult<any, unknown, { projectAssignmentId: number; dates: string[] }, unknown>,
  setTimelineWarning: (warning: TimelineWarning | null) => void,
  isNonWorkingDay: (memberId: number, date: Date) => boolean,
  getDayAssignmentId: (assignmentId: number, date: Date) => number | undefined,
  deleteBatchDayAssignmentsMutation: UseMutationResult<any, unknown, number[], unknown>,
  moveAssignmentMutation?: UseMutationResult<any, unknown, { projectAssignmentId: number; oldStartDate?: string; oldEndDate?: string; newStartDate: string; newEndDate: string }, unknown>
) {
  // Use DragContext instead of local state to prevent Timeline re-renders
  const { getDragState, setDragState: setContextDragState, isDayInDragRange } = useDragContext()

  /**
   * Check if current user can edit a specific assignment
   * This is passed from parent and used to control drag permissions
   */
  const canEditAssignment = (_assignmentId: number): boolean => {
    // This will be passed from the Timeline component
    // For now, we'll just return true as a placeholder
    return true
  }

  /**
   * Handle mouse down on assignment cell to start drag
   */
  const handleMouseDown = useCallback((assignmentId: number, date: Date, event: React.MouseEvent) => {
    if (!canEditAssignment(assignmentId)) {
      return
    }

    // Detect mode based on modifier keys
    const isAltPressed = event.altKey
    const isDeleteTrigger = event.button === 2 || event.ctrlKey || event.metaKey

    // MOVE mode - ALT + click and drag
    if (isAltPressed) {
      // Find contiguous range at clicked date
      const contiguousRange = getContiguousRangeForDate(dayAssignments, assignmentId, date)

      if (!contiguousRange) {
        // No assignment to move at this date
        return
      }

      // Get the project assignment to get projectId and teamMemberId
      const assignment = projectAssignments.find((pa: any) => pa.id === assignmentId)
      if (!assignment) return

      // Start MOVE drag - store the clicked date as anchor point
      const clickedDateStr = format(date, 'yyyy-MM-dd')
      setContextDragState({
        assignmentId,
        startDate: date,
        endDate: date,
        mode: 'move',
        moveSource: {
          startDate: contiguousRange.start,
          endDate: contiguousRange.end,
        },
        moveAnchor: clickedDateStr, // Anchor point for calculating offset
        moveOffset: 0,
      })
      return
    }

    // DELETE mode - right-click or CTRL/CMD+click
    if (isDeleteTrigger) {
      // Start DELETE drag (from any cell - assigned or not)
      // Only assigned cells in the range will be deleted on mouseup
      setContextDragState({
        assignmentId,
        startDate: date,
        endDate: date,
        mode: 'delete',
      })
      return
    }

    // CREATE mode - normal click and drag (existing behavior)
    setContextDragState({
      assignmentId,
      startDate: date,
      endDate: date,
      mode: 'create',
    })
  }, [setContextDragState, dayAssignments, projectAssignments])

  /**
   * Handle mouse enter on date cell during drag
   */
  const handleMouseEnter = useCallback((date: Date) => {
    const currentState = getDragState()
    if (currentState.assignmentId && currentState.startDate) {
      // MOVE mode - calculate offset from anchor date (where user clicked)
      if (currentState.mode === 'move' && currentState.moveSource && currentState.moveAnchor) {
        // Use daysDifference to avoid timezone issues
        const offset = daysDifference(currentState.moveAnchor, date)

        setContextDragState({
          ...currentState,
          endDate: date,
          moveOffset: offset,
        })
      } else {
        // CREATE or DELETE mode - just update end date
        setContextDragState({
          ...currentState,
          endDate: date,
        })
      }
    }
  }, [getDragState, setContextDragState])

  /**
   * Handle mouse up to complete drag and create assignments
   */
  const handleMouseUp = useCallback(() => {
    const dragState = getDragState()

    if (
      dragState.assignmentId &&
      dragState.startDate &&
      dragState.endDate
    ) {
      const start =
        dragState.startDate < dragState.endDate
          ? dragState.startDate
          : dragState.endDate
      const end =
        dragState.startDate > dragState.endDate
          ? dragState.startDate
          : dragState.endDate

      const daysDiff = Math.floor(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Handle MOVE mode
      if (dragState.mode === 'move' && dragState.moveSource && dragState.moveOffset !== undefined) {
        const offset = dragState.moveOffset

        // If offset is 0, no movement occurred - just clear drag state
        if (offset === 0) {
          setContextDragState({ assignmentId: null, startDate: null, endDate: null, mode: null })
          return
        }

        // Calculate new date range
        const newStartDate = addDaysToDateString(dragState.moveSource.startDate, offset)
        const newEndDate = addDaysToDateString(dragState.moveSource.endDate, offset)

        // Check if move mutation is available
        if (!moveAssignmentMutation) {
          console.error('Move mutation not provided to useDragAssignment')
          setContextDragState({ assignmentId: null, startDate: null, endDate: null, mode: null })
          return
        }

        // Get the assignment to check member and warnings
        const assignment = projectAssignments.find((pa: any) => pa.id === dragState.assignmentId)
        const warnWeekend = settings.warnWeekendAssignments !== 'false'

        // Check all dates in the new range for holidays and non-working days
        if (warnWeekend && assignment) {
          const holidays: string[] = []
          const nonWorkingDays: string[] = []
          const newStart = new Date(newStartDate)
          const newEnd = new Date(newEndDate)
          const newDaysDiff = Math.floor((newEnd.getTime() - newStart.getTime()) / (1000 * 60 * 60 * 24))

          for (let i = 0; i <= newDaysDiff; i++) {
            const date = addDays(newStart, i)

            if (isHoliday(date)) {
              const holidayName = getHolidayName(date)
              holidays.push(holidayName || format(date, 'MMM d'))
            } else if (isNonWorkingDay(assignment.teamMemberId, date)) {
              nonWorkingDays.push(format(date, 'MMM d'))
            }
          }

          // Show warning if there are holidays or non-working days
          if (holidays.length > 0 || nonWorkingDays.length > 0) {
            const member = members.find((m) => m.id === assignment.teamMemberId)
            const memberName = member ? `${member.firstName} ${member.lastName}` : 'this member'

            const message = (
              <>
                {holidays.length > 0 && (
                  <>
                    The following dates are holidays: <strong>{holidays.join(', ')}</strong>.{' '}
                  </>
                )}
                {nonWorkingDays.length > 0 && (
                  <>
                    The following dates are non-working days for {memberName}: <strong>{nonWorkingDays.join(', ')}</strong>.{' '}
                  </>
                )}
                Are you sure you want to move this assignment to these days?
              </>
            )

            setTimelineWarning({
              type: holidays.length > 0 ? 'holiday' : 'non-working-day',
              message,
              onConfirm: () => {
                // User confirmed, proceed with move
                moveAssignmentMutation.mutate({
                  projectAssignmentId: dragState.assignmentId!,
                  oldStartDate: dragState.moveSource!.startDate,
                  oldEndDate: dragState.moveSource!.endDate,
                  newStartDate,
                  newEndDate,
                })
                setTimelineWarning(null)
              },
              onSkip: () => {
                // User cancelled, don't move
                setTimelineWarning(null)
              },
            })

            // Clear drag state but don't move yet (waiting for confirmation)
            setContextDragState({ assignmentId: null, startDate: null, endDate: null, mode: null })
            return
          }
        }

        // No warnings needed, proceed with move
        moveAssignmentMutation.mutate({
          projectAssignmentId: dragState.assignmentId,
          oldStartDate: dragState.moveSource!.startDate,
          oldEndDate: dragState.moveSource!.endDate,
          newStartDate,
          newEndDate,
        })

        // Clear drag state
        setContextDragState({ assignmentId: null, startDate: null, endDate: null, mode: null })
        return
      }

      // Handle DELETE mode
      if (dragState.mode === 'delete') {
        // Collect day assignment IDs for all assigned dates in range
        const idsToDelete: number[] = []
        for (let i = 0; i <= daysDiff; i++) {
          const date = addDays(start, i)
          const dayAssignmentId = getDayAssignmentId(dragState.assignmentId, date)
          if (dayAssignmentId) {
            idsToDelete.push(dayAssignmentId)
          }
        }

        // Execute batch delete if we have IDs
        if (idsToDelete.length > 0) {
          deleteBatchDayAssignmentsMutation.mutate(idsToDelete)
        }

        // Clear drag state
        setContextDragState({ assignmentId: null, startDate: null, endDate: null, mode: null })
        return
      }

      // Get the assignment to check member and warnings
      const assignment = projectAssignments.find((pa: any) => pa.id === dragState.assignmentId)
      const warnWeekend = settings.warnWeekendAssignments !== 'false'

      // Check all dates in the range for holidays and non-working days
      if (warnWeekend && assignment) {
        const holidays: string[] = []
        const nonWorkingDays: string[] = []

        for (let i = 0; i <= daysDiff; i++) {
          const date = addDays(start, i)

          if (isHoliday(date)) {
            const holidayName = getHolidayName(date)
            holidays.push(holidayName || format(date, 'MMM d'))
          } else if (isNonWorkingDay(assignment.teamMemberId, date)) {
            nonWorkingDays.push(format(date, 'MMM d'))
          }
        }

        // Show warning if there are holidays or non-working days
        if (holidays.length > 0 || nonWorkingDays.length > 0) {
          const member = members.find((m) => m.id === assignment.teamMemberId)
          const memberName = member ? `${member.firstName} ${member.lastName}` : 'this member'

          // Build message with strong tags for dates
          const message = (
            <>
              {holidays.length > 0 && (
                <>
                  The following dates are holidays: <strong>{holidays.join(', ')}</strong>.{' '}
                </>
              )}
              {nonWorkingDays.length > 0 && (
                <>
                  The following dates are non-working days for {memberName}: <strong>{nonWorkingDays.join(', ')}</strong>.{' '}
                </>
              )}
              Are you sure you want to assign work on these days?
            </>
          )

          setTimelineWarning({
            type: holidays.length > 0 ? 'holiday' : 'non-working-day',
            message,
            onConfirm: () => {
              // User confirmed, create all assignments in batch including non-working days
              const dates: string[] = []
              for (let i = 0; i <= daysDiff; i++) {
                const date = addDays(start, i)
                dates.push(format(date, 'yyyy-MM-dd'))
              }
              createBatchDayAssignmentsMutation.mutate({
                projectAssignmentId: dragState.assignmentId!,
                dates,
              })
              setTimelineWarning(null)
            },
            onSkip: () => {
              // User chose to skip non-working days, filter them out
              const workingDates: string[] = []
              for (let i = 0; i <= daysDiff; i++) {
                const date = addDays(start, i)
                // Only include working days (skip holidays and non-working days)
                if (!isHoliday(date) && !isNonWorkingDay(assignment.teamMemberId, date)) {
                  workingDates.push(format(date, 'yyyy-MM-dd'))
                }
              }
              // Only create assignments if there are working days in the range
              if (workingDates.length > 0) {
                createBatchDayAssignmentsMutation.mutate({
                  projectAssignmentId: dragState.assignmentId!,
                  dates: workingDates,
                })
              }
              setTimelineWarning(null)
            },
          })

          // Clear drag state but don't create assignments yet (waiting for confirmation)
          setContextDragState({ assignmentId: null, startDate: null, endDate: null, mode: null })
          return
        }
      }

      // No warnings needed, create assignments directly in batch
      const dates: string[] = []
      for (let i = 0; i <= daysDiff; i++) {
        const date = addDays(start, i)
        dates.push(format(date, 'yyyy-MM-dd'))
      }
      createBatchDayAssignmentsMutation.mutate({
        projectAssignmentId: dragState.assignmentId,
        dates,
      })
    }

    setContextDragState({ assignmentId: null, startDate: null, endDate: null, mode: null })
  }, [getDragState, setContextDragState, projectAssignments, members, settings, isNonWorkingDay, setTimelineWarning, createBatchDayAssignmentsMutation, getDayAssignmentId, deleteBatchDayAssignmentsMutation, moveAssignmentMutation, dayAssignments])

  // Global mouseup listener to complete drag even if mouse leaves component
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      const currentState = getDragState()
      if (currentState.assignmentId) {
        handleMouseUp()
      }
    }

    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [getDragState, handleMouseUp])

  /**
   * Get current drag mode
   */
  const getDragMode = useCallback(() => {
    return getDragState().mode
  }, [getDragState])

  return {
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp,
    isDayInDragRange,
    getDragMode,
    canEditAssignment,
  }
}
