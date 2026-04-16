import { memo } from 'react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import {
  getAssignmentRoundedClass,
  getAssignmentBorderClass,
  getAssignmentWidthClass,
} from '@/lib/timeline-styling'
import {
  isPrevDayAssigned,
  isNextDayAssigned,
  isLastDayOfRange,
  isDayAssigned,
  addDaysToDateString,
} from '@/lib/timeline-helpers'
import type { ExpandedAssignmentBarProps } from './types'

/**
 * ExpandedAssignmentBar Component
 *
 * Renders a detailed assignment bar with priority indicators in expanded view.
 * Shows individual assignment bars with rounded corners, borders, and priority emojis.
 *
 * Priority indicators appear on the last day of each assignment range:
 * - High priority: 🔥
 * - Low priority: 🤷‍♂️
 * - Normal priority: (no indicator)
 *
 * Color logic:
 * - Orange if overlap detected
 * - Green otherwise
 * - Reduced opacity for tentative projects
 * - Faded during drag operations
 *
 * @param assignmentId - The ID of the project assignment
 * @param date - The date to render the bar for
 * @param projectAssignments - All project assignments
 * @param dayAssignments - All day assignments
 * @param project - The project this assignment belongs to
 * @param member - The member this assignment belongs to (for overlap calculation)
 * @param isDayInDragRange - Whether this day is being dragged
 * @param isAdmin - Whether the user is an admin
 * @param hasOverlap - Whether there's an overlap on this date
 * @param onMouseDown - Mouse down handler for drag operations
 * @param onClick - Click handler for editing
 * @param onContextMenu - Right-click handler for deletion
 * @param getGroupPriority - Function to get priority for a specific date
 */
function ExpandedAssignmentBarComponent({
  assignmentId,
  date,
  projectAssignments: _projectAssignments,
  dayAssignments,
  project,
  member,
  isDayInDragRange,
  dragMode,
  isAdmin,
  hasOverlap,
  onMouseDown,
  onClick,
  onContextMenu,
  getGroupPriority,
  isNonWorkingDay,
  isHoliday,
  dragState,
}: ExpandedAssignmentBarProps) {
  // Check if this day is assigned
  const isAssigned = isDayAssigned(dayAssignments, assignmentId, date)

  // MOVE mode visual logic
  const isBeingMoved =
    dragState?.mode === 'move' &&
    dragState.assignmentId === assignmentId &&
    dragState.moveSource &&
    format(date, 'yyyy-MM-dd') >= dragState.moveSource.startDate &&
    format(date, 'yyyy-MM-dd') <= dragState.moveSource.endDate

  const isMovePreview =
    dragState?.mode === 'move' &&
    dragState.assignmentId === assignmentId &&
    dragState.moveSource &&
    dragState.moveOffset !== undefined &&
    dragState.moveOffset !== 0 &&
    format(date, 'yyyy-MM-dd') >=
      addDaysToDateString(dragState.moveSource.startDate, dragState.moveOffset) &&
    format(date, 'yyyy-MM-dd') <=
      addDaysToDateString(dragState.moveSource.endDate, dragState.moveOffset)

  if (!isAssigned && !isDayInDragRange && !isMovePreview) {
    return null
  }

  // Don't render the bar during delete drag - only show red overlay
  if (isDayInDragRange && dragMode === 'delete') {
    return null
  }

  // Check adjacent days for styling
  const hasPrevDay = isPrevDayAssigned(dayAssignments, assignmentId, date)
  const hasNextDay = isNextDayAssigned(dayAssignments, assignmentId, date)
  const isLastDay = isLastDayOfRange(dayAssignments, assignmentId, date)

  // Get priority for this date
  const priority = isAssigned ? getGroupPriority(assignmentId, date) : 'normal'

  // Check if this date is a non-working day
  const isOnNonWorkingDay = isAssigned && (
    isHoliday(date) ||
    isNonWorkingDay(member.id, date)
  )

  // Determine color based on overlap
  const colorClasses = hasOverlap
    ? 'bg-orange-500/40 border-orange-400'
    : 'bg-confirmed border-emerald-400'

  // Dynamic height classes based on non-working day
  const heightClasses = isOnNonWorkingDay
    ? 'h-0 border-t-[2px]' // Thin line: zero height + 2px top border
    : 'h-5' // Normal height (20px)

  // Dynamic border classes
  const borderClasses = isOnNonWorkingDay
    ? 'border-t-[2px]' // Only top border for thin line
    : getAssignmentBorderClass(hasPrevDay, hasNextDay) // Full borders

  return (
    <div
      className={cn(
        heightClasses, // Dynamic height based on non-working day
        'shadow-sm relative z-20',
        getAssignmentWidthClass(hasNextDay),
        getAssignmentRoundedClass(hasPrevDay, hasNextDay),
        borderClasses, // Dynamic border classes
        colorClasses,
        project.status === 'tentative' && !hasOverlap && 'opacity-60',
        isDayInDragRange && dragMode === 'create' && 'opacity-50',
        // MOVE mode visuals
        isBeingMoved && 'opacity-40 border-dashed', // Ghost effect
        isMovePreview && 'opacity-100 ring-2 ring-primary ring-offset-1', // Preview highlight
        // Don't show opacity on bars during delete mode - only red overlay shows
        isAdmin && 'cursor-pointer'
      )}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{ pointerEvents: 'auto' }}
    >
      {/* Priority indicators - only show on last day of range and not on thin lines (no space) */}
      {isAssigned && isLastDay && !isOnNonWorkingDay && (
        <>
          {priority === 'high' && (
            <span className="absolute top-1/2 -translate-y-1/2 right-0 text-[9px] leading-none z-30 pointer-events-none">
              🔥
            </span>
          )}
          {priority === 'low' && (
            <span className="absolute top-1/2 -translate-y-1/2 right-0 text-[9px] leading-none z-30 pointer-events-none">
              🤷‍♂️
            </span>
          )}
        </>
      )}
    </div>
  )
}

// Memoize to prevent re-renders when props haven't changed.
// Requires stable handler references — see handleBarMouseDown/handleBarClick/handleBarContextMenu
// in AssignmentRow.tsx (curried useCallback factories).
export const ExpandedAssignmentBar = memo(ExpandedAssignmentBarComponent)
